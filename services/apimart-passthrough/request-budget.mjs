// Each gateway has its own Docker build context; keep the native copy in sync.
import fs from "node:fs";

export function resourceError(status = 503, code = "request_capacity_exceeded") {
  return Object.assign(new Error(status === 413 ? "Request body exceeds the size limit" : "Request capacity is temporarily exhausted. Retry later; this request was not submitted."), { status, code });
}

function availableBytes() {
  try {
    const available = Number(/^MemAvailable:\s+(\d+)/m.exec(fs.readFileSync("/proc/meminfo", "utf8"))?.[1]) * 1024;
    return Number.isFinite(available) ? available : Infinity;
  } catch { return Infinity; }
}

function cgroupAvailable() {
  try {
    const max = Number(fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8'));
    const current = Number(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8'));
    return Number.isFinite(max) ? Math.max(0, max - current) : Infinity;
  } catch { return Infinity; }
}

export class RequestBudget {
  constructor({ maxBytes = 32 * 1024 * 1024, maxRequests = 8, reserveBytes = 96 * 1024 * 1024, available = availableBytes, processAvailable = cgroupAvailable } = {}) {
    if (![maxBytes, maxRequests, reserveBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("Invalid request budget");
    this.maxBytes = maxBytes; this.maxRequests = maxRequests; this.reserveBytes = reserveBytes; this.available = available; this.processAvailable = processAvailable;
    this.bytes = 0; this.requests = 0;
  }
  acquire() {
    if (this.requests >= this.maxRequests) throw resourceError();
    this.requests++;
    let bytes = 0, released = false;
    const grow = size => {
      const extra = Math.max(0, size - bytes);
      // JSON strings, decoded media and forwarding can coexist with the body.
      // Check before retaining another chunk, and leave memory for the host.
      if (!Number.isSafeInteger(size) || size < 0 || released || this.bytes + extra > this.maxBytes || this.available() < this.reserveBytes + 4 * extra || this.processAvailable() < 16 * 1024 * 1024 + 4 * extra) throw resourceError();
      this.bytes += extra; bytes += extra;
    };
    const release = () => {
      if (released) return;
      released = true; this.bytes -= bytes; this.requests--;
    };
    return { grow, release, read: async (req, maxBytes) => {
      const declared = Number(req.headers["content-length"] || 0);
      if (declared > maxBytes) { req.resume(); throw resourceError(413, "payload_too_large"); }
      if (declared > this.maxBytes) { req.resume(); throw Object.assign(resourceError(413, 'request_body_budget_exceeded'), { message: `Buffered request exceeds ${this.maxBytes} bytes. Use smaller files or an existing media URL.` }); }
      grow(declared);
      const chunks = []; let size = 0;
      const timeout = () => req.destroy(new Error("Request body timed out"));
      req.setTimeout?.(30000, timeout);
      try {
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          size += chunk.length;
          if (size > maxBytes) { req.resume(); throw resourceError(413, "payload_too_large"); }
          if (size > this.maxBytes) { req.resume(); throw Object.assign(resourceError(413, 'request_body_budget_exceeded'), { message: `Buffered request exceeds ${this.maxBytes} bytes. Use smaller files or an existing media URL.` }); }
          try { grow(size); } catch (error) { req.resume(); throw error; }
          chunks.push(chunk);
        }
        return Buffer.concat(chunks, size);
      } finally { req.setTimeout?.(0); req.removeListener?.("timeout", timeout); }
    } };
  }
  health() { return { active_requests: this.requests, buffered_bytes: this.bytes, max_requests: this.maxRequests, max_buffered_bytes: this.maxBytes }; }
}
