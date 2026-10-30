/**
 * Creem Moderation proxy — screens image prompts before New API.
 * Enriches public model metadata and serves scoped marketplace UI patches.
 * Also hosts POST /v1/uploads (+ /v1/files) → public /uploads/{id}.ext URLs
 * for Path B video / OCR reference media (local files → https).
 *
 * Env:
 *   UPSTREAM_URL=http://127.0.0.1:3000
 *   CREEM_API_KEY=creem_test_... or creem_...
 *   CREEM_TEST_MODE=true|false
 *   PORT=3001
 *   LISTEN_HOST=127.0.0.1
 *   UPLOAD_DIR=/opt/ai-relay/static/uploads
 *   UPLOAD_PUBLIC_BASE=https://www.keyoapi.xyz/uploads
 *   UPLOAD_MAX_BYTES=104857600
 *   UPLOAD_TTL_HOURS=48
 */
import http from "http";
import { RequestBudget } from "./request-budget.mjs";
import { looksLikeMissingVideo } from "./video-routing.mjs";
import { normalizePublicModelMetadata } from "./public-model-metadata.mjs";
import { parseMultipart, parseImageBody, validateUploadAuth, checkStorageSpace, checkUploadStorage, storageErrorCode, decodeBase64Upload } from "./media-input.mjs";
import { URL } from "url";
import zlib from "zlib";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "url";

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const brotliDecompress = promisify(zlib.brotliDecompress);

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.LISTEN_HOST || "127.0.0.1";
const UPSTREAM = (process.env.UPSTREAM_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const CREEM_KEY = process.env.CREEM_API_KEY || "";
const TEST_MODE = String(process.env.CREEM_TEST_MODE || "true").toLowerCase() !== "false";
const CREEM_BASE = TEST_MODE ? "https://test-api.creem.io" : "https://api.creem.io";
const TIMEOUT_MS = Number(process.env.CREEM_MODERATION_TIMEOUT_MS || 5000);

const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../static/uploads")
);
const UPLOAD_PUBLIC_BASE = (
  process.env.UPLOAD_PUBLIC_BASE || "https://www.keyoapi.xyz/uploads"
).replace(/\/$/, "");
const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 104857600);
const UPLOAD_TTL_MS =
  Number(process.env.UPLOAD_TTL_HOURS || 48) * 3600 * 1000;
// Cap for ALL proxied request bodies (chat, multipart document parse, ASR...).
// Unbounded buffering OOM-stalls the 1GB VPS on large PDF uploads: the client
// sees a hang/timeout with no task id instead of a clean error.
const PROXY_MAX_BODY_BYTES = Number(
  process.env.PROXY_MAX_BODY_BYTES || 134217728
);

const UPLOAD_EXT_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
};

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
  "application/pdf": ".pdf",
};

const IMAGE_PATHS = new Set([
  "/v1/images/generations",
  "/v1/images/edits",
  "/v1/images/variations",
]);

/** wan / Seedance / grok-imagine 等：POST /v1/videos 自动转到 :3011 */
const VIDEO_GEN = (process.env.VIDEO_GEN_URL || "http://127.0.0.1:3011").replace(
  /\/$/,
  ""
);
const VIDEO_GEN_FALLBACK = [
  "gemini-omni-1.1-flash",
  "gemini-omni-1.1-flash-ext",
  "flux-3-video",
  "MiniMax-H3",
  "wan3.0-video",
  "agnes-video-2.5",
  "seedance-2.0-1080p",
  "seedance-2.0-1080p-fast",
  "seedance-2.0-1080p-mini",
  "seedance-2.5-1080p",
  "seedance-2.0-720p",
  "seedance-2.0-720p-fast",
  "seedance-2.0-720p-mini",
  "seedance-2.5-720p",
  "seedance-2.5-480p",
  "seedance-2.0-480p",
  "seedance-2.0-480p-fast",
  "seedance-2.0-480p-mini",
  "seedance-2.5",
  "seedance-2.0",
  "seedance-2.0-fast",
  "seedance-2.0-mini",
];
function loadVideoGenModels() {
  const candidates = [
    process.env.VIDEO_CATALOG,
    "/app/video-catalog.json",
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../apimart-passthrough/catalog.json"
    ),
    "/opt/ai-relay/services/apimart-passthrough/catalog.json",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      // Video-generation routing must exclude image-kind models: image models
      // in the catalog are served by the native image service via
      // /v1/images/generations, while their async /v1/videos lane (if any) is
      // handled by New API (sora adapter), not the video-gen service.
      const ids = (j.models || [])
        .filter((m) => m.kind !== "image")
        .map((m) => m.id)
        .filter(Boolean);
      if (ids.length) {
        console.log(`[creem] VIDEO_GEN_MODELS from ${p} (${ids.length})`);
        return new Set(ids);
      }
    } catch (e) {
      console.warn("[creem] video catalog load failed", p, e.message || e);
    }
  }
  console.warn("[creem] VIDEO_GEN_MODELS fallback hardcoded", VIDEO_GEN_FALLBACK.length);
  return new Set(VIDEO_GEN_FALLBACK);
}
const VIDEO_GEN_MODELS = loadVideoGenModels();

// 参考图生图模型集：与透传目录(kind=image)自动同源
const IMAGE_GEN_FALLBACK = [
  "gpt-image-2",
  "gpt-image-2-vip",
  "gpt-image-2.5",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "nano-banana-2",
  "nano-banana-2.1",
  "nano-banana-pro",
];
function loadImageGenModels() {
  const candidates = [
    process.env.VIDEO_CATALOG,
    "/app/video-catalog.json",
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../apimart-passthrough/catalog.json"
    ),
    "/opt/ai-relay/services/apimart-passthrough/catalog.json",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      const ids = (j.models || []).filter((m) => m.kind === "image").map((m) => m.id).filter(Boolean);
      if (ids.length) {
        console.log(`[creem] IMAGE_GEN_MODELS from ${p} (${ids.length})`);
        return new Set(ids);
      }
    } catch (e) {
      console.warn("[creem] image catalog load failed", p, e.message || e);
    }
  }
  console.warn("[creem] IMAGE_GEN_MODELS fallback hardcoded", IMAGE_GEN_FALLBACK.length);
  return new Set(IMAGE_GEN_FALLBACK);
}
const IMAGE_GEN_MODELS = loadImageGenModels();

function qsOf(url) {
  const s = String(url || "");
  const i = s.indexOf("?");
  return i >= 0 ? s.slice(i) : "";
}

// Native sync waits can outlast one polling window; always bound the entire
// request including response body. Async clients receive their task immediately.
const IMAGE_FORWARD_TIMEOUT_MS = Math.min(600000, Math.max(1000, Number(process.env.IMAGE_FORWARD_TIMEOUT_MS) || 360000));
const UPLOAD_AUTH_TIMEOUT_MS = Math.min(30000, Math.max(100, Number(process.env.UPLOAD_AUTH_TIMEOUT_MS) || 5000));

function proxyRequestHeaders(incoming, target) {
  const headers = { ...incoming };
  // The client body is already buffered (and may have been normalized to JSON).
  // Its 100-continue handshake/framing belongs to that connection, not fetch's
  // next connection. curl adds Expect to larger uploads; undici rejects it.
  const connectionHeaders = String(headers.connection || '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean);
  for (const name of ['expect', 'content-length', 'host', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-authorization', ...connectionHeaders]) {
    delete headers[name];
  }
  headers.host = target.host;
  headers['accept-encoding'] = 'identity';
  return headers;
}

async function proxyRaw(targetUrl, req, bodyBuf, timeoutMs = IMAGE_FORWARD_TIMEOUT_MS) {
  const target = new URL(targetUrl);
  const headers = proxyRequestHeaders(req.headers, target);
  const upstreamRes = await fetch(target, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "") ? undefined : bodyBuf,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const outHeaders = {};
  upstreamRes.headers.forEach((v, k) => {
    if (k.toLowerCase() === "transfer-encoding") return;
    outHeaders[k] = v;
  });
  const buf = Buffer.from(await upstreamRes.arrayBuffer());
  return { status: upstreamRes.status, buf, outHeaders };
}

function writeProxy(res, packed) {
  const headers = { ...packed.outHeaders };
  headers["content-length"] = String(packed.buf.length);
  delete headers["Content-Length"];
  const exposed = headers["access-control-expose-headers"] || "";
  headers["access-control-expose-headers"] = [...new Set([...exposed.split(",").map((s) => s.trim()).filter(Boolean), "X-Image-Task-Id", "Location", "Retry-After", "Idempotency-Key"])].join(", ");
  res.writeHead(packed.status, headers);
  res.end(packed.buf);
}


/** 模型广场供应商展示顺序（越前越靠上）；「其他」永远最后 */
const VENDOR_ORDER = [
  "OpenAI",
  "Anthropic",
  "Google",
  "DeepSeek",
  "xAI",
  "Grok",
  "Moonshot",
  "MiniMax",
  "Minimax",
  "Mistral",
  "NVIDIA",
  "Meta",
  "Qwen",
  "阿里巴巴",
  "ChatGLM",
  "智谱",
  "字节跳动",
  "ByteDance",
  "Doubao",
  "小米",
  "Xiaomi",
  "小红书",
  "阶跃星辰",
  "百度",
  "腾讯",
  "哔哩哔哩",
  "BRIA AI",
  "Black Forest Labs",
  "Flux",
  "Midjourney",
  "Ollama",
  "Vidu",
  "Kling",
  "Wenxin",
  "文心",
  "SiliconFlow",
  "Spark",
  "讯飞",
  "Suno",
  "PixVerse",
  "InclusionAI",
  "Poolside",
  "Dots",
];

const VENDOR_ALIAS = {
  Minimax: "MiniMax",
  Grok: "xAI",
  文心: "Wenxin",
  讯飞: "Spark",
  ChatGLM: "智谱",
  Zhipu: "智谱",
  Alibaba: "阿里巴巴",
  Qwen: "阿里巴巴",
  通义: "阿里巴巴",
  Other: "其他",
  ByteDance: "字节跳动",
  Doubao: "字节跳动",
  Seedance: "字节跳动",
  豆包: "字节跳动",
  Nvidia: "NVIDIA",
  Nemotron: "NVIDIA",
  StepFun: "阶跃星辰",
  Stepfun: "阶跃星辰",
  Bria: "BRIA AI",
  BRIA: "BRIA AI",
  BriaAI: "BRIA AI",
  Xiaomi: "小米",
  XiaomiMiMo: "小米",
  Dots: "小红书",
  "Dots Studio": "小红书",
};

function canonVendor(name) {
  if (!name) return "";
  return VENDOR_ALIAS[name] || name;
}

function vendorRank(name) {
  if (!name) return 9000;
  if (name === "其他") return 9500;
  const n = canonVendor(name);
  for (let i = 0; i < VENDOR_ORDER.length; i++) {
    const v = canonVendor(VENDOR_ORDER[i]);
    if (n === v || name === VENDOR_ORDER[i]) return i;
  }
  // Exact case-insensitive only — never substring-match (avoids Meta⊂Mistral etc.)
  const lower = n.toLowerCase();
  for (let i = 0; i < VENDOR_ORDER.length; i++) {
    const v = canonVendor(VENDOR_ORDER[i]).toLowerCase();
    if (lower === v) return i;
  }
  return 8000;
}

function verParts(s) {
  return (String(s).match(/\d+/g) || []).map(Number);
}

/** 同供应商内：版本号更大的靠前，再按名字倒序 */
function cmpModelNewFirst(a, b) {
  const na = a.model_name || a.model || "";
  const nb = b.model_name || b.model || "";
  const pa = verParts(na);
  const pb = verParts(nb);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return db - da;
  }
  return nb.localeCompare(na, "en");
}

function reorderPricingPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const models = Array.isArray(payload.data) ? payload.data : null;
  const vendors = Array.isArray(payload.vendors) ? payload.vendors : [];
  if (!models) return payload;

  // 下架模型从公开模型广场隐藏，但渠道 abilities 保留，老名称仍可直接调用。
  const hidden = new Set(Array.isArray(MARKETPLACE_COPY.__hidden__) ? MARKETPLACE_COPY.__hidden__ : []);
  const visibleModels = hidden.size
    ? models.filter((m) => !hidden.has(String(m.model_name || m.model || m.key || "")))
    : models;

  const vendorName = Object.fromEntries(
    vendors.map((v) => [v.id, v.name || ""])
  );

  const sortedVendors = [...vendors].sort((a, b) => {
    const ra = vendorRank(a.name);
    const rb = vendorRank(b.name);
    if (ra !== rb) return ra - rb;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh");
  });

  const sortedModels = [...visibleModels].sort((a, b) => {
    const va = vendorName[a.vendor_id] || "";
    const vb = vendorName[b.vendor_id] || "";
    const ra = vendorRank(va);
    const rb = vendorRank(vb);
    if (ra !== rb) return ra - rb;
    return cmpModelNewFirst(a, b);
  });

  const ordered = { ...payload, data: sortedModels, vendors: sortedVendors };
  return enrichPricingPayload(ordered);
}

/** 前端只有 name/price 排序。名称排序时禁止打乱，保留 /api/pricing 已排好的供应商顺序 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadMarketplaceCopy() {
  const candidates = [
    path.join(__dirname, "marketplace-model-copy.json"),
    path.join(__dirname, "../../config/marketplace-model-copy.json"),
    process.env.MARKETPLACE_COPY_PATH || "",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {}
  }
  return {};
}

const MARKETPLACE_COPY = loadMarketplaceCopy();

function loadModelIconMap() {
  const candidates = [
    path.join(__dirname, "model-icon-map.json"),
    path.join(__dirname, "..", "..", "config", "model-icon-map.json"),
    path.join(__dirname, "..", "config", "model-icon-map.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        return {
          icons: j.icons && typeof j.icons === "object" ? j.icons : {},
          lobehubFixes:
            j.lobehub_fixes && typeof j.lobehub_fixes === "object"
              ? j.lobehub_fixes
              : {},
        };
      }
    } catch {}
  }
  return { icons: {}, lobehubFixes: {} };
}

const MODEL_ICON_PACK = loadModelIconMap();
const MODEL_ICON_MAP = MODEL_ICON_PACK.icons;
const LOBEHUB_ICON_FIXES = MODEL_ICON_PACK.lobehubFixes;

function buildModelIconScript() {
  const injectPath = path.join(__dirname, "model-icon-inject.js");
  const body = fs.readFileSync(injectPath, "utf8");
  // v5: any Custom / missing vendor icon → site logo; MAP may override.
  return (
    "<script>window.__keyoIconMap=" +
    JSON.stringify(MODEL_ICON_MAP) +
    ";" +
    body +
    "</script>"
  );
}

const MODEL_ICON_SCRIPT = buildModelIconScript();

function sanitizeDescription(desc) {
  if (!desc) return desc;
  return String(desc)
    .replace(/售\s*¥[\d.]+\/[^（\s。]*/g, "")
    .replace(/售\s*¥[\d.]+\s*\/\s*M\s*tokens?/gi, "")
    .replace(/·\s*¥[\d.]+\/¥[\d.]+\s*per\s*M/gi, "")
    .replace(/（成本×\s*\d+(?:\.\d+)?）/g, "")
    .replace(/成本[×xX]\s*\d+(?:\.\d+)?/g, "")
    .replace(/cost\s*[×xX]\s*\d+(?:\.\d+)?/gi, "")
    .replace(/markup\s*[×xX:=]?\s*\d+(?:\.\d+)?/gi, "")
    .replace(/[×xX]\s*2\.5|[×xX]\s*5(?:\.\d+)?/g, "")
    .replace(/上游(?:成本|进货价|标价|渠道|供应商)?/g, "")
    .replace(/透传|二道贩子?|中转站|转卖/g, "")
    .replace(
      /模力方舟|MoArk|moark|APIMart|Apimart|apimart|OpenLux|openlux|UnoRouter|unorouter|Gitee(?:\s*AI)?|gitee|Grsai|grsai|SenseNova|sensenova|商汤|SenseTime|Sorux|soruxgpt|InclusionAI|Poolside|Dots Studio|volcengine|Volcengine|MediaKit|火山引擎|OpenRouter|openrouter|passthrough/gi,
      ""
    )
    .replace(/¥[\d.]+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/。\s*。/g, "。")
    .replace(/^[·\s，,]+|[·\s，,]+$/g, "")
    .trim();
}

/** 广场供应商名：抹掉中间层/供货商标识，只留模型原厂或「其他」 */
function scrubVendorName(name) {
  const n = String(name || "").trim();
  if (!n) return n;
  if (
    /模力方舟|MoArk|moark|APIMart|Apimart|apimart|OpenLux|openlux|UnoRouter|unorouter|Gitee|gitee|Grsai|grsai|SenseNova|sensenova|商汤|SenseTime|Sorux|InclusionAI|Poolside|OpenRouter|openrouter|中转|上游|透传/i.test(
      n
    )
  ) {
    return "其他";
  }
  return n;
}

/** New API sidebar splits tags on spaces / · — keep single tokens only. */
function normalizeTagToken(tag) {
  let t = String(tag || "").trim();
  if (!t || /^[·.•\-—_/|]+$/.test(t)) return "";
  const map = {
    "视频·按秒": "视频模型",
    "视频·按次": "视频模型",
    "影片·按秒": "视频模型",
    "影片·按次": "视频模型",
    "Video · per second": "视频模型",
    "Video · per request": "视频模型",
    VideoSec: "视频模型",
    VideoReq: "视频模型",
    DigitalHuman: "数字人",
    ImageProc: "图像处理",
    rag: "嵌入模型",
    RAG: "嵌入模型",
    Embedding: "嵌入模型",
    embedding: "嵌入模型",
    嵌入模型: "嵌入模型",
    per: "视频模型",
    second: "视频模型",
    request: "视频模型",
    processing: "图像处理",
    digital: "数字人",
    human: "数字人",
    llm: "大语言模型",
    asr: "语音识别",
    tts: "语音合成",
    video: "视频",
    image: "图片",
    moderation: "内容风控",
    ocr: "OCR",
    VideoProc: "视频处理",
    "视频处理": "视频处理",
    "视频按秒": "视频模型",
    "视频按次": "视频模型",
    "视频模型": "视频模型",
    VideoModel: "视频模型",
    VideoProcessing: "视频处理",
    "Video Processing": "视频处理",
    Decision: "决策模型",
    DecisionModel: "决策模型",
    "Decision Model": "决策模型",
    Music: "音乐",
    music: "音乐",
    Free: "",
    free: "",
    "免费": "",
    "免費": "",
    "gratuit": "",
    "Gratuit": "",
  };
  if (map[t] !== undefined) return map[t];
  if (t.includes("·")) {
    const flat = t.replace(/·/g, "");
    if (flat === "视频按秒" || flat === "影片按秒") return "视频模型";
    if (flat === "视频按次" || flat === "影片按次") return "视频模型";
    if (flat === "视频处理" || flat === "影片處理") return "视频处理";
    if (flat === "视频模型" || flat === "影片模型") return "视频模型";
    t = flat;
  }
  return t;
}

function normalizeModelTags(tags) {
  if (tags == null) return tags;
  const parts = Array.isArray(tags)
    ? tags.map((x) => String(x))
    : String(tags).split(/[,，]/);
  const out = [];
  const seen = new Set();
  for (const p of parts) {
    const n = normalizeTagToken(p.trim());
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return Array.isArray(tags) ? out : out.join(",");
}

function pickMarketplaceDescription(entry, lang) {
  if (!entry) return "";
  const d = entry.descriptions || {};
  const code = lang || "zhCN";
  return (
    d[code] ||
    d.zhCN ||
    entry.description_zh ||
    entry.description ||
    d.en ||
    entry.description_en ||
    ""
  );
}

function enrichPricingPayload(payload) {
  if (!payload || !Array.isArray(payload.data)) return payload;

  // 全局端点字典：确保所有用到的端点类型都有定义
  const defaultEndpoints = {
    "openai": { path: "/v1/chat/completions", method: "POST" },
    "openai-response": { path: "/v1/responses", method: "POST" },
    "anthropic": { path: "/v1/messages", method: "POST" },
    "gemini": { path: "/v1beta/models/{model}:generateContent", method: "POST" },
    "image-generation": { path: "/v1/images/generations", method: "POST" },
    "image-processing": { path: "/v1/images/edits", method: "POST" },
    "embeddings": { path: "/v1/embeddings", method: "POST" },
    "jina-rerank": { path: "/v1/rerank", method: "POST" },
    "openai-video": { path: "/v1/videos/generations", method: "POST" },
    "openai-audio": { path: "/v1/audio/speech", method: "POST" },
    "suno": { path: "/v1/audio/music", method: "POST" },
    "moderation": { path: "/v1/moderations", method: "POST" },
  };
  // 合并现有 supported_endpoint 与默认端点
  const mergedEndpoints = { ...defaultEndpoints, ...(payload.supported_endpoint || {}) };

  // Collapse alias vendors (Qwen→阿里巴巴) but remap model.vendor_id → kept id
  // so sidebar countBy(vendor_name) never goes to 0 for real models.
  const idRemap = new Map(); // droppedVendorId → keptVendorId
  const vendors = Array.isArray(payload.vendors)
    ? (() => {
        const seen = new Map(); // canonName → kept vendor row
        const out = [];
        for (const v of payload.vendors) {
          if (!v) continue;
          const raw = String(v.name || "").trim();
          const key = canonVendor(
            raw === "Alibaba" || raw === "Qwen" || raw === "通义"
              ? "阿里巴巴"
              : raw === "Other"
                ? "其他"
                : scrubVendorName(raw)
          );
          const icon =
            key === "字节跳动" && (!v.icon || v.icon === "Custom")
              ? "Doubao.Color"
              : !v.icon || v.icon === "Custom"
                ? ""
                : v.icon;
          if (seen.has(key)) {
            idRemap.set(v.id, seen.get(key).id);
            continue;
          }
          const row = { ...v, name: key, icon };
          seen.set(key, row);
          out.push(row);
        }
        return out;
      })()
    : payload.vendors;

  const idToVendor = new Map(
    (vendors || []).map((v) => [v.id, v])
  );

  const briaVendorRow = (vendors || []).find((v) => v && v.name === "BRIA AI");

  const data = payload.data.map((m) => {
    const name = m.model_name || m.model;
    const entry = name ? MARKETPLACE_COPY[name] : null;
    let next = { ...m };
    if (entry) {
      next.description = pickMarketplaceDescription(entry, "zhCN");
    } else if (m.description) {
      next.description = sanitizeDescription(m.description);
    }
    if (name && LOBEHUB_ICON_FIXES[name]) {
      next.icon = LOBEHUB_ICON_FIXES[name];
    } else if (name === "RMBG-2.0" && next.icon === "Tencent.Color") {
      next.icon = "";
    }
    let vid = next.vendor_id;
    if (name === "RMBG-2.0" && briaVendorRow) {
      vid = briaVendorRow.id;
    } else if (vid != null && idRemap.has(vid)) {
      vid = idRemap.get(vid);
    }
    if (vid != null) next.vendor_id = vid;
    const vrow = vid != null ? idToVendor.get(vid) : null;
    if (vrow) {
      next.vendor_name = vrow.name;
    } else if (next.vendor_name) {
      next.vendor_name = scrubVendorName(next.vendor_name);
    }
    if (name === "RMBG-2.0") {
      next.vendor_name = "BRIA AI";
      next.owner_by = "BRIA AI";
    } else if (next.owner_by) {
      next.owner_by = scrubVendorName(next.owner_by);
    }
    if (name === "gemini-3.8-flash-tts") {
      next.tags = "语音合成";
      next.supported_endpoint_types = ["gemini"];
    } else if (name === "grok-image-2.0") {
      next.tags = "图片";
      next.supported_endpoint_types = ["image-generation"];
    } else if (name === "video-enhance-pro" || name === "subtitle-erase-pro") {
      next.tags = "视频处理";
      next.supported_endpoint_types = ["openai-video"];
    } else if (name === "Spark-TTS-0.5B") {
      next.tags = "语音合成";
      next.supported_endpoint_types = ["openai-audio"];
    } else if (name === "SenseVoiceSmall") {
      next.tags = "语音识别";
      next.supported_endpoint_types = ["openai-audio"];
    } else if (name === "glm-5.3:free") {
      next.tags = "大语言模型";
      next.supported_endpoint_types = ["openai"];
      if (!next.model_ratio || next.model_ratio <= 0) {
        next.model_ratio = 0.599;
        next.completion_ratio = 6.24974958263773;
      }
    } else if (name === "deepseek-v4.1-flash-1017:free") {
      next.tags = "大语言模型";
      next.supported_endpoint_types = ["openai"];
      if (!next.model_ratio || next.model_ratio <= 0) {
        next.model_ratio = 0.036;
        next.completion_ratio = 2.7778;
      }
    } else if (name === "deepseek-v4.1-flash-1017") {
      next.tags = "大语言模型";
      next.supported_endpoint_types = ["openai"];
      if (!next.model_ratio || next.model_ratio <= 0) {
        next.model_ratio = 0.0108;
        next.completion_ratio = 2.7778;
      }
    } else if (name === "MiniMax-M3.1-Flash") {
      next.tags = "大语言模型";
      next.supported_endpoint_types = ["openai"];
      if (!next.model_ratio || next.model_ratio <= 0) {
        next.model_ratio = 0.045;
        next.completion_ratio = 4.0;
      }
    } else if (name === "keyo-flash:free" || name === "keyo-flash2:free") {
      if (!next.model_ratio || next.model_ratio <= 0) {
        next.model_ratio = 0.005;
        next.completion_ratio = 5;
      }
    } else if (name === "gemini-embedding-2-preview" || /^WeMM-Embedding-/i.test(String(name || ""))) {
      next.supported_endpoint_types = ["embeddings"];
    } else if (/^claude-/i.test(String(name || ""))) {
      const eps = Array.isArray(next.supported_endpoint_types) ? next.supported_endpoint_types : [];
      if (!eps.includes("anthropic")) {
        next.supported_endpoint_types = ["anthropic", "openai", "openai-response"];
      }
    }
    if (next.tags != null) next.tags = normalizeModelTags(next.tags);
    if (next.description) next.description = sanitizeDescription(next.description);
    return next;
  });

  // Drop empty vendor shells (e.g. leftover InclusionAI / Poolside after remaps)
  const usedVids = new Set();
  for (const m of data) {
    if (m && m.vendor_id != null) usedVids.add(m.vendor_id);
  }
  const vendorsUsed = Array.isArray(vendors)
    ? vendors.filter((v) => v && usedVids.has(v.id))
    : vendors;

  // Group pricing data (usable_group / group_ratio / auto_groups / enable_groups)
  // must stay intact: the detail-page group price tables for the Claude series
  // and per-second video models render directly from these fields.
  return normalizePublicModelMetadata({ ...payload, data, vendors: vendorsUsed, supported_endpoint: mergedEndpoints }, MARKETPLACE_COPY);
}

function buildLocaleDescScript() {
  const map = JSON.stringify(MARKETPLACE_COPY);
  const js =
    "(function(){if(window.__keyoLocaleDescV6)return;window.__keyoLocaleDescV6=1;window.__KEYO_MKT_COPY=" +
    map +
    ';var MAP=window.__KEYO_MKT_COPY;var LANGS=["zhCN","zhTW","en","fr","ru","ja","vi"];function langCode(){try{var v=(localStorage.getItem("i18nextLng")||"").trim();if(!v&&document.documentElement)v=String(document.documentElement.lang||"");v=v.replace(/_/g,"-");var raw=v;var l=v.toLowerCase();if(LANGS.indexOf(raw)>=0)return raw;if(l==="zhcn"||l==="zh-cn"||l==="zh-hans"||l==="zh"||l.indexOf("zh")===0)return "zhCN";if(l==="zhtw"||l==="zh-tw"||l==="zh-hk"||l==="zh-mo"||l.indexOf("zh-hant")===0)return "zhTW";if(l.indexOf("ja")===0)return "ja";if(l.indexOf("fr")===0)return "fr";if(l.indexOf("ru")===0)return "ru";if(l.indexOf("vi")===0)return "vi";if(l.indexOf("en")===0)return "en";return "zhCN"}catch(e){return "zhCN"}}function bagPick(bag){if(!bag)return"";if(typeof bag==="string")return bag;var c=langCode();return bag[c]||bag.zhCN||bag.en||""}function pickDesc(e){if(!e)return"";var d=e.descriptions||{};var c=langCode();return d[c]||d.zhCN||e.description_zh||e.description||d.en||e.description_en||""}function pickTitle(id,e){if(e&&e.display_names){var t=bagPick(e.display_names);if(t)return t}if(e&&e.free){var suf=bagPick(MAP.__free_suffix__)||"（免费）";return String(id)+suf}return ""}function canonTag(tag){if(!tag)return"";var t=String(tag).trim();if(!t||/^[·.•\\-—_/|]+$/.test(t))return"";var TAGS=MAP.__tags__||{};if(TAGS[t])return t;var low=t.toLowerCase();if(TAGS[low])return low;var rev={"llm":"大语言模型","moderation":"内容风控","digital human":"数字人","digitalhuman":"数字人","digital":"数字人","human":"数字人","image":"图片模型","图片":"图片模型","图像生成":"图片模型","image generation":"图片模型","imagegen":"图片模型","image-gen":"图片模型","text-to-image":"图片模型","t2i":"图片模型","image processing":"图像处理","imageproc":"图像处理","tts":"语音合成","asr":"语音识别","video":"视频","video · per second":"视频按秒","videosecond":"视频按秒","videosec":"视频按秒","video · per request":"视频按次","videoreq":"视频按次","ocr":"OCR","rag":"嵌入模型","embedding":"嵌入模型","free":"免费","gratuit":"免费","rag":"嵌入模型","embedding":"嵌入模型","per":"视频按秒","second":"视频按秒","request":"视频按次","processing":"图像处理","视频·按秒":"视频模型","视频·按次":"视频模型","视频按秒":"视频模型","视频按次":"视频模型","video processing":"视频处理","videoproc":"视频处理","decision model":"决策模型","decision":"决策模型","music":"音乐"};if(rev[low])return rev[low];if(rev[t])return rev[t];if(t.indexOf("·")>=0){var flat=t.replace(/·/g,"");if(flat==="视频按秒"||flat==="影片按秒")return"视频按秒";if(flat==="视频按次"||flat==="影片按次")return"视频按次";t=flat}for(var k in TAGS){var b=TAGS[k];if(!b||typeof b!=="object")continue;for(var lang in b){if(String(b[lang]).toLowerCase()===low)return k}}return t}function pickTag(tag){var key=canonTag(tag);if(!key)return"";var bag=(MAP.__tags__||{})[key];var label=bagPick(bag)||key;return String(label).replace(/[·\\s]+/g,"")}function mapTags(tags){if(tags==null)return tags;var parts=Array.isArray(tags)?tags:String(tags).split(/[,，]/);var out=[];var seen={};for(var i=0;i<parts.length;i++){var p=pickTag(String(parts[i]).trim());if(!p||seen[p])continue;seen[p]=1;out.push(p)}return Array.isArray(tags)?out:out.join(",")}function canonVendor(name){if(!name)return name;var n=String(name).trim();var alias={Alibaba:"阿里巴巴",Qwen:"阿里巴巴","通义":"阿里巴巴",Other:"其他",Minimax:"MiniMax",Grok:"xAI",ChatGLM:"智谱",ByteDance:"字节跳动",Doubao:"字节跳动",Seedance:"字节跳动","豆包":"字节跳动",Bria:"BRIA AI",BRIA:"BRIA AI",BriaAI:"BRIA AI"};if(alias[n])n=alias[n];var V=MAP.__vendors__||{};if(V[n])return n;return n}function pickVendor(name){if(!name)return name;var key=canonVendor(name);var bag=(MAP.__vendors__||{})[key]||(MAP.__vendors__||{})[name];var label=bagPick(bag);if(label)return label;return key||name}function applyPricing(d){try{if(!d||!Array.isArray(d.data))return d;for(var i=0;i<d.data.length;i++){var m=d.data[i];var n=m&&(m.model_name||m.model||m.key);var e=n&&MAP[n];if(e){var t=pickDesc(e);if(t)m.description=t;var title=pickTitle(n,e);if(title){m.display_name=title;m.__keyo_title=title}}if(m.tags)m.tags=mapTags(m.tags);if(m.vendor_name)m.vendor_name=pickVendor(m.vendor_name)}if(Array.isArray(d.vendors)){var seen={};var out=[];for(var j=0;j<d.vendors.length;j++){var v=d.vendors[j];if(!v)continue;var raw=v.name||"";var key=canonVendor(raw);var label=pickVendor(raw)||key||raw;if(!key||seen[key])continue;seen[key]=1;out.push(Object.assign({},v,{name:label,__keyo_vendor_key:key}))}d.vendors=out}}catch(err){}return d}function titleMap(){var out={};try{for(var k in MAP){if(!k||k.indexOf("__")===0)continue;var e=MAP[k];if(!e)continue;var t=pickTitle(k,e);if(t&&t!==k)out[k]=t}}catch(e){}return out}function rewriteNames(root){try{var map=titleMap();var keys=Object.keys(map);if(!keys.length)return;var tw=document.createTreeWalker(root||document.body,NodeFilter.SHOW_TEXT,null);var n;while(n=tw.nextNode()){var p=n.parentElement;if(!p)continue;var tag=(p.tagName||"").toLowerCase();if(tag==="script"||tag==="style"||tag==="code"||tag==="pre"||tag==="textarea"||tag==="input")continue;if(p.closest&&p.closest("code,pre,textarea,input,[contenteditable=true]"))continue;var raw=n.nodeValue||"";var t=raw.replace(/^\\s+|\\s+$/g,"");if(!t||!map[t])continue;var lead=raw.match(/^\\s*/)[0]||"";var trail=raw.match(/\\s*$/)[0]||"";n.nodeValue=lead+map[t]+trail;p.setAttribute("translate","no");p.classList.add("notranslate")}}catch(e){}}function noTranslate(){try{document.documentElement.setAttribute("translate","yes");var root=document.getElementById("root")||document.body;if(!root)return;root.querySelectorAll("button,a,span,div,h1,h2,h3,label").forEach(function(el){var t=(el.textContent||"").replace(/\\s+/g," ").trim();if(!t||t.length>48)return;if(/OpenAI|Anthropic|Google|DeepSeek|MiniMax|Moonshot|ByteDance|Alibaba|阿里巴巴|智谱|百度|腾讯|哔哩|阶跃|BRIA|Black Forest|xAI|Meta|其他|Other|LLM|ASR|TTS|OCR|视频|免费|Free|無料|VideoSec|VideoReq/.test(t)){el.setAttribute("translate","no");el.classList.add("notranslate")}})}catch(e){}}var oparse=JSON.parse;JSON.parse=function(text){var v=oparse.apply(this,arguments);try{if(v&&Array.isArray(v.data)&&v.data[0]&&(v.data[0].model_name||v.data[0].model)&&(v.vendors||v.auto_groups||v.group_ratio!=null))applyPricing(v)}catch(e){}return v};try{var desc=Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,"responseText");if(desc&&desc.get){Object.defineProperty(XMLHttpRequest.prototype,"responseText",{configurable:true,enumerable:true,get:function(){var t=desc.get.call(this);try{if(this.readyState===4&&this.__keyoUrl&&String(this.__keyoUrl).indexOf("/api/pricing")>=0&&!this.__keyoLocaleCap){this.__keyoLocaleCap=1;var j=oparse(t);applyPricing(j);t=JSON.stringify(j)}}catch(e){}return t}})}}catch(e){}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__keyoUrl=u;this.__keyoLocaleCap=0;return XO.apply(this,arguments)};var ofetch=window.fetch;window.fetch=function(){var args=arguments;return ofetch.apply(this,args).then(function(res){try{var u="";if(typeof args[0]==="string")u=args[0];else if(args[0]&&args[0].url)u=args[0].url;if(u&&u.indexOf("/api/pricing")>=0){return res.clone().json().then(function(d){applyPricing(d);return new Response(JSON.stringify(d),{status:res.status,statusText:res.statusText,headers:res.headers})}).catch(function(){return res})}}catch(e){}return res})};var last=null;try{last=localStorage.getItem("i18nextLng")}catch(e){}function tickUI(){try{noTranslate();rewriteNames(document.body)}catch(e){}}setInterval(function(){try{var cur=localStorage.getItem("i18nextLng");if(cur!==last){last=cur;location.reload()}tickUI()}catch(e){}},500);try{new MutationObserver(function(){tickUI()}).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}document.addEventListener("DOMContentLoaded",tickUI);setTimeout(tickUI,800)})();';
  return "<script>" + js + "</script>";
}

function buildBillingUnitScript() {
  // v13: load raw inject file (avoid template-literal regex breakage); replace 定价 card with group price table.
  const injectPath = path.join(__dirname, "billing-unit-inject.js");
  const js = fs.readFileSync(injectPath, "utf8");
  return "<script>" + js + "</script>";
}


const LOCALE_DESC_SCRIPT = buildLocaleDescScript();
const BILLING_UNIT_SCRIPT = buildBillingUnitScript();
const PRICING_UI_PATH = "/api/marketplace/pricing-ui.js";
const PRICING_UI_JS = [LOCALE_DESC_SCRIPT, BILLING_UNIT_SCRIPT]
  .map((script) => script.slice("<script>".length, -"</script>".length))
  .join("\n;\n");

// Auth-started SPA sessions do not request another HTML shell on navigation.
// Defer the existing pricing UI until that session actually visits pricing.
function loadPricingOnNavigation() {
  if (window.__keyoPricingLoaderV1) return;
  window.__keyoPricingLoaderV1 = true;
  var pending = false;
  var loaded = false;
  function load() {
    if (!/^\/(?:pricing|models)(?:\/|$)/.test(location.pathname)) return;
    if (pending || loaded || (window.__keyoBillWeldedV1 && window.__KEYO_MKT_COPY)) return;
    pending = true;
    var script = document.createElement("script");
    script.src = "/api/marketplace/pricing-ui.js?v=20261028-1";
    script.async = true;
    script.onload = function () { loaded = true; pending = false; };
    script.onerror = function () { pending = false; script.remove(); };
    document.head.appendChild(script);
  }
  ["pushState", "replaceState"].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      load();
      return result;
    };
  });
  window.addEventListener("popstate", load);
  window.addEventListener("pageshow", load);
  window.addEventListener("online", load);
  window.addEventListener("click", load);
  load();
}
const PRICING_UI_LOADER = `<!--keyo-pricing-loader-v1--><script>(${loadPricingOnNavigation.toString()})();</script>`;

/** 旧前端 SPA 仍可能把 /models 当需登录路由；尽早改写到公开 /pricing */
const MODELS_PUBLIC_SCRIPT = `<script>(function(){if(window.__keyoModelsPublic)return;window.__keyoModelsPublic=1;function mapPath(p){if(p==="/models")return"/pricing";if(p.indexOf("/models/")===0)return"/pricing"+p.slice(7);return null}function rewriteUrl(u){try{var x=new URL(u,location.origin);if(x.origin!==location.origin)return u;var n=mapPath(x.pathname);return n?n+x.search+x.hash:u}catch(e){return u}}function bounce(){var n=mapPath(location.pathname);if(n)location.replace(n+location.search+location.hash)}bounce();var _ps=history.pushState;history.pushState=function(s,t,u){if(typeof u==="string")u=rewriteUrl(u);return _ps.call(this,s,t,u)};var _rs=history.replaceState;history.replaceState=function(s,t,u){if(typeof u==="string")u=rewriteUrl(u);return _rs.call(this,s,t,u)};document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var href=a.getAttribute("href");if(!href||href.charAt(0)==="#")return;try{var x=new URL(href,location.origin);if(x.origin!==location.origin)return;var n=mapPath(x.pathname);if(!n)return;e.preventDefault();e.stopPropagation();location.assign(n+x.search+x.hash)}catch(err){}},true)})();</script>`;

const PRICING_SORT_SCRIPT = `<script>(function(){if(window.__keyoPricingSort)return;window.__keyoPricingSort=1;var order=[],vendors=[],orderMap={},vendorMap={},origSort=Array.prototype.sort,origToSorted=Array.prototype.toSorted;function rebuildMaps(){orderMap={};vendorMap={};for(var i=0;i<order.length;i++)orderMap[order[i]]=i;for(var j=0;j<vendors.length;j++)vendorMap[vendors[j]]=j}function capture(d){try{if(!d||!d.data)return;order=[];for(var i=0;i<d.data.length;i++){var n=d.data[i]&&(d.data[i].model_name||d.data[i].model||d.data[i].key);if(n)order.push(String(n))}vendors=[];var vs=d.vendors||[];for(var k=0;k<vs.length;k++){var vn=vs[k]&&vs[k].name;if(vn)vendors.push(String(vn))}rebuildMaps()}catch(e){}}function looksLikeModels(arr){if(!arr||arr.length<2)return false;var hit=0;for(var i=0;i<Math.min(arr.length,8);i++){var o=arr[i];if(o&&typeof o==='object'&&(o.model_name||o.model||o.key))hit++}return hit>=2}function looksLikeVendors(arr){if(!arr||arr.length<2||!vendors.length)return false;var o=arr[0];return!!(o&&typeof o==='object'&&o.name!=null&&('id' in o||'icon' in o))}function isPriceSort(cmp){if(!cmp)return false;try{var s=Function.prototype.toString.call(cmp);if(/localeCompare/i.test(s)&&!/model_price|price-low|price-high|inputPrice|outputPrice/i.test(s))return false;if(/model_price|getModelPrice|price-low|price-high|inputPrice|outputPrice|quota_type/i.test(s))return true}catch(e){}return false}function byVendorOrder(a,b){var na=String(a.model_name||a.model||a.key||'');var nb=String(b.model_name||b.model||b.key||'');var ra=orderMap[na],rb=orderMap[nb];if(ra==null)ra=9000;if(rb==null)rb=9000;if(ra!==rb)return ra-rb;return 0}function sortHook(cmp){try{if(looksLikeModels(this)){if(isPriceSort(cmp))return origSort.apply(this,arguments);if(order.length)return origSort.call(this,byVendorOrder);return this}if(looksLikeVendors(this)&&vendors.length)return origSort.call(this,function(a,b){var ra=vendorMap[a.name],rb=vendorMap[b.name];if(ra==null)ra=9000;if(rb==null)rb=9000;return ra-rb})}catch(e){}return origSort.apply(this,arguments)}Array.prototype.sort=sortHook;if(origToSorted){Array.prototype.toSorted=function(cmp){var c=this.slice();sortHook.call(c,cmp);return c}}var origLC=String.prototype.localeCompare;String.prototype.localeCompare=function(other){try{var a=String(this),b=String(other==null?'':other);if(orderMap[a]!=null&&orderMap[b]!=null)return orderMap[a]-orderMap[b]}catch(e){}return origLC.apply(this,arguments)};function maybeCaptureUrl(u,text){try{if(u&&String(u).indexOf('/api/pricing')>=0)capture(JSON.parse(text))}catch(e){}}try{var desc=Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,'responseText');if(desc&&desc.get){Object.defineProperty(XMLHttpRequest.prototype,'responseText',{configurable:true,enumerable:true,get:function(){var t=desc.get.call(this);if(this.readyState===4&&this.__keyoUrl&&!this.__keyoCap){this.__keyoCap=1;maybeCaptureUrl(this.__keyoUrl,t)}return t}})}var desc2=Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,'response');if(desc2&&desc2.get){Object.defineProperty(XMLHttpRequest.prototype,'response',{configurable:true,enumerable:true,get:function(){var t=desc2.get.call(this);if(this.readyState===4&&this.__keyoUrl&&!this.__keyoCap2&&typeof t==='string'){this.__keyoCap2=1;maybeCaptureUrl(this.__keyoUrl,t)}else if(this.readyState===4&&this.__keyoUrl&&!this.__keyoCap2&&t&&typeof t==='object'){this.__keyoCap2=1;capture(t)}return t}})}}catch(e){}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__keyoUrl=u;this.__keyoCap=0;this.__keyoCap2=0;return XO.apply(this,arguments)};var oparse=JSON.parse;JSON.parse=function(text){var v=oparse.apply(this,arguments);try{if(v&&Array.isArray(v.data)&&v.data.length&&v.data[0]&&(v.data[0].model_name||v.data[0].model)&&(v.vendors||v.auto_groups||v.group_ratio!=null))capture(v)}catch(e){}return v};var ofetch=window.fetch;window.fetch=function(){var args=arguments;return ofetch.apply(this,args).then(function(res){try{var u='';if(typeof args[0]==='string')u=args[0];else if(args[0]&&args[0].url)u=args[0].url;if(u&&u.indexOf('/api/pricing')>=0){return res.clone().json().then(function(d){capture(d);return res}).catch(function(){return res})}}catch(e){}return res})};var __kl=function(){try{var v=(localStorage.getItem('i18nextLng')||'').toLowerCase().replace(/_/g,'-');if(v.indexOf('zh-tw')===0||v.indexOf('zh-hk')===0||v.indexOf('zh-hant')===0)return '↑↓ 推薦順序';if(v.indexOf('zh')===0)return '↑↓ 推荐顺序';if(v.indexOf('ja')===0)return '↑↓ おすすめ順';if(v.indexOf('fr')===0)return '↑↓ Ordre recommandé';if(v.indexOf('ru')===0)return '↑↓ Рекомендуемый порядок';if(v.indexOf('vi')===0)return '↑↓ Thứ tự đề xuất';return '↑↓ Recommended order'}catch(e){return '↑↓ Recommended order'}};function fixLabel(){try{document.querySelectorAll('button').forEach(function(el){var t=(el.textContent||'').replace(/\\s+/g,' ').trim();if(t==='名称'||t==='↑↓ 名称'||/^↑↓\\s*名称$/.test(t)||t==='Name'||t==='↑↓ Name')el.textContent=__kl()})}catch(e){}}setInterval(fixLabel,800);try{ofetch('/api/pricing').then(function(r){return r.json()}).then(capture).catch(function(){})}catch(e){}})();</script>`;

/** Copy toast often sticks (hover pause / closeButton). Force dismiss after 2s. */
const COPY_TOAST_AUTOCLOSE_SCRIPT = `<script>(function(){if(window.__keyoCopyToastV1)return;window.__keyoCopyToastV1=1;var RE=/已复制到剪贴板|已複製到剪貼簿|Copied to clipboard|クリップボードにコピー|Copié dans le presse-papiers|Скопировано в буфер|Đã sao chép vào bộ nhớ tạm/i;function dismiss(el){try{var btn=el.querySelector('[data-close-button],button[aria-label*="Close"],button[aria-label*="close"],button[aria-label*="关闭"],button[aria-label*="關閉"]');if(btn){btn.click();return}el.setAttribute('data-removed','true');if(el.parentNode)el.parentNode.removeChild(el)}catch(e){}}function scan(){try{document.querySelectorAll('[data-sonner-toast],li[data-sonner-toast],[data-styled=true]').forEach(function(el){if(el.getAttribute('data-keyo-copy-ac')==='1')return;var t=(el.textContent||'').replace(/\\s+/g,' ').trim();if(!RE.test(t))return;el.setAttribute('data-keyo-copy-ac','1');setTimeout(function(){dismiss(el)},2000)})}catch(e){}}setInterval(scan,300);try{new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}})();</script>`;


function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

const requestBudget = new RequestBudget({
  maxBytes: Number(process.env.REQUEST_BUFFER_BUDGET_BYTES || 33554432),
  maxRequests: Number(process.env.REQUEST_MAX_INFLIGHT || 8),
});
const requestLeases = new WeakMap();
async function readBodyLimited(req, maxBytes) {
  return requestLeases.get(req).read(req, maxBytes);
}

function ensureUploadDir() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    console.error("[uploads] mkdir failed", e.message || e);
  }
}

function safeExtFromName(name) {
  const base = path.basename(String(name || "")).toLowerCase();
  const ext = path.extname(base);
  return UPLOAD_EXT_MIME[ext] ? ext : "";
}

function extFromMime(mime) {
  const m = String(mime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return MIME_TO_EXT[m] || "";
}

function parseMultipartFile(buf, contentType) {
  const parts = parseMultipart(buf, contentType, {
    maxParts: 32,
    maxFiles: 4,
    maxFileBytes: UPLOAD_MAX_BYTES,
    maxTextBytes: 64 * 1024,
    maxTotalBytes: UPLOAD_MAX_BYTES,
  });
  const part = parts.find((p) => p.filename !== undefined || /^(?:file|image|audio|video|media)$/i.test(p.field));
  return part ? { ...part, filename: part.filename || part.field || "upload.bin" } : null;
}

async function assertBearerKey(req) {
  await validateUploadAuth(String(req.headers.authorization || ""), UPSTREAM, { timeoutMs: UPLOAD_AUTH_TIMEOUT_MS });
}

function purgeExpiredUploads() {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
      if (name.startsWith(".")) continue;
      const full = path.join(UPLOAD_DIR, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        if (now - st.mtimeMs > UPLOAD_TTL_MS) fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    console.error("[uploads] purge", e.message || e);
  }
}

async function handleUploadPost(req, res) {
  try {
    await assertBearerKey(req);
  } catch (e) {
    if (e.status === 503) console.error(`[uploads] auth unavailable id=${crypto.randomUUID()} reason=${e.message}`);
    return json(res, e.status || 401, {
      error: {
        message: e.status === 503 ? "API key validation is temporarily unavailable. Please retry." : (e.message || "Unauthorized"),
        type: e.status === 503 ? "api_error" : "invalid_request_error",
        code: e.code || "invalid_api_key",
      },
    });
  }

  let bodyBuf;
  try {
    bodyBuf = await readBodyLimited(req, UPLOAD_MAX_BYTES);
  } catch (e) {
    if (e.code === "payload_too_large") {
      return json(res, 413, {
        error: {
          message: `File too large (max ${UPLOAD_MAX_BYTES} bytes)`,
          type: "invalid_request_error",
          code: "payload_too_large",
        },
      });
    }
    throw e;
  }

  const ct = String(req.headers["content-type"] || "");
  let filename = "";
  let mime = "";
  let data = null;

  if (/multipart\/form-data/i.test(ct)) {
    let part;
    try { part = parseMultipartFile(bodyBuf, ct); }
    catch (e) {
      return json(res, e.status || 400, { error: { message: e.message, type: "invalid_request_error", code: e.code || "invalid_multipart" } });
    }
    if (!part || !part.data || !part.data.length) {
      return json(res, 400, {
        error: {
          message:
            'multipart field required: file (or image/audio/video). Example: curl -F "file=@./still.jpg"',
          type: "invalid_request_error",
          code: "file_required",
        },
      });
    }
    filename = part.filename;
    mime = part.contentType;
    data = part.data;
  } else if (/application\/json/i.test(ct)) {
    let payload;
    try {
      payload = JSON.parse(bodyBuf.toString("utf8") || "{}");
    } catch {
      return json(res, 400, {
        error: { message: "Invalid JSON body", type: "invalid_request_error" },
      });
    }
    const b64 = String(
      payload.file_base64 || payload.data || payload.content || ""
    ).replace(/^data:[^;]+;base64,/, "");
    if (!b64) {
      return json(res, 400, {
        error: {
          message:
            "JSON upload needs file_base64 (or use multipart -F file=@...). Prefer multipart.",
          type: "invalid_request_error",
          code: "file_required",
        },
      });
    }
    try {
      data = decodeBase64Upload(String(payload.file_base64 || payload.data || payload.content || ""));
    } catch (e) {
      return json(res, 400, {
        error: {
          message: e.message || "Invalid base64",
          type: "invalid_request_error",
          code: e.code || "invalid_base64",
        },
      });
    }
    filename = String(payload.filename || payload.name || "upload.bin");
    mime = String(payload.content_type || payload.mime || "application/octet-stream");
  } else {
    data = bodyBuf;
    const q = new URL(req.url || "/", "http://local");
    filename =
      String(req.headers["x-filename"] || "") ||
      String(q.searchParams.get("filename") || "") ||
      "upload.bin";
    mime = ct.split(";")[0].trim() || "application/octet-stream";
  }

  if (!data || !data.length) {
    return json(res, 400, {
      error: {
        message: "Empty file",
        type: "invalid_request_error",
        code: "file_required",
      },
    });
  }
  if (data.length > UPLOAD_MAX_BYTES) {
    return json(res, 413, {
      error: {
        message: `File too large (max ${UPLOAD_MAX_BYTES} bytes)`,
        type: "invalid_request_error",
        code: "payload_too_large",
      },
    });
  }

  let ext = safeExtFromName(filename) || extFromMime(mime);
  if (!ext) {
    return json(res, 400, {
      error: {
        message:
          "Unsupported file type. Allowed: jpg/png/webp/gif/bmp, mp3/wav/m4a/aac/ogg/flac, mp4/webm/mov/mkv, pdf",
        type: "invalid_request_error",
        code: "unsupported_media_type",
      },
    });
  }

  let stored = "";
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    purgeExpiredUploads();
    checkStorageSpace(UPLOAD_DIR, data.length);
    const id = crypto.randomUUID().replace(/-/g, "");
    stored = `${id}${ext}`;
    const full = path.join(UPLOAD_DIR, stored);
    fs.writeFileSync(full, data);
  } catch (e) {
    const requestId = crypto.randomUUID();
    const code = storageErrorCode(e);
    console.error(`[uploads] storage failure id=${requestId} code=${e.code || "unknown"} message=${e.message || e}`);
    return json(res, 503, {
      error: {
        message: code === "storage_insufficient" ? "Upload storage is temporarily full. Please retry later or contact support." : "Upload storage is temporarily unavailable. Please retry later or contact support.",
        type: "server_error",
        code,
        request_id: requestId,
      },
    });
  }

  const url = `${UPLOAD_PUBLIC_BASE}/${stored}`;
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
  return json(res, 200, {
    id: stored,
    url,
    bytes: data.length,
    content_type: UPLOAD_EXT_MIME[ext] || mime || "application/octet-stream",
    expires_at: expiresAt,
    object: "upload",
  });
}

async function handleUploadGet(req, res, pathOnly) {
  const name = path.basename(pathOnly);
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/i.test(name)) {
    return json(res, 404, {
      error: { message: "Not found", type: "invalid_request_error", code: "not_found" },
    });
  }
  const uploadRoot = path.resolve(UPLOAD_DIR);
  const full = path.resolve(uploadRoot, name);
  const relative = path.relative(uploadRoot, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return json(res, 404, {
      error: { message: "Not found", type: "invalid_request_error", code: "not_found" },
    });
  }
  if (!fs.existsSync(full)) {
    return json(res, 404, {
      error: { message: "Not found", type: "invalid_request_error", code: "not_found" },
    });
  }
  try {
    const st = fs.statSync(full);
    if (Date.now() - st.mtimeMs > UPLOAD_TTL_MS) {
      try {
        fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
      return json(res, 404, {
        error: {
          message: "Upload expired",
          type: "invalid_request_error",
          code: "expired",
        },
      });
    }
    const ext = path.extname(name).toLowerCase();
    const mime = UPLOAD_EXT_MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": st.size,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") return res.end();
    await pipeline(fs.createReadStream(full), res);
  } catch (e) {
    if (res.destroyed || res.headersSent) return;
    console.error("[uploads] get", e.message || e);
    return json(res, 500, {
      error: { message: "Failed to read upload", type: "api_error" },
    });
  }
}

async function screenPrompt(prompt, externalId) {
  if (!CREEM_KEY) {
    const err = new Error("CREEM_API_KEY not configured");
    err.code = "moderation_not_configured";
    throw err;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${CREEM_BASE}/v1/moderation/prompt`, {
      method: "POST",
      headers: {
        "x-api-key": CREEM_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        external_id: externalId,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      const err = new Error(`moderation_http_${r.status}: ${text.slice(0, 200)}`);
      err.code = "moderation_unavailable";
      throw err;
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function extractPrompt(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.prompt === "string") return payload.prompt;
  return "";
}

async function decodeBody(buf, encoding) {
  const enc = (encoding || "").toLowerCase();
  if (!enc || enc === "identity") return buf;
  if (enc.includes("br")) return brotliDecompress(buf);
  if (enc.includes("gzip")) return gunzip(buf);
  if (enc.includes("deflate")) return inflate(buf);
  return buf;
}

async function proxyRequest(req, res, bodyBuf) {
  const target = new URL(req.url || "/", UPSTREAM);
  // 避免与 Caddy encode gzip 叠压，导致前端 JS 传输中断、官网白屏
  const headers = proxyRequestHeaders(req.headers, target);

  const upstreamRes = await fetch(target, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "") ? undefined : bodyBuf,
    redirect: "manual",
  });

  const outHeaders = {};
  upstreamRes.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === "transfer-encoding") return;
    outHeaders[k] = v;
  });

  const ctype = String(upstreamRes.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("text/event-stream") && upstreamRes.body) {
    delete outHeaders["content-length"];
    delete outHeaders["Content-Length"];
    delete outHeaders["content-encoding"];
    delete outHeaders["Content-Encoding"];
    res.writeHead(upstreamRes.status, outHeaders);
    res.flushHeaders();
    try {
      await pipeline(Readable.fromWeb(upstreamRes.body), res);
    } catch (e) {
      if (e?.code !== "ERR_STREAM_PREMATURE_CLOSE") throw e;
    }
    return;
  }

  let buf = Buffer.from(await upstreamRes.arrayBuffer());
  const pathOnly = (req.url || "/").split("?")[0];

  // 模型广场：按供应商顺序重排 /api/pricing（绕过无 display_order 的旧 New API）
  if (
    req.method === "GET" &&
    pathOnly === "/api/pricing" &&
    ctype.includes("application/json") &&
    buf.length > 0
  ) {
    try {
      const enc = upstreamRes.headers.get("content-encoding") || "";
      let raw = await decodeBody(buf, enc);
      const parsed = JSON.parse(raw.toString("utf8"));
      const reordered =
        parsed && parsed.success === false
          ? parsed
          : reorderPricingPayload(parsed);
      buf = Buffer.from(JSON.stringify(reordered), "utf8");
      delete outHeaders["content-encoding"];
      delete outHeaders["Content-Encoding"];
      outHeaders["content-length"] = String(buf.length);
      delete outHeaders["Content-Length"];
      outHeaders["content-type"] = "application/json; charset=utf-8";
    } catch (e) {
      console.error("[pricing-reorder]", e.message || e);
    }
  }

  const isSpaShell =
    req.method === "GET" &&
    ctype.includes("text/html") &&
    buf.includes('id="root"');

  // Auth pages use the same SPA document as the console, but they do not need
  // the pricing/model marketing patches. Injecting those large scripts into
  // every SPA response made /sign-in and /sign-up parse and execute roughly
  // 150 KB of unrelated code before the form could render. Consent and loading
  // states are controlled by the auth UI itself.
  const isAuthPage = /^\/(?:sign-in|sign-up|login|register|forgot-password|reset|user\/reset|otp)(?:\/|$)/.test(pathOnly);
  // Pricing patches must ship on every non-auth SPA shell. If we only inject on
  // /pricing HTML, client-side navigations from / or /console never get the
  // Group price-table script — users still see native「按分组定价」only.
  const wantPricingPatches = !isAuthPage;

  if (isSpaShell && buf.length > 0) {
    try {
      const enc = upstreamRes.headers.get("content-encoding") || "";
      let htmlBuf = await decodeBody(buf, enc);
      let html = htmlBuf.toString("utf8");
      let changed = false;
      if (isAuthPage && !html.includes("keyo-pricing-loader-v1")) {
        html = html.replace("<head>", `<head>${PRICING_UI_LOADER}`);
        changed = true;
      }
      if (wantPricingPatches && !html.includes("keyo-copy-toast-v1")) {
        const ac = `<!--keyo-copy-toast-v1-->${COPY_TOAST_AUTOCLOSE_SCRIPT}`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${ac}`);
          changed = true;
        } else if (html.includes("</body>")) {
          html = html.replace("</body>", `${ac}</body>`);
          changed = true;
        }
      }
      if (wantPricingPatches && !html.includes("keyo-models-public")) {
        const pub = `<!--keyo-models-public-->${MODELS_PUBLIC_SCRIPT}`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${pub}`);
          changed = true;
        } else if (html.includes("</body>")) {
          html = html.replace("</body>", `${pub}</body>`);
          changed = true;
        }
      }
      // v20: billing inject on all non-auth SPA shells (SPA soft-nav safe)
      if (wantPricingPatches && !html.includes("keyo-pricing-sort-v21")) {
        html = html
          .replace(/<!--keyo-pricing-sort(?:-v\d+)?-->[\s\S]*?<\/script>/g, "")
          .replace(/<!--keyo-billing-unit-->[\s\S]*?<\/script>/g, "")
          .replace(/<!--keyo-locale-desc-->[\s\S]*?<\/script>/g, "");
        const inject = `<!--keyo-pricing-sort-v21-->${PRICING_SORT_SCRIPT}<!--keyo-locale-desc-->${LOCALE_DESC_SCRIPT}<!--keyo-billing-unit-->${BILLING_UNIT_SCRIPT}${FOOTER_CLEANUP_SCRIPT}`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${inject}`);
          changed = true;
        } else if (html.includes("</body>")) {
          html = html.replace("</body>", `${inject}</body>`);
          changed = true;
        }
      }
      if (wantPricingPatches) {
        html = html.replace(/<!--keyo-model-icons(?:-v\d+)?-->[\s\S]*?<\/script>/g, "");
        const ic = `<!--keyo-model-icons-v6-->${MODEL_ICON_SCRIPT}`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${ic}`);
          changed = true;
        } else if (html.includes("</body>")) {
          html = html.replace("</body>", `${ic}</body>`);
          changed = true;
        }
      }
      // (LaunchVault badge inject removed — listing deferred.)
      if (changed) {
        buf = Buffer.from(html, "utf8");
        delete outHeaders["content-encoding"];
        delete outHeaders["Content-Encoding"];
        outHeaders["content-length"] = String(buf.length);
        delete outHeaders["Content-Length"];
        // Prevent CDN/browser from keeping a shell without pricing patches.
        outHeaders["cache-control"] = "no-store";
        outHeaders["Cache-Control"] = "no-store";
      }
    } catch (e) {
      console.error("[html-inject]", e.message || e);
    }
  }

  res.writeHead(upstreamRes.status, outHeaders);
  res.end(buf);
}

/** SPA 缺页或旧路由 → 公开品牌页 / 价目页 */
const PUBLIC_REDIRECTS = {
  "/models": "/pricing",
  "/status": "/brand/status.html",
  "/faq": "/brand/faq.html",
  "/integrations": "/brand/integrations.html",
  "/use-cases": "/brand/integrations.html",
};

function redirectPublicPaths(req, res) {
  const raw = req.url || "/";
  const q = raw.indexOf("?");
  const pathOnly = q >= 0 ? raw.slice(0, q) : raw;
  const search = q >= 0 ? raw.slice(q) : "";
  if (!["GET", "HEAD"].includes(req.method || "GET")) return false;

  let dest = PUBLIC_REDIRECTS[pathOnly];
  if (!dest && pathOnly.startsWith("/models/")) {
    dest = "/pricing" + pathOnly.slice("/models".length);
  }
  if (!dest && pathOnly.startsWith("/integrations/")) {
    dest = "/brand/integrations.html";
  }
  if (!dest && pathOnly.startsWith("/use-cases/")) {
    dest = "/brand/integrations.html";
  }
  if (!dest) return false;

  res.writeHead(302, {
    Location: dest + search,
    "Cache-Control": "no-store",
  });
  res.end();
  return true;
}

ensureUploadDir();
const uploadStorageHealth = checkUploadStorage(UPLOAD_DIR);
if (!uploadStorageHealth.ok) {
  console.error(`[uploads] startup storage check failed code=${uploadStorageHealth.code} reason=${uploadStorageHealth.reason}`);
} else {
  console.log("[uploads] startup storage read/write check passed");
}
setInterval(purgeExpiredUploads, 60 * 60 * 1000).unref?.();

const server = http.createServer(async (req, res) => {
  let lease;
  try {
    const pathOnly = (req.url || "/").split("?")[0];
    if (redirectPublicPaths(req, res)) return;
    if (["GET", "HEAD"].includes(req.method) && pathOnly === PRICING_UI_PATH) {
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Content-Length": Buffer.byteLength(PRICING_UI_JS),
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : PRICING_UI_JS);
      return;
    }
    if (IMAGE_PATHS.has(pathOnly) || /^\/v1\/images\/tasks\/[^/]+$/.test(pathOnly)) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Expose-Headers", "X-Image-Task-Id, Location, Retry-After, Idempotency-Key");
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }
    }
    if (req.method === "GET" && pathOnly === "/healthz") {
      // Startup result is immutable here: read-only diagnostics never write.
      return json(res, uploadStorageHealth.ok ? 200 : 503, { ok: uploadStorageHealth.ok, storage: uploadStorageHealth.ok ? "ready" : uploadStorageHealth.code, resources: requestBudget.health() });
    }
    if (pathOnly === "/chat/completions") {
      return json(res, 404, {
        error: {
          message: "Base URL must be https://www.keyoapi.xyz/v1; this request is missing /v1.",
          type: "invalid_request_error",
          code: "base_url_missing_v1",
        },
      });
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "")) {
      lease = requestBudget.acquire();
      requestLeases.set(req, lease);
    }
    if (
      req.method === "POST" &&
      (pathOnly === "/v1/uploads" || pathOnly === "/v1/files")
    ) {
      await handleUploadPost(req, res);
      return;
    }
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      pathOnly.startsWith("/uploads/")
    ) {
      await handleUploadGet(req, res, pathOnly);
      return;
    }

    let bodyBuf;
    try {
      bodyBuf = ["GET", "HEAD", "OPTIONS"].includes(req.method || "")
        ? Buffer.alloc(0)
        : await readBodyLimited(req, PROXY_MAX_BODY_BYTES);
    } catch (e) {
      if (e.code === "payload_too_large") {
        return json(res, 413, {
          error: {
            message: `Request body too large (max ${PROXY_MAX_BODY_BYTES} bytes). Split or compress the file, or upload via /v1/uploads and pass the URL.`,
            type: "invalid_request_error",
            code: "payload_too_large",
          },
        });
      }
      throw e;
    }

    let imagePayload;
    if (req.method === "POST" && IMAGE_PATHS.has(pathOnly)) {
      let payload;
      try {
        ({ payload } = parseImageBody(bodyBuf, String(req.headers["content-type"] || "")));
        imagePayload = payload;
      } catch (e) {
        return json(res, e.status || 400, {
          error: { message: e.message, code: e.code || "invalid_image_request", type: "invalid_request_error" },
        });
      }
      const prompt = extractPrompt(payload).trim();
      if (!prompt) {
        return json(res, 400, {
          error: {
            message: "prompt is required for image generation and must be screened",
            type: "invalid_request_error",
            code: "prompt_required",
          },
        });
      }

      let moderation;
      try {
        moderation = await screenPrompt(prompt, `keyo:${crypto.randomUUID()}`);
      } catch (e) {
        console.error("[creem-moderation]", e.message || e);
        return json(res, 503, {
          error: {
            message: "Content moderation temporarily unavailable. Please retry.",
            type: "api_error",
            code: e.code || "moderation_unavailable",
          },
        });
      }

      const decision = String(moderation?.decision || "").toLowerCase();
      if (decision === "deny" || decision === "flag") {
        return json(res, 400, {
          error: {
            message:
              "Your prompt was rejected because it violates our content policy. Please revise and try again.",
            type: "invalid_request_error",
            code: decision === "flag" ? "prompt_flagged" : "prompt_rejected",
          },
        });
      }
      if (decision !== "allow") {
        return json(res, 503, {
          error: {
            message: "Content moderation returned an unexpected decision.",
            type: "api_error",
            code: "moderation_unavailable",
          },
        });
      }
    }

    if (imagePayload && IMAGE_GEN_MODELS.has(String(imagePayload.model || "")) && pathOnly === "/v1/images/variations") {
      return json(res, 400, { error: { message: "Native image variations are unsupported; use images/edits with a screened prompt", type: "invalid_request_error", code: "unsupported_image_operation" } });
    }

    if (imagePayload && IMAGE_GEN_MODELS.has(String(imagePayload.model || "")) &&
        ["/v1/images/generations", "/v1/images/edits"].includes(pathOnly)) {
      // Text and reference requests share one native contract. Screening above
      // must finish before any submission. A transport failure may already have
      // created a task, so never resubmit through another contract.
      try {
        const normalizedReq = { method: req.method, headers: { ...req.headers, "content-type": "application/json" } };
        delete normalizedReq.headers["content-encoding"];
        writeProxy(res, await proxyRaw(`${VIDEO_GEN}/v1/images/generations${qsOf(req.url)}`, normalizedReq, Buffer.from(JSON.stringify(imagePayload))));
      } catch (e) {
        const requestId = crypto.randomUUID();
        // undici wraps transport failures (ECONNRESET, timeouts, ...) in a
        // TypeError whose `cause` carries the real code — log both so a
        // production 502 is diagnosable from the container logs alone.
        console.error(`[native-image] forwarding failed id=${requestId} reason=${e.name || "transport_error"} cause=${e.cause?.code || e.cause?.name || "none"}`);
        return json(res, 502, { error: {
          message: "Image service response unavailable. A task may have been created; retry with the same Idempotency-Key or query its task ID.",
          type: "api_error", code: "image_forwarding_failed", request_id: requestId,
        } });
      }
      return;
    }

    if (req.method === "GET" && /^\/v1\/images\/tasks\/[^/]+$/.test(pathOnly)) {
      try { writeProxy(res, await proxyRaw(`${VIDEO_GEN}${req.url}`, req, bodyBuf, 15000)); }
      catch (e) {
        const requestId = crypto.randomUUID();
        console.error(`[native-image] task query failed id=${requestId} reason=${e.name || "transport_error"}`);
        return json(res, 502, { error: { message: "Image task query temporarily unavailable", type: "api_error", code: "image_task_unavailable", request_id: requestId } });
      }
      return;
    }

    // Video generation models are served by the video-gen service, not New API
    // (no channel exists for them there). Clients submit to either the legacy
    // /v1/videos path or the OpenAI-style /v1/videos/generations path, so route
    // both by model name; anything else still falls through to New API.
    if (
      req.method === "POST" &&
      (pathOnly === "/v1/videos" || pathOnly === "/v1/videos/generations")
    ) {
      try {
        const payload = JSON.parse(bodyBuf.toString("utf8") || "{}");
        if (VIDEO_GEN_MODELS.has(String(payload.model || ""))) {
          writeProxy(
            res,
            await proxyRaw(
              `${VIDEO_GEN}/v1/videos/generations${qsOf(req.url)}`,
              req,
              bodyBuf
            )
          );
          return;
        }
      } catch {
        /* invalid JSON → New API */
      }
    }

    const pollM = /^\/v1\/videos\/([^/]+)(\/content)?$/.exec(pathOnly);
    if (req.method === "GET" && pollM && pollM[1] !== "generations") {
      const primary = await proxyRaw(`${UPSTREAM}${req.url}`, req, bodyBuf);
      if (!looksLikeMissingVideo(primary.status, primary.buf)) {
        writeProxy(res, primary);
        return;
      }
      try {
        const alt = await proxyRaw(
          `${VIDEO_GEN}/v1/videos/${pollM[1]}${pollM[2] || ""}${qsOf(req.url)}`,
          req,
          bodyBuf
        );
        if (!looksLikeMissingVideo(alt.status, alt.buf) || alt.status < 400) {
          writeProxy(res, alt);
          return;
        }
      } catch (e) {
        console.error("[video-gen-poll]", e.message || e);
      }
      writeProxy(res, primary);
      return;
    }

    let forwardBody = bodyBuf;
    // Some OpenAI clients attach this vendor extension to every model. The
    // Nemotron route rejects it before generation; other models retain it.
    if (req.method === "POST" && pathOnly === "/v1/chat/completions" &&
        String(req.headers["content-type"] || "").includes("application/json")) {
      try {
        const payload = JSON.parse(bodyBuf.toString("utf8"));
        if (payload.model === "nemotron-3-ultra-550b-a55b:free") {
          delete payload.enable_thinking;
          if (payload.extra_body && typeof payload.extra_body === "object") delete payload.extra_body.enable_thinking;
          forwardBody = Buffer.from(JSON.stringify(payload));
        }
      } catch { /* Preserve malformed JSON for the API's normal validation. */ }
    }

    await proxyRequest(req, res, forwardBody);
  } catch (e) {
    if (e.code === "request_body_budget_exceeded" && !res.headersSent && !res.destroyed) {
      res.setHeader("Connection", "close");
      const image = IMAGE_PATHS.has((req.url || "").split("?")[0]);
      return json(res, 413, { error: { message: e.message, type: "invalid_request_error", code: image ? "image_body_too_large" : e.code } });
    }
    if (e.code === "request_capacity_exceeded") {
      req.resume();
      if (!res.headersSent && !res.destroyed) {
        res.setHeader("Retry-After", "5");
        res.setHeader("Connection", "close");
        return json(res, 503, { error: { message: e.message, type: "api_error", code: e.code } });
      }
    }
    if (!req.aborted) console.error("[proxy]", e.code || "request_failed");
    if (!res.headersSent && !res.destroyed) {
      json(res, 502, {
        error: { message: "Bad gateway", type: "api_error" },
      });
    }
  } finally {
    lease?.release();
    requestLeases.delete(req);
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `creem-moderation-proxy on http://${HOST}:${PORT} -> ${UPSTREAM} (creem ${TEST_MODE ? "test" : "live"}; rankings=actual; uploads ${UPLOAD_DIR} → ${UPLOAD_PUBLIC_BASE})`
  );
});

const FOOTER_CLEANUP_SCRIPT = `<script>(function(){if(window.__keyoFooterClean)return;window.__keyoFooterClean=1;function clean(){try{document.querySelectorAll('footer a[href*="github.com/QuantumNous"],footer a[href*="github.com/songquanpeng"]').forEach(function(a){var p=a.parentElement;if(p&&p.textContent.indexOf('© 2026')!==-1)p.remove();else a.remove()})}catch(e){}}clean();setInterval(clean,500)})();</script>`;
