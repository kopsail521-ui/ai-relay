import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function inputError(message, code = "invalid_multipart", status = 400) {
  return Object.assign(new Error(message), { code, status });
}

// Only complete MIME delimiter lines terminate binary parts. A boundary-like
// byte sequence inside an image is data, not a delimiter.
export function parseMultipart(buf, contentType, {
  maxParts = 64, maxFiles = 16, maxFileBytes = 20 * 1024 * 1024,
  maxTextBytes = 64 * 1024, maxTotalBytes = 32 * 1024 * 1024,
} = {}) {
  if (buf.length > maxTotalBytes) throw inputError("Multipart body exceeds size limit", "payload_too_large", 413);
  const matches = [...String(contentType).matchAll(/(?:^|;)\s*boundary=(?:"([^"\r\n]+)"|([^;,\s]+))/gi)];
  if (matches.length !== 1) throw inputError("Exactly one multipart boundary is required");
  const boundary = matches[0][1] || matches[0][2];
  if (!/^[\x20-\x7e]{1,70}$/.test(boundary) || boundary.endsWith(" ")) throw inputError("Invalid multipart boundary");
  const marker = Buffer.from(`--${boundary}`);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  if (!buf.subarray(0, marker.length).equals(marker)) throw inputError("Invalid multipart opening delimiter");
  const parts = [];
  let files = 0;
  let start = marker.length;
  while (true) {
    if (buf.subarray(start, start + 2).equals(Buffer.from("--"))) {
      const rest = buf.subarray(start + 2);
      if (rest.length && !rest.equals(Buffer.from("\r\n"))) throw inputError("Unexpected multipart trailing data");
      return parts;
    }
    if (!buf.subarray(start, start + 2).equals(Buffer.from("\r\n"))) throw inputError("Invalid multipart delimiter");
    start += 2;
    const headerEnd = buf.indexOf("\r\n\r\n", start);
    if (headerEnd < start || headerEnd - start > 8192) throw inputError("Invalid or oversized multipart headers");
    const headers = Object.create(null);
    for (const line of buf.subarray(start, headerEnd).toString("utf8").split("\r\n")) {
      const match = /^([a-z0-9-]+):[ \t]*([^\r\n]*)$/i.exec(line);
      if (!match || headers[match[1].toLowerCase()] !== undefined) throw inputError("Invalid or duplicate multipart header");
      headers[match[1].toLowerCase()] = match[2];
    }
    const disposition = headers["content-disposition"] || "";
    if (!/^form-data(?:;|$)/i.test(disposition)) throw inputError("Multipart form-data disposition required");
    const nameMatch = /(?:^|;)\s*name="([^"\r\n]+)"(?:;|$)/i.exec(disposition);
    const fileMatch = /(?:^|;)\s*filename="([^"\r\n]*)"(?:;|$)/i.exec(disposition);
    if (!nameMatch || /^(?:__proto__|constructor|prototype)$/.test(nameMatch[1])) throw inputError("Invalid multipart field name");
    if (headers["content-transfer-encoding"]) throw inputError("Multipart transfer encoding is unsupported");
    const bodyStart = headerEnd + 4;
    let end = bodyStart;
    while (true) {
      end = buf.indexOf(delimiter, end);
      if (end < 0) throw inputError("Missing multipart closing delimiter");
      const suffix = buf.subarray(end + delimiter.length, end + delimiter.length + 2).toString("ascii");
      if (suffix === "\r\n" || suffix === "--") break;
      end += delimiter.length;
    }
    const data = buf.subarray(bodyStart, end);
    const isFile = Boolean(fileMatch);
    if (isFile && ++files > maxFiles) throw inputError("Too many multipart files", "too_many_files");
    if (data.length > (isFile ? maxFileBytes : maxTextBytes)) throw inputError("Multipart field exceeds size limit", "payload_too_large", 413);
    if (parts.length >= maxParts) throw inputError("Too many multipart fields", "too_many_fields");
    parts.push({ field: nameMatch[1], filename: fileMatch?.[1], contentType: headers["content-type"] || "application/octet-stream", data });
    start = end + delimiter.length;
  }
}

export function parseImageBody(buf, contentType) {
  if (!/multipart\/form-data/i.test(contentType)) {
    try {
      const payload = JSON.parse(buf.toString("utf8"));
      if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error();
      return { payload, multipart: false };
    } catch { throw inputError("Image request must contain a JSON object or multipart form-data", "invalid_json"); }
  }
  const payload = Object.create(null);
  const images = [];
  for (const part of parseMultipart(buf, contentType)) {
    const field = part.field;
    if (part.filename !== undefined) {
      if (field === "mask") throw inputError("Binary mask is unsupported; supply mask as an HTTPS URL", "unsupported_binary_mask");
      if (!/^(?:image|images)(?:\[\])?$/.test(field)) throw inputError(`Unsupported image file field: ${field}`, "unsupported_file_field");
      const mime = part.contentType.toLowerCase().split(";")[0].trim();
      if (!/^image\/(?:png|jpeg|webp|gif|bmp)$/.test(mime)) throw inputError("Image files must be PNG, JPEG, WebP, GIF or BMP", "unsupported_media_type");
      if (!part.data.length) throw inputError("Empty image file", "image_required");
      images.push(`data:${mime};base64,${part.data.toString("base64")}`);
    } else {
      const text = new TextDecoder("utf-8", { fatal: true });
      let value;
      try { value = text.decode(part.data); } catch { throw inputError("Multipart text must be UTF-8"); }
      if (/^(?:image|images|image_urls)(?:\[\])?$/.test(field)) {
        images.push(value);
      } else {
        if (Object.hasOwn(payload, field)) throw inputError(`Duplicate multipart field: ${field}`, "duplicate_field");
        payload[field] = ["n", "stream", "async"].includes(field) ? parseScalar(value, field) : value;
      }
    }
  }
  if (images.length > 16) throw inputError("At most 16 reference images are accepted", "too_many_images");
  if (images.length) payload.images = images;
  return { payload, multipart: true };
}

function parseScalar(value, field) {
  if (field === "n" && /^\d+$/.test(value)) return Number(value);
  if (field !== "n" && /^(?:true|false)$/.test(value)) return value === "true";
  throw inputError(`Invalid multipart ${field}`, "invalid_parameter");
}

export async function validateUploadAuth(auth, upstream, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  if (!/^Bearer [^\s]+$/i.test(auth)) throw inputError("Missing or malformed Authorization: Bearer <api_key>", "invalid_api_key", 401);
  try {
    const response = await fetchImpl(`${upstream}/v1/models`, {
      headers: { authorization: auth, accept: "application/json" },
      redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw inputError("Invalid API key", "invalid_api_key", 401);
    }
    // /v1/models executes TokenAuth, unlike public model listings. Never accept
    // redirects, gateway errors, or an HTML login page as successful validation.
    if (response.status !== 200) { await response.body?.cancel(); throw new Error("auth status"); }
    const body = await readResponseLimited(response, 1024 * 1024);
    const payload = JSON.parse(body);
    if (payload.object !== "list" || !Array.isArray(payload.data) || payload.error) throw new Error("auth schema");
  } catch (error) {
    if (error.status === 401) throw error;
    throw inputError("API key validation is temporarily unavailable", "auth_unavailable", 503);
  }
}

async function readResponseLimited(response, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("auth response too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function storageErrorCode(error) {
  return ["ENOSPC", "EDQUOT"].includes(error.code) ? "storage_insufficient" : "storage_unavailable";
}
export function checkStorageSpace(dir, bytes, fsImpl = fs) {
  if (typeof fsImpl.statfsSync !== "function") return;
  let stats;
  try { stats = fsImpl.statfsSync(dir); } catch (error) {
    if (["ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EINVAL"].includes(error.code)) return;
    throw error;
  }
  const free = Number(stats.bsize) * Number(stats.bavail);
  if (Number.isFinite(free) && free < bytes + 64 * 1024 * 1024) {
    throw Object.assign(new Error("Upload storage reserve exhausted"), { code: "ENOSPC" });
  }
}

export function checkUploadStorage(dir, fsImpl = fs) {
  // Exclusive, tiny write/read/remove probe. Only this random probe is removed.
  const probe = path.join(dir, `.health-${crypto.randomUUID()}`);
  let created = false;
  try {
    fsImpl.mkdirSync(dir, { recursive: true });
    checkStorageSpace(dir, 1, fsImpl);
    fsImpl.writeFileSync(probe, Buffer.from("1"), { flag: "wx", mode: 0o600 });
    created = true;
    if (!fsImpl.readFileSync(probe).equals(Buffer.from("1"))) throw new Error("Storage readback failed");
    return { ok: true };
  } catch (error) { return { ok: false, code: storageErrorCode(error), reason: error.code || "readback_failed" }; }
  finally { if (created) { try { fsImpl.unlinkSync(probe); } catch { /* Report later writes independently. */ } } }
}

export function decodeBase64Upload(value) {
  if (typeof value !== "string") throw inputError("file_base64 must be a string", "invalid_base64");
  const encoded = value.replace(/^data:[^;,]+;base64,/, "");
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw inputError("Invalid base64", "invalid_base64");
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64") !== encoded) throw inputError("Invalid base64", "invalid_base64");
  return decoded;
}
