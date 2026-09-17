/**
 * Video capability matrix probe (min resolution + shortest duration).
 * Uses public https media only — never local paths / data: URLs.
 *
 * Usage (local):
 *   KEYO_API_KEY=sk-... node scripts/probe-video-capabilities.mjs
 * Usage (VPS):
 *   KEY=$(python3 -c "..."); KEYO_API_KEY=$KEY node scripts/probe-video-capabilities.mjs
 *
 * Pass = HTTP 2xx + extractable task_id (submit accepted).
 * Fail = 4xx/5xx or no task id. Body snippets scrubbed of vendor names.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = (process.env.BASE || "https://www.keyoapi.xyz").replace(/\/$/, "");
const KEY = (process.env.KEYO_API_KEY || process.env.KEY || "").trim();
const OUT =
  process.env.OUT || path.join(ROOT, "tmp/probe-video-capabilities.json");
const PROMPT = "a red balloon floating gently, cinematic, short clip";

if (!KEY) {
  console.error("Set KEYO_API_KEY=sk-...");
  process.exit(2);
}

// Stable public assets (https only)
const IMG_A = "https://picsum.photos/seed/keyo-a/640/480.jpg";
const IMG_B = "https://picsum.photos/seed/keyo-b/640/480.jpg";
const VID_5S = "https://samplelib.com/lib/preview/mp4/sample-5s.mp4";
const AUD = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

/**
 * Each case: { model, case, path?, body }
 * Only cases that the model is documented / expected to support.
 */
const CASES = [
  // —— seedance-2.0 ——
  {
    model: "seedance-2.0",
    case: "t2v",
    body: {
      model: "seedance-2.0",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      size: "16:9",
    },
  },
  {
    model: "seedance-2.0",
    case: "i2v_image_urls",
    body: {
      model: "seedance-2.0",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      image_urls: [IMG_A],
    },
  },
  {
    model: "seedance-2.0",
    case: "first_last_frame",
    body: {
      model: "seedance-2.0",
      prompt: "Transition from day to night, smooth",
      resolution: "480p",
      duration: 5,
      image_with_roles: [
        { url: IMG_A, role: "first_frame" },
        { url: IMG_B, role: "last_frame" },
      ],
    },
  },
  {
    model: "seedance-2.0",
    case: "ref_video",
    body: {
      model: "seedance-2.0",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      video_urls: [VID_5S],
      reference_duration: 5,
    },
  },
  {
    model: "seedance-2.0",
    case: "ref_audio",
    body: {
      model: "seedance-2.0",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      audio_urls: [AUD],
    },
  },
  {
    model: "seedance-2.0",
    case: "ref_image_video_audio",
    body: {
      model: "seedance-2.0",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      image_urls: [IMG_A],
      video_urls: [VID_5S],
      audio_urls: [AUD],
      reference_duration: 5,
    },
  },

  // —— seedance-2.5 ——
  {
    model: "seedance-2.5",
    case: "t2v",
    body: {
      model: "seedance-2.5",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
    },
  },
  {
    model: "seedance-2.5",
    case: "i2v_image_urls",
    body: {
      model: "seedance-2.5",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      image_urls: [IMG_A],
    },
  },
  {
    model: "seedance-2.5",
    case: "first_last_frame",
    body: {
      model: "seedance-2.5",
      prompt: "Transition from day to night",
      resolution: "480p",
      duration: 5,
      image_with_roles: [
        { url: IMG_A, role: "first_frame" },
        { url: IMG_B, role: "last_frame" },
      ],
    },
  },
  {
    model: "seedance-2.5",
    case: "ref_video",
    body: {
      model: "seedance-2.5",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      video_urls: [VID_5S],
      reference_duration: 5,
    },
  },
  {
    model: "seedance-2.5",
    case: "ref_audio",
    body: {
      model: "seedance-2.5",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      audio_urls: [AUD],
    },
  },

  // —— wan3.0-video ——
  {
    model: "wan3.0-video",
    case: "t2v",
    body: {
      model: "wan3.0-video",
      prompt: PROMPT,
      resolution: "480P",
      duration: 2,
    },
  },
  {
    model: "wan3.0-video",
    case: "i2v_image_urls",
    body: {
      model: "wan3.0-video",
      prompt: PROMPT,
      resolution: "480P",
      duration: 2,
      image_urls: [IMG_A],
    },
  },
  {
    model: "wan3.0-video",
    case: "first_last_frame",
    body: {
      model: "wan3.0-video",
      prompt: "Transition from day to night",
      resolution: "480P",
      duration: 2,
      image_with_roles: [
        { url: IMG_A, role: "first_frame" },
        { url: IMG_B, role: "last_frame" },
      ],
    },
  },
  {
    model: "wan3.0-video",
    case: "ref_multimodal",
    body: {
      model: "wan3.0-video",
      prompt: PROMPT,
      resolution: "480P",
      duration: 2,
      image_urls: [IMG_A],
      video_urls: [VID_5S],
      audio_urls: [AUD],
    },
  },

  // —— MiniMax-H3 ——
  {
    model: "MiniMax-H3",
    case: "t2v",
    body: {
      model: "MiniMax-H3",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      aspect_ratio: "16:9",
    },
  },
  {
    model: "MiniMax-H3",
    case: "i2v_image_urls",
    body: {
      model: "MiniMax-H3",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      image_urls: [IMG_A],
    },
  },
  {
    model: "MiniMax-H3",
    case: "first_last_frame",
    body: {
      model: "MiniMax-H3",
      prompt: "Transition from day to night",
      resolution: "480p",
      duration: 5,
      image_with_roles: [
        { url: IMG_A, role: "first_frame" },
        { url: IMG_B, role: "last_frame" },
      ],
    },
  },
  {
    model: "MiniMax-H3",
    case: "ref_multimodal",
    body: {
      model: "MiniMax-H3",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      image_urls: [IMG_A],
      video_urls: [VID_5S],
      audio_urls: [AUD],
    },
  },

  // —— flux-3-video ——
  {
    model: "flux-3-video",
    case: "t2v_draft",
    body: {
      model: "flux-3-video",
      prompt: PROMPT,
      tier: "DRAFT",
      duration: 5,
    },
  },
  {
    model: "flux-3-video",
    case: "i2v_draft",
    body: {
      model: "flux-3-video",
      prompt: PROMPT,
      tier: "DRAFT",
      duration: 5,
      image_urls: [IMG_A],
    },
  },
  {
    model: "flux-3-video",
    case: "v2v_draft",
    body: {
      model: "flux-3-video",
      prompt: PROMPT,
      tier: "V2V-DRAFT",
      duration: 5,
      video_urls: [VID_5S],
      reference_duration: 5,
    },
  },

  // —— gemini-omni-1.1-flash ——
  {
    model: "gemini-omni-1.1-flash",
    case: "t2v",
    body: {
      model: "gemini-omni-1.1-flash",
      prompt: PROMPT,
      duration: 3,
      resolution: "360p",
    },
  },
  {
    model: "gemini-omni-1.1-flash",
    case: "i2v",
    body: {
      model: "gemini-omni-1.1-flash",
      prompt: PROMPT,
      duration: 3,
      resolution: "360p",
      image_urls: [IMG_A],
    },
  },
  {
    model: "gemini-omni-1.1-flash",
    case: "first_last_frame",
    body: {
      model: "gemini-omni-1.1-flash",
      prompt: "Transition from day to night",
      duration: 3,
      resolution: "360p",
      image_with_roles: [
        { url: IMG_A, role: "first_frame" },
        { url: IMG_B, role: "last_frame" },
      ],
    },
  },

  // —— gemini-omni-1.1-flash-ext ——
  {
    model: "gemini-omni-1.1-flash-ext",
    case: "t2v_pack",
    body: {
      model: "gemini-omni-1.1-flash-ext",
      prompt: PROMPT,
      resolution: "360P",
      duration: 4,
      pack: "360P-4s",
    },
  },
  {
    model: "gemini-omni-1.1-flash-ext",
    case: "i2v",
    body: {
      model: "gemini-omni-1.1-flash-ext",
      prompt: PROMPT,
      resolution: "360P",
      duration: 4,
      image_urls: [IMG_A],
    },
  },
  {
    model: "gemini-omni-1.1-flash-ext",
    case: "ref_video",
    body: {
      model: "gemini-omni-1.1-flash-ext",
      prompt: PROMPT,
      resolution: "360P",
      duration: 4,
      video_urls: [VID_5S],
      reference_duration: 5,
    },
  },
  {
    model: "gemini-omni-1.1-flash-ext",
    case: "ref_3images",
    body: {
      model: "gemini-omni-1.1-flash-ext",
      prompt: PROMPT,
      resolution: "360P",
      duration: 4,
      image_urls: [IMG_A, IMG_B, IMG_A],
    },
  },

  // —— grok-imagine (i2v only) ——
  {
    model: "grok-imagine-video-1.5-preview",
    case: "i2v_required",
    body: {
      model: "grok-imagine-video-1.5-preview",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      aspect_ratio: "16:9",
      image: { url: IMG_A },
    },
  },
  {
    model: "grok-imagine-video-1.5-preview",
    case: "t2v_should_400",
    expectStatus: [400],
    body: {
      model: "grok-imagine-video-1.5-preview",
      prompt: PROMPT,
      resolution: "480p",
      duration: 5,
      aspect_ratio: "16:9",
    },
  },

  // —— grok-1.5-video (native /v1/videos) ——
  {
    model: "grok-1.5-video",
    case: "t2v",
    path: "/v1/videos",
    body: { model: "grok-1.5-video", prompt: PROMPT },
  },
  {
    model: "grok-1.5-video",
    case: "ref_image",
    path: "/v1/videos",
    body: {
      model: "grok-1.5-video",
      prompt: PROMPT,
      image_urls: [IMG_A],
    },
  },
];

function scrub(s) {
  return String(s || "")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "sk-***")
    .replace(/grsai|dakka|apimart|openlux|gitee|moark|模力方舟/gi, "provider")
    .replace(/\s+/g, " ")
    .slice(0, 280);
}

function extractTaskId(payload) {
  try {
    const j = JSON.parse(payload);
    if (Array.isArray(j.data) && j.data[0]?.task_id) return j.data[0].task_id;
    if (j.data?.task_id) return j.data.task_id;
    if (j.data?.id) return j.data.id;
    if (j.task_id) return j.task_id;
    if (j.id) return j.id;
    if (j.request_id) return j.request_id;
  } catch {}
  return "";
}

async function submit(c) {
  const pathname = c.path || "/v1/videos/generations";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch(`${BASE}${pathname}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(c.body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    clearTimeout(timer);
    return { status: r.status, text };
  } catch (e) {
    clearTimeout(timer);
    return { status: 0, text: String(e.name || e.message || e) };
  }
}

function judge(c, status, text) {
  const tid = extractTaskId(text);
  if (Array.isArray(c.expectStatus) && c.expectStatus.includes(status)) {
    return { ok: true, reason: `expected_${status}`, task_id: tid };
  }
  if (status >= 200 && status < 300 && tid) {
    return { ok: true, reason: "submit_ok", task_id: tid };
  }
  if (status >= 200 && status < 300 && !tid) {
    return { ok: false, reason: "2xx_no_task_id", task_id: "" };
  }
  return { ok: false, reason: `http_${status}`, task_id: tid };
}

const results = [];
console.log(`BASE=${BASE} cases=${CASES.length}`);
for (const c of CASES) {
  const { status, text } = await submit(c);
  const j = judge(c, status, text);
  const row = {
    model: c.model,
    case: c.case,
    path: c.path || "/v1/videos/generations",
    status,
    ok: j.ok,
    reason: j.reason,
    task_id: j.task_id ? String(j.task_id).slice(0, 12) + "…" : "",
    body: scrub(text),
  };
  results.push(row);
  const mark = j.ok ? "PASS" : "FAIL";
  console.log(`${mark}\t${c.model}\t${c.case}\t${status}\t${j.reason}\t${scrub(text)}`);
}

const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
const summary = { at: new Date().toISOString(), base: BASE, pass, fail, results };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(`\nDONE pass=${pass} fail=${fail} out=${OUT}`);

// compact matrix
const models = [...new Set(results.map((r) => r.model))];
console.log("\n=== MATRIX ===");
for (const m of models) {
  const rows = results.filter((r) => r.model === m);
  console.log(
    m,
    rows.map((r) => `${r.case}:${r.ok ? "OK" : "X"}`).join(" | ")
  );
}
process.exit(fail ? 1 : 0);
