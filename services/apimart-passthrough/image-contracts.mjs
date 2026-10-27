import crypto from "node:crypto";

const GPT_BASE_SIZES = new Set(["1024x1024", "1672x941", "941x1672", "1443x1090", "1090x1443", "1536x1024", "1024x1536", "1408x1120", "1120x1408", "1920x832", "832x1920", "896x1792", "1792x896"]);
const GPT_HIGH_SIZES = new Set([
  "1024x1024", "2048x2048", "2880x2880", "1280x720", "2048x1152", "3840x2160",
  "720x1280", "1152x2048", "2160x3840", "1152x864", "2304x1728", "3264x2448",
  "864x1152", "1728x2304", "2448x3264", "1536x1024", "2048x1360", "3504x2336",
  "1024x1536", "1360x2048", "2336x3504", "1120x896", "2240x1792", "3200x2560",
  "896x1120", "1792x2240", "2560x3200", "1456x624", "2912x1248", "3840x1648",
  "624x1456", "1248x2912", "1648x3840", "688x2048", "1280x3840", "2048x688",
  "3840x1280", "1536x768", "3072x1536", "3840x1920", "768x1536", "1536x3072", "1920x3840",
]);
// gpt-image-2 is a multi-tier model: every documented 1K base size plus the
// 2K/4K high sizes (default group stays 1K, GPT-Image-Pro accepts all).
const GPT_ALL_SIZES = new Set([...GPT_BASE_SIZES, ...GPT_HIGH_SIZES]);
const GPT_RATIOS = new Set(["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "9:21", "1:2", "2:1"]);
const NANO_RATIOS = new Set([
  "auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9",
  "1:4", "4:1", "1:8", "8:1",
]);
const NANO_SIZES = new Set(["1K", "2K", "4K"]);
const GPT_QUALITY = {
  "gpt-image-2": new Set(["auto"]),
  "gpt-image-2.5": new Set(["auto"]),
  "gpt-image-2-vip": new Set(["medium"]),
  "gpt-image-2.5-flare": new Set(["low", "medium", "high"]),
  "gpt-image-2.5-sunburst": new Set(["low", "medium", "high", "xhigh", "max"]),
};
const IMAGE_MODELS = new Set([
  "gpt-image-2", "gpt-image-2-vip", "gpt-image-2.5", "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst", "nano-banana-2", "nano-banana-2.1", "nano-banana-pro",
]);

function invalid(message, param) {
  const e = new Error(message);
  e.status = 400;
  e.type = "invalid_request_error";
  e.param = param;
  return e;
}

function asString(value, param) {
  if (typeof value !== "string" || !value.trim()) throw invalid(`${param} must be a non-empty string`, param);
  return value.trim();
}

function validateDataUrl(value, param) {
  const match = /^data:(image\/(?:png|jpe?g|webp|gif|bmp|avif));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || match[2].length % 4 === 1) throw invalid(`${param} must be a valid image URL or base64 data URL`, param);
  try {
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > 20 * 1024 * 1024 || bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "") || (match[2].includes("=") && bytes.toString("base64") !== match[2])) throw new Error("base64");
  } catch {
    throw invalid(`${param} must contain valid base64 image data`, param);
  }
  return value;
}

function validateImageRef(value, param) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) value = value.url;
  if (typeof value !== "string" || !value.trim()) throw invalid(`${param} contains an invalid image reference`, param);
  const ref = value.trim();
  if (/^https?:\/\//i.test(ref)) {
    try { const url = new URL(ref); if (!url.hostname || url.username || url.password) throw new Error(); return ref; } catch { throw invalid(`${param} contains an invalid URL`, param); }
  }
  if (/^data:/i.test(ref)) return validateDataUrl(ref, param);
  // Raw base64 is part of the native reference contract. Require canonical bytes
  // and an image signature so an accidental URL/filename cannot become base64.
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(ref)) {
    validateDataUrl(`data:image/png;base64,${ref}`, param);
    const bytes = Buffer.from(ref, "base64");
    const image = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) || /^GIF8[79]a/.test(bytes.toString("ascii", 0, 6)) ||
      (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") || bytes.toString("ascii", 0, 2) === "BM";
    if (image) return ref;
  }
  throw invalid(`${param} only accepts HTTP(S) URLs or valid image base64`, param);
}

function collectRefs(body) {
  const found = [];
  const fields = ["images", "image_urls", "image_url", "image"];
  for (const field of fields) {
    if (!(field in body)) continue;
    const value = body[field];
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) found.push(validateImageRef(item, field));
  }
  return found;
}

function pickAlias(body, names, param) {
  const present = names.filter((name) => body[name] !== undefined && body[name] !== null && body[name] !== "");
  if (!present.length) return "";
  const values = present.map((name) => String(body[name]).trim());
  if (new Set(values).size > 1) throw invalid(`${param} aliases disagree`, param);
  return values[0];
}

function validatePixels(value, model) {
  const m = /^(\d{3,4})x(\d{3,4})$/i.exec(value);
  if (!m) throw invalid(`Invalid size "${value}" for ${model}`, "size");
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (model === "gpt-image-2") {
    // gpt-image-2 is a multi-tier model (default 1K, GPT-Image-Pro native
    // 1K/2K/4K, GPT-Image-HD async 1K/2K/4K): accept all documented sizes.
    if (!GPT_ALL_SIZES.has(`${w}x${h}`)) throw invalid(`Unsupported size "${value}" for ${model}; use a documented 1K/2K/4K pixel size`, "size");
    return `${w}x${h}`;
  }
  if (model === "gpt-image-2.5") {
    if (!GPT_BASE_SIZES.has(`${w}x${h}`)) throw invalid(`Unsupported 1K size "${value}" for ${model}; use a supported 1K size or aspect ratio`, "size");
    return `${w}x${h}`;
  }
  if (model !== "gpt-image-2-vip") {
    if (!GPT_HIGH_SIZES.has(`${w}x${h}`)) throw invalid(`Unsupported size "${value}" for ${model}; use a documented 1K/2K/4K pixel size`, "size");
    return `${w}x${h}`;
  }
  if (Math.max(w, h) > 3840 || w % 16 || h % 16 || Math.max(w, h) / Math.min(w, h) > 3 || w * h < 655360 || w * h > 8294400) {
    throw invalid(`Unsupported size "${value}" for ${model}; edges must be multiples of 16, longest edge <=3840, ratio <=3:1, and 655360-8294400 pixels`, "size");
  }
  return `${w}x${h}`;
}

function normalizedOptions(model, body) {
  const nano = model.startsWith("nano-banana");
  let sizeAlias = pickAlias(body, nano ? ["size"] : ["size", "resolution"], "size");
  const aspect = pickAlias(body, ["aspectRatio", "aspect_ratio"], "aspectRatio");
  const imageSize = pickAlias(body, nano ? ["imageSize", "image_size", "resolution"] : ["imageSize", "image_size"], "imageSize");
  const quality = body.quality == null ? "" : asString(body.quality, "quality").toLowerCase();
  const background = body.background == null ? "" : asString(body.background, "background").toLowerCase();
  const mask = body.mask;

  if (body.n !== undefined && (body.n !== 1 && body.n !== "1")) throw invalid("n is not supported; only n=1 is accepted", "n");
  if (body.response_format !== undefined && body.response_format !== "url") throw invalid("response_format only supports url; b64_json is not supported", "response_format");
  if (body.stream !== undefined && body.stream !== false) throw invalid("stream is not supported for image generation", "stream");
  if (body.replyType !== undefined && !["async", "json"].includes(String(body.replyType).toLowerCase())) throw invalid("replyType must be async or json", "replyType");

  if (nano) {
    if (sizeAlias) {
      if (/^\d+[xX]\d+$/.test(sizeAlias)) throw invalid(`Nano models use imageSize and aspectRatio; pixel size is not supported`, "size");
      if (!NANO_RATIOS.has(sizeAlias)) throw invalid(`Unsupported aspectRatio/size "${sizeAlias}" for ${model}`, "size");
    }
    if (aspect && !NANO_RATIOS.has(aspect)) throw invalid(`Unsupported aspectRatio "${aspect}" for ${model}`, "aspectRatio");
    if (model === "nano-banana-pro" && ["1:4", "4:1", "1:8", "8:1"].includes(aspect || sizeAlias)) throw invalid(`Unsupported aspectRatio for ${model}`, "aspectRatio");
    if (sizeAlias && aspect && sizeAlias !== aspect) throw invalid("size and aspectRatio disagree", "aspectRatio");
    if (imageSize && !NANO_SIZES.has(imageSize.toUpperCase())) throw invalid(`imageSize must be 1K, 2K, or 4K for ${model}`, "imageSize");
    if (quality) throw invalid(`quality is not supported for ${model}`, "quality");
    if (background) throw invalid(`background is not supported for ${model}`, "background");
    if (mask !== undefined) throw invalid(`mask is not supported for ${model}`, "mask");
    return {
      ...(sizeAlias || aspect ? { aspectRatio: aspect || sizeAlias } : {}),
      ...(imageSize ? { imageSize: imageSize.toUpperCase() } : {}),
    };
  }

  if (imageSize) throw invalid(`imageSize is only supported by Nano models`, "imageSize");
  if (!nano && sizeAlias) {
    const sUpper = sizeAlias.toUpperCase();
    if (sUpper === "4K") sizeAlias = "3840x2160";
    else if (sUpper === "2K") sizeAlias = "2048x2048";
    else if (sUpper === "1K") sizeAlias = "1024x1024";
  }
  const high = !["gpt-image-2", "gpt-image-2.5"].includes(model);
  if (aspect && !GPT_RATIOS.has(aspect) && !/^\d+x\d+$/i.test(aspect)) throw invalid(`Unsupported aspectRatio "${aspect}" for ${model}`, "aspectRatio");
  if (aspect && /^\d+x\d+$/i.test(aspect)) validatePixels(aspect, model);
  if (high && (sizeAlias || aspect) !== "auto" && GPT_RATIOS.has(sizeAlias || aspect)) throw invalid(`${model} requires pixel size, not a ratio`, "size");
  if (sizeAlias) {
    const isRatio = GPT_RATIOS.has(sizeAlias);
    if (!isRatio) validatePixels(sizeAlias, model);
    if (aspect && aspect !== sizeAlias) throw invalid("size and aspectRatio disagree", "aspectRatio");
  }
  const size = sizeAlias || aspect;
  const allowedQuality = GPT_QUALITY[model];
  if (quality && !allowedQuality.has(quality)) throw invalid(`Unsupported quality "${quality}" for ${model}`, "quality");
  if (background && (!high || background !== "transparent")) throw invalid(`background only supports transparent for VIP/flare/sunburst`, "background");
  if (mask !== undefined) {
    if (typeof mask !== "string" || !/^https?:\/\//i.test(mask.trim())) throw invalid("mask only accepts an HTTP(S) URL; binary/base64 masks must be uploaded to an authorized URL first", "mask");
    validateImageRef(mask, "mask");
  }
  return {
    ...(size ? { aspectRatio: size } : {}),
    ...(quality ? { quality } : {}),
    ...(background ? { background } : {}),
    ...(mask !== undefined ? { mask: mask.trim() } : {}),
  };
}

export function normalizeImageRequest(model, body) {
  if (!IMAGE_MODELS.has(model)) throw invalid(`Model ${model} does not support native image generation`, "model");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("JSON body must be an object", "body");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : typeof body.text === "string" ? body.text.trim() : "";
  if (!prompt) throw invalid("prompt is required", "prompt");
  const images = collectRefs(body);
  const options = normalizedOptions(model, body);
  const request = { model, prompt, ...options, ...(images.length ? { images } : {}) };
  const replyType = (pickAlias(body, ["replyType", "response_type"], "replyType") || "json").toLowerCase();
  if (!["json", "async"].includes(replyType)) throw invalid("replyType must be async or json", "replyType");
  return { request, images, replyType, requestHash: crypto.createHash("sha256").update(JSON.stringify(request)).digest("hex") };
}

function validOutput(value) {
  if (typeof value !== "string" || !value) return "";
  if (/^https?:\/\//i.test(value)) {
    try { const url = new URL(value); if (url.hostname && !url.username && !url.password) return value; } catch {}
  }
  if (/^data:image\//i.test(value)) { try { return validateDataUrl(value, "result"); } catch {} }
  return "";
}

export function extractImageResult(payload) {
  if (!payload || typeof payload !== "object") return { status: "unknown", urls: [], error: "invalid upstream response" };
  const status = String(payload.status || payload.data?.status || payload.task_status || "").toLowerCase();
  const businessError = payload.success === false || Number(payload.code) >= 400 || payload.error;
  const urls = [];
  const visit = (node, depth = 0) => {
    if (depth > 5 || node == null) return;
    if (Array.isArray(node)) return node.forEach((v) => visit(v, depth + 1));
    if (typeof node === "string") { const out = validOutput(node); if (out) urls.push(out); return; }
    if (typeof node !== "object") return;
    for (const key of ["url", "image_url", "image", "b64_json"]) {
      const value = node[key];
      if (key === "b64_json" && typeof value === "string" && value) {
        const out = validOutput(`data:image/png;base64,${value}`);
        if (out) urls.push(out);
      }
      else if (typeof value === "string") {
        const out = validOutput(value);
        if (out) urls.push(out);
      }
    }
    for (const key of ["results", "result", "output", "images", "data"]) if (node[key] !== undefined) visit(node[key], depth + 1);
  };
  visit(payload.results ?? payload.result ?? payload.output ?? payload.data);
  return {
    status: businessError && status !== "violation" ? "failed" : status,
    urls: [...new Set(urls)],
    error: payload.error?.message || payload.message || payload.fail_reason || "",
    costUsd: payload.price_usd ?? payload.data?.price_usd ?? payload.cost ?? payload.data?.cost ?? null,
  };
}

export function imageModels() { return new Set(IMAGE_MODELS); }

export function is4KSize(size) {
  if (!size) return false;
  const s = String(size).toLowerCase().trim();
  if (s === "4k" || s.endsWith("4k")) return true;
  const m = s.match(/^(\d{3,4})[x*](\d{3,4})$/);
  if (m) {
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    if (w >= 2880 || h >= 2880 || (w * h >= 6000000)) return true;
  }
  return false;
}
