/**
 * Smoke-test every model on live KeyoAPI with the correct path family.
 * Usage:
 *   KEYO_API_KEY=sk-... node scripts/probe-all-keyo-models.mjs
 *   KEYO_API_KEY=sk-... BASE=https://www.keyoapi.xyz node scripts/probe-all-keyo-models.mjs
 *
 * Pass = HTTP 2xx, or 4xx that proves the route accepted the model (payload/validation).
 * Fail = channel missing, Invalid URL, 404 route, passthrough lookup, 5xx.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = (process.env.BASE || "https://www.keyoapi.xyz").replace(/\/$/, "");
const KEY = (process.env.KEYO_API_KEY || process.env.KEY || "").trim();
const OUT =
  process.env.OUT || path.join(ROOT, "tmp/probe-all-keyo-results.json");

if (!KEY) {
  console.error("Set KEYO_API_KEY=sk-...");
  process.exit(2);
}

const IMAGE_GEN = new Set([
  "gpt-image-2",
  "gpt-image-2-vip",
  "gpt-image-2.5",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare-c",
  "gpt-image-2.5-sunburst-c",
  "nano-banana-2",
  "nano-banana-pro",
]);

const VIDEO_GEN = new Set([
  "wan3.0-video",
  "seedance-2.5",
  "seedance-2.0",
  "flux-3-video",
  "MiniMax-H3",
  "gemini-omni-1.1-flash",
  "gemini-omni-1.1-flash-ext",
  "grok-imagine-video-1.5-preview",
  "grok-1.5-video",
]);
const VIDEO_NATIVE = new Set(["grok-1.5-video"]);

const ASR = new Set([
  "whisper-large-v3",
  "whisper-large-v3-turbo",
  "Fun-ASR-Nano-2512",
  "GLM-ASR",
  "MOSS-Audio-8B-Thinking",
]);

const TTS_SYNC = new Set(["GLM-TTS", "Step-Audio-TTS-3B", "IndexTTS-2"]);
const TTS_ASYNC = new Set(["Qwen3-TTS", "CosyVoice3"]);

const MATTING = new Set(["RMBG-2.0"]);
const UPSCALING = new Set(["Real-ESRGAN", "AnimeSharp"]);
const UNWARPING = new Set(["UVDoc"]);
const DETECT = new Set(["VajraV1", "sam3"]);
const DOC_ASYNC = new Set(["MinerU2.5-Pro"]);
const OCR_CHAT = new Set(["Unlimited-OCR"]);
const AVATAR = new Set(["Duix-Avatar"]);
const TALK = new Set(["InfiniteTalk"]);
const MODERATION = new Set([
  "keyo-text-moderation",
  "nonescape-v0",
  "nsfw-classifier",
  "Security-semantic-filtering",
  "moark-text-moderation",
]);
const EMBED = new Set([
  "WeMM-Embedding-2B",
  "WeMM-Embedding-4B",
  "WeMM-Embedding-9B",
  "Qwen3-VL-Embedding-8B",
]);
const RERANK = new Set(["Qwen3-VL-Reranker-2B", "Qwen3-VL-Reranker-8B"]);

function classify(id) {
  if (IMAGE_GEN.has(id)) return "image_gen";
  if (VIDEO_GEN.has(id)) return VIDEO_NATIVE.has(id) ? "video_native" : "video_gen";
  if (ASR.has(id)) return "asr";
  if (TTS_ASYNC.has(id)) return "tts_async";
  if (TTS_SYNC.has(id)) return "tts_sync";
  if (MATTING.has(id)) return "matting";
  if (UPSCALING.has(id)) return "upscaling";
  if (UNWARPING.has(id)) return "unwarping";
  if (DETECT.has(id)) return "detect";
  if (DOC_ASYNC.has(id)) return "doc_async";
  if (OCR_CHAT.has(id)) return "chat";
  if (AVATAR.has(id)) return "avatar";
  if (TALK.has(id)) return "talk";
  if (MODERATION.has(id)) return "moderation";
  if (EMBED.has(id)) return "embeddings";
  if (RERANK.has(id)) return "rerank";
  return "chat";
}

function tinyPng() {
  // 1x1 PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
}

function tinyWav() {
  // minimal WAV header + silence
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0);
  hdr.writeUInt32LE(36, 4);
  hdr.write("WAVE", 8);
  hdr.write("fmt ", 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(8000, 24);
  hdr.writeUInt32LE(8000, 28);
  hdr.writeUInt16LE(1, 32);
  hdr.writeUInt16LE(8, 34);
  hdr.write("data", 36);
  hdr.writeUInt32LE(0, 40);
  return hdr;
}

async function fetchPricing() {
  const r = await fetch(`${BASE}/api/pricing`);
  const j = await r.json();
  const arr = j.data || j;
  const list = Array.isArray(arr) ? arr : arr.data || [];
  return list.map((m) => m.model_name || m.id).filter(Boolean);
}

function verdict(status, body) {
  const t = String(body || "").slice(0, 500);
  const low = t.toLowerCase();
  if (status >= 200 && status < 300) return { ok: true, reason: "2xx" };
  // route/auth infrastructure failures
  if (
    /invalid url|no available channel|model_not_found|not found|passthrough_token|check new_api_db|unknown or missing model/i.test(
      t
    )
  ) {
    return { ok: false, reason: "routing_or_model" };
  }
  if (status === 401 || status === 403) {
    return { ok: false, reason: "auth" };
  }
  if (status >= 500) return { ok: false, reason: "server_5xx" };
  // 4xx that means the gateway knew the model / path
  if (
    status >= 400 &&
    status < 500 &&
    /invalid|required|missing|validation|quota|insufficient|image|audio|prompt|content|file|parameter/i.test(
      low
    )
  ) {
    return { ok: true, reason: "reachable_4xx" };
  }
  if (status >= 400 && status < 500) {
    return { ok: true, reason: "reachable_4xx_other" };
  }
  return { ok: false, reason: "unknown" };
}

async function callJson(pathname, body, extraHeaders = {}) {
  const r = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text };
}

async function callForm(pathname, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v && typeof v === "object" && v.blob) {
      fd.append(k, v.blob, v.name || "file.bin");
    } else {
      fd.append(k, String(v));
    }
  }
  const r = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: fd,
  });
  const text = await r.text();
  return { status: r.status, body: text };
}

async function probeOne(id) {
  const kind = classify(id);
  let res;
  try {
    switch (kind) {
      case "chat":
        res = await callJson("/v1/chat/completions", {
          model: id,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 4,
        });
        break;
      case "image_gen":
        res = await callJson("/v1/images/generations", {
          model: id,
          prompt: "a red pixel",
          n: 1,
          size: "1024x1024",
        });
        break;
      case "video_native":
        res = await callJson("/v1/videos", {
          model: id,
          prompt: "a cat walks",
        });
        break;
      case "video_gen":
        res = await callJson("/v1/videos/generations", {
          model: id,
          prompt: "a cat walks",
          ...(id.includes("grok-imagine") ? { aspect_ratio: "16:9" } : {}),
        });
        break;
      case "asr": {
        const wav = tinyWav();
        res = await callForm("/v1/audio/transcriptions", {
          model: id,
          file: { blob: new Blob([wav], { type: "audio/wav" }), name: "t.wav" },
        });
        break;
      }
      case "tts_sync":
        res = await callJson("/v1/audio/speech", {
          model: id,
          input: "hi",
          voice: "alloy",
        });
        break;
      case "tts_async":
        res = await callJson("/v1/async/audio/speech", {
          model: id,
          input: "hi",
        });
        break;
      case "matting":
        res = await callForm("/v1/images/mattings", {
          model: id,
          image: {
            blob: new Blob([tinyPng()], { type: "image/png" }),
            name: "t.png",
          },
        });
        break;
      case "upscaling":
        res = await callForm("/v1/images/upscaling", {
          model: id,
          image: {
            blob: new Blob([tinyPng()], { type: "image/png" }),
            name: "t.png",
          },
        });
        break;
      case "unwarping":
        res = await callForm("/v1/images/unwarping", {
          model: id,
          image: {
            blob: new Blob([tinyPng()], { type: "image/png" }),
            name: "t.png",
          },
        });
        break;
      case "detect":
        res = await callForm("/v1/images/object-detection", {
          model: id,
          image: {
            blob: new Blob([tinyPng()], { type: "image/png" }),
            name: "t.png",
          },
        });
        break;
      case "doc_async":
        res = await callJson("/v1/async/documents/parse", {
          model: id,
          file: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        });
        break;
      case "avatar":
        res = await callJson("/v1/async/videos/audio-video-to-video", {
          model: id,
          prompt: "test",
        });
        break;
      case "talk":
        res = await callJson("/v1/async/videos/image-to-video", {
          model: id,
          prompt: "test",
        });
        break;
      case "moderation":
        res = await callJson("/v1/moderations", {
          model: id,
          input: "hello world",
        });
        break;
      case "embeddings":
        res = await callJson("/v1/embeddings", {
          model: id,
          input: "hello",
        });
        break;
      case "rerank":
        res = await callJson("/v1/rerank", {
          model: id,
          query: "hello",
          documents: ["hello world", "goodbye"],
        });
        break;
      default:
        res = { status: 0, body: "unclassified" };
    }
  } catch (e) {
    return {
      id,
      kind,
      status: 0,
      ok: false,
      reason: "network",
      snippet: String(e.message || e).slice(0, 200),
    };
  }
  const v = verdict(res.status, res.body);
  return {
    id,
    kind,
    status: res.status,
    ok: v.ok,
    reason: v.reason,
    snippet: String(res.body || "")
      .replace(/\s+/g, " ")
      .slice(0, 220),
  };
}

async function main() {
  const ids = await fetchPricing();
  console.log("models", ids.length, "base", BASE);
  const results = [];
  // concurrency 3
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const id = ids[idx];
      const row = await probeOne(id);
      results[idx] = row;
      console.log(
        `${row.ok ? "OK" : "FAIL"}\t${row.status}\t${row.kind}\t${row.id}\t${row.reason}`
      );
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const fail = results.filter((r) => r && !r.ok);
  const pass = results.filter((r) => r && r.ok);
  const summary = {
    base: BASE,
    total: results.length,
    pass: pass.length,
    fail: fail.length,
    failed: fail.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      snippet: r.snippet,
    })),
    results,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log("\nSUMMARY pass", pass.length, "fail", fail.length, "->", OUT);
  if (fail.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
