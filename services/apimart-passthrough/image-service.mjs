import { normalizeImageRequest, extractImageResult, is4KSize } from "./image-contracts.mjs";
import { ImageError, imageClientIp } from "./image-ledger.mjs";

const SUCCESS = new Set(["succeeded", "success", "completed", "done"]);
const FAILURE = new Set(["failed", "violation", "rejected", "cancelled", "canceled", "error"]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ImageService {
  constructor({ ledger, models, origin, key, aicopyOrigin = "https://api.aicopy.top", aicopyKey = "", fetchImpl = fetch, pollIntervalMs = 5000, waitMs = 180000, transportMs = 60000, trustedProxies = "", maxBodyBytes = 32 * 1024 * 1024 }) {
    this.ledger = ledger; this.models = models;
    this.origin = (origin || "").replace(/\/$/, "");
    this.key = key;
    this.aicopyOrigin = (aicopyOrigin || "").replace(/\/$/, "");
    this.aicopyKey = aicopyKey || "";
    this.fetch = fetchImpl;
    this.pollIntervalMs = pollIntervalMs; this.waitMs = waitMs; this.transportMs = transportMs; this.trustedProxies = trustedProxies; this.maxBodyBytes = maxBodyBytes;
    this.jobs = new Map(); this.stopped = false;
  }
  error(res, e, id) {
    return this.send(res, e.status || 503, { error: { message: e.status ? e.message : "Image task service temporarily unavailable", type: e.status === 400 ? "invalid_request_error" : "server_error", code: e.code || "image_service_unavailable", ...(e.param ? { param: e.param } : {}), ...(id ? { task_id: id } : {}) } });
  }
  send(res, status, body, deliveryId) {
    if (res.destroyed || res.writableEnded) return;
    const data = JSON.stringify(body);
    // This acknowledges delivery to the immediate HTTP consumer (normally the
    // moderation proxy). It cannot prove that a downstream end user received it.
    // The stored result remains replayable without an additional charge.
    if (deliveryId) res.once("finish", () => {
      try { this.ledger.acknowledge(deliveryId); }
      catch { console.error(`[image] settlement pending task=${deliveryId}`); }
    });
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data), "Access-Control-Allow-Origin": "*", ...(body.task_id ? { "X-Image-Task-ID": body.task_id, Location: `/v1/images/tasks/${body.task_id}` } : {}) });
    res.end(data);
  }
  pending(res, row) {
    return this.send(res, 202, { id: row.id, task_id: row.id, status: row.state === "ready" ? "succeeded" : row.state, result_url: `/v1/images/tasks/${row.id}`, billing: { charged: !!row.charged, reserved_quota: row.reserved ? row.quota : 0, reservation_expires_at: row.reserved ? row.reserved_until : null } });
  }
  delivery(res, row) {
    if (row.state === "failed" || row.state === "submit_unknown") return this.error(res, new ImageError(502, row.error_code || "image_generation_failed", row.state === "submit_unknown" ? "Submission outcome unknown; do not resubmit. Contact support with task_id." : "Image generation failed; no image was charged."), row.id);
    if (row.state !== "ready") return this.pending(res, row);
    const deliverable = this.ledger.prepareDelivery(row.id);
    const result = JSON.parse(deliverable.result);
    if (!Array.isArray(result.data) || !result.data.length) throw new ImageError(503, "image_result_unavailable", "Stored image result unavailable");
    return this.send(res, 200, { ...result, id: row.id, task_id: row.id, status: "succeeded", billing: { quota: row.quota, charged: !!row.charged } }, row.id);
  }
  async transport(path, method, body, originOverride, keyOverride) {
    // Never forward client credentials, routing/idempotency headers or unrelated
    // proxy headers to the native provider. The local ledger owns idempotency.
    const origin = (originOverride || this.origin).replace(/\/$/, "");
    const key = keyOverride || this.key;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.transportMs);
    try {
      const response = await this.fetch(`${origin}${path}`, {
        method, signal: controller.signal, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const chunks = []; let bytes = 0;
      if (response.body) {
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > this.maxBodyBytes) { controller.abort(); throw new Error("upstream response exceeds limit"); }
          chunks.push(Buffer.from(chunk));
        }
      }
      const text = Buffer.concat(chunks).toString("utf8");
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: response.status, payload: json };
    } finally { clearTimeout(timeout); }
  }
  acceptResult(row, up) {
    // A polling transport error leaves the existing upstream task running.
    if (up.status < 200 || up.status >= 300 || !up.payload) return false;
    const result = extractImageResult(up.payload);
    if (FAILURE.has(result.status)) {
      this.ledger.failed(row.id, result.status === "violation" ? "image_policy_rejected" : "image_generation_failed");
      return true;
    }
    if (SUCCESS.has(result.status)) {
      if (!result.urls.length) this.ledger.failed(row.id, "image_result_missing");
      else this.ledger.ready(row.id, { created: row.created_at, data: result.urls.map((url) => ({ url })) });
      return true;
    }
    return false;
  }
  startJob(row, native) {
    if (this.jobs.has(row.id)) return this.jobs.get(row.id);
    const work = (async () => {
      const isAicopy = row.using_group === "GPT-Image-Pro";
      if (isAicopy) {
        if (native) {
          const lease = Math.ceil(this.transportMs / 1000) + 30;
          if (!this.ledger.submitting(row.id, lease)) return;
          const aicopyBody = {
            model: native.model,
            prompt: native.prompt,
            size: native.aspectRatio || native.size || "1024x1024",
            ...(native.quality ? { quality: native.quality } : {}),
            ...(native.background ? { background: native.background } : {}),
            ...(native.images && native.images.length ? { images: native.images } : {}),
          };
          let up;
          try {
            up = await this.transport("/v1/images/generations", "POST", aicopyBody, this.aicopyOrigin, this.aicopyKey);
          } catch {
            this.ledger.failed(row.id, "image_submission_unknown", "submit_unknown");
            return;
          }
          const result = extractImageResult(up.payload);
          if (up.status >= 200 && up.status < 300 && result.urls.length) {
            const upId = `aicopy_${crypto.randomUUID()}`;
            this.ledger.submitted(row.id, upId);
            this.ledger.ready(row.id, { created: up.payload?.created || row.created_at, data: result.urls.map((url) => ({ url })) });
            return;
          }
          if (FAILURE.has(result.status) || (up.status >= 400 && up.status < 500)) {
            this.ledger.failed(row.id, result.status === "violation" ? "image_policy_rejected" : "image_submission_rejected");
            return;
          }
          this.ledger.failed(row.id, "image_generation_failed");
          return;
        }
        return;
      }
      if (native) {
        const lease = Math.ceil(this.transportMs / 1000) + 30;
        if (!this.ledger.submitting(row.id, lease)) return;
        let up;
        try { up = await this.transport("/v1/api/generate", "POST", native); }
        catch { this.ledger.failed(row.id, "image_submission_unknown", "submit_unknown"); return; }
        const id = up.payload?.id || up.payload?.task_id || up.payload?.data?.id || up.payload?.data?.task_id;
        const result = extractImageResult(up.payload);
        if (FAILURE.has(result.status) || (up.status >= 400 && up.status < 500)) {
          this.ledger.failed(row.id, result.status === "violation" ? "image_policy_rejected" : "image_submission_rejected");
          return;
        }
        if (!id || up.status < 200 || up.status >= 300) {
          this.ledger.failed(row.id, "image_submission_unknown", "submit_unknown"); return;
        }
        // Durable upstream ID comes before any terminal result or client response.
        this.ledger.submitted(row.id, String(id));
        row = this.ledger.get(row.id);
        if (this.acceptResult(row, up)) return;
      }
      while (!this.stopped) {
        row = this.ledger.get(row.id);
        if (row.state !== "running" || !row.upstream_id) return;
        try {
          const up = await this.transport(`/v1/api/result?id=${encodeURIComponent(row.upstream_id)}`, "GET");
          if (this.acceptResult(row, up)) return;
        } catch { /* transient poll failure, never another POST */ }
        await delay(this.pollIntervalMs);
      }
    })().catch(() => {
      // Any storage failure leaves the durable row for recovery; never submit
      // again after an uncertain write. Do not expose internal provider details.
      console.error(`[image] task recovery required task=${row.id}`);
    }).finally(() => this.jobs.delete(row.id));
    this.jobs.set(row.id, work);
    return work;
  }
  async readJson(req) {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > this.maxBodyBytes) throw new ImageError(413, "image_body_too_large", "Image request body exceeds limit");
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ImageError(400, "invalid_json", "Invalid JSON body"); }
  }
  async handle(req, res, bodyOverride) {
    let id;
    try {
      const apiKey = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""))?.[1]?.trim() || "";
      const ip = imageClientIp(req, this.trustedProxies);
      const pathname = String(req.url || "").split("?")[0];
      const match = /^\/v1\/images\/tasks\/(img_[\w-]+)$/.exec(pathname);
      if (match) {
        if (req.method !== "GET") throw new ImageError(405, "method_not_allowed", "Use GET to query an image task");
        id = match[1];
        const auth = this.ledger.authenticate(apiKey, null, ip, true);
        const row = this.ledger.get(id, auth);
        this.ledger.authenticate(apiKey, row.model, ip, true);
        if (row.state === "running") this.startJob(row);
        return this.delivery(res, row);
      }
      if (req.method !== "POST") throw new ImageError(405, "method_not_allowed", "Use POST to generate images");
      const body = bodyOverride || await this.readJson(req);
      const meta = this.models[body?.model];
      const normalized = normalizeImageRequest(body?.model, body);
      if (!meta || meta.kind !== "image") throw new ImageError(400, "image_model_unsupported", "Image model unavailable");
      if (!this.key) throw new ImageError(503, "image_service_unavailable", "Image service temporarily unavailable");
      const is4k = is4KSize(normalized.request.aspectRatio || body.size || body.resolution);
      const { row, fresh } = this.ledger.reserve({ apiKey, model: meta.id, requestHash: normalized.requestHash, idempotencyKey: req.headers["idempotency-key"], ip, origin: this.origin, is4k });
      id = row.id;
      const job = this.startJob(row, fresh ? { ...normalized.request, model: meta.upstream_model || meta.id, replyType: "async" } : undefined);
      if (normalized.replyType === "async") return ["ready", "failed", "submit_unknown"].includes(row.state) ? this.delivery(res, row) : this.pending(res, row);
      // Bound the HTTP wait, not the lifetime of the persistent task. Disconnect
      // ends this wait while generation continues with the same durable ID.
      let closeHandler, timer;
      await Promise.race([
        job,
        new Promise((resolve) => { timer = setTimeout(resolve, this.waitMs); }),
        new Promise((resolve) => { closeHandler = resolve; res.once("close", closeHandler); }),
      ]);
      clearTimeout(timer);
      res.removeListener("close", closeHandler);
      return this.delivery(res, this.ledger.get(id));
    } catch (e) { return this.error(res, e, id); }
  }
  recover() {
    if (this.stopped) return;
    try { for (const row of this.ledger.recoverable()) this.startJob(row); }
    catch { console.error("[image] recovery unavailable; image submissions fail closed"); }
  }
  startRecovery(intervalMs = 30000) {
    this.recover();
    this.recoveryTimer = setInterval(() => this.recover(), intervalMs);
    this.recoveryTimer.unref();
  }
  stop() { this.stopped = true; clearInterval(this.recoveryTimer); }
}
