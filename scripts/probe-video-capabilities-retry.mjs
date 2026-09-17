/**
 * Retest only failed / auth-suspect video cases (min cost).
 * KEYO_API_KEY=sk-... node scripts/probe-video-capabilities-retry.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE || "https://www.keyoapi.xyz").replace(/\/$/, "");
const KEY = (process.env.KEYO_API_KEY || process.env.KEY || "").trim();
const OUT = path.join(__dirname, "../tmp/probe-video-retry.json");
const PROMPT = "a red balloon floating gently, cinematic, short clip";
const IMG_A = "https://picsum.photos/seed/keyo-a/640/480.jpg";
const IMG_B = "https://picsum.photos/seed/keyo-b/640/480.jpg";
const VID_5S = "https://samplelib.com/lib/preview/mp4/sample-5s.mp4";
const AUD = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

if (!KEY) {
  console.error("Set KEYO_API_KEY");
  process.exit(2);
}

const CASES = [
  // real fails from first run
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
  // 401 cascade — recheck auth/quota
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
    model: "grok-1.5-video",
    case: "t2v",
    path: "/v1/videos",
    body: { model: "grok-1.5-video", prompt: PROMPT },
  },
];

function scrub(s) {
  return String(s || "")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "sk-***")
    .replace(/grsai|dakka|apimart|openlux|gitee|moark|模力方舟/gi, "provider")
    .replace(/\s+/g, " ")
    .slice(0, 320);
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

const results = [];
for (const c of CASES) {
  const pathname = c.path || "/v1/videos/generations";
  let status = 0;
  let text = "";
  try {
    const r = await fetch(`${BASE}${pathname}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(c.body),
      signal: AbortSignal.timeout(90000),
    });
    status = r.status;
    text = await r.text();
  } catch (e) {
    text = String(e.message || e);
  }
  const tid = extractTaskId(text);
  const ok = status >= 200 && status < 300 && !!tid;
  results.push({
    model: c.model,
    case: c.case,
    status,
    ok,
    tid: tid ? tid.slice(0, 10) + "…" : "",
    body: scrub(text),
  });
  console.log(
    `${ok ? "PASS" : "FAIL"}\t${c.model}\t${c.case}\t${status}\t${scrub(text)}`
  );
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const pass = results.filter((r) => r.ok).length;
console.log(`DONE_RETRY pass=${pass} fail=${results.length - pass}`);
