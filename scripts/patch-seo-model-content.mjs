/**
 * Patch config/seo/model-pages.json:
 * - real endpoints
 * - strip shared boilerplate tails
 * - add uniqueBlurb + curlExample
 * Usage: node scripts/patch-seo-model-content.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const file = path.join(root, "config/seo/model-pages.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const SHARED_SNIPPETS = [
  /KeyoAPI is an OpenAI-compatible AI API relay: one base URL, one API key, and dozens of models spanning chat, speech, vision, OCR, and digital humans\. Switch models by changing the model string—no new SDKs\./g,
  /KeyoAPI targets overseas developers who want a cheap llm api[\s\S]*?for simpler accounting\./g,
];

const ENDPOINTS = {
  "whisper-large-v3": "POST /v1/audio/transcriptions",
  "whisper-large-v3-turbo": "POST /v1/audio/transcriptions",
  "claude-fable-5-1": "POST /v1/chat/completions",
  "claude-fable-5": "POST /v1/chat/completions",
  "claude-opus-5": "POST /v1/chat/completions",
  "claude-sonnet-5": "POST /v1/chat/completions",
  "gpt-5.6-terra": "POST /v1/chat/completions",
  "gpt-5.6-sol": "POST /v1/chat/completions",
  "gpt-5.6-luna": "POST /v1/chat/completions",
  "MinerU2.5-Pro": "POST /v1/async/documents/parse",
  "Unlimited-OCR": "POST /v1/chat/completions",
  UVDoc: "POST /v1/images/unwarping",
  "Qwen3-TTS": "POST /v1/async/audio/speech",
  "RMBG-2.0": "POST /v1/images/mattings",
  VajraV1: "POST /v1/images/object-detection",
  sam3: "POST /v1/images/segmentation",
  "Real-ESRGAN": "POST /v1/images/upscaling",
  AnimeSharp: "POST /v1/images/upscaling",
  "Duix-Avatar": "POST /v1/async/videos/audio-video-to-video",
  InfiniteTalk: "POST /v1/async/videos/image-to-video",
};

const UNIQUE = {
  "whisper-large-v3":
    "Unlike minute-billed Whisper hosts, Keyo meters whisper-large-v3 per request, so short clips stay predictable. Pair Turbo for live UX and keep Large V3 for archival transcripts on the same key.",
  "whisper-large-v3-turbo":
    "Turbo is the latency lane: ship interactive voice UX here, then fall back to whisper-large-v3 when fidelity beats speed. Feature-flag the model string without changing auth.",
  "claude-fable-5-1":
    "Treat Fable 5.1 as the planner in multi-agent graphs—long-horizon coding and research—then demote routine steps to Sonnet or Luna so token spend stays intentional.",
  "claude-fable-5":
    "Fable 5 is the flagship Claude-class default when Sonnet stalls on hard agent loops, still purchased through the same OpenAI-compatible chat completions path.",
  "claude-opus-5":
    "Reserve Opus 5 for stubborn refactors and tool-heavy agents; keep Sonnet/Luna on the hot path so Claude API pricing does not explode on every request.",
  "claude-sonnet-5":
    "Sonnet 5 is the production Claude workhorse for support, RAG, and light coding—strong enough daily, cheap enough to leave as the default model string.",
  "gpt-5.6-terra":
    "Terra is the everyday GPT-class default for Q&A and assistants. Route only the hard tail to Sol or Claude so gpt api pricing stays finance-friendly.",
  "gpt-5.6-sol":
    "Sol is the escalation GPT-5.6 tier: stronger instruction following for dense analysis, while Luna/Terra absorb bulk traffic.",
  "gpt-5.6-luna":
    "Luna exists for volume: tagging, triage, drafts, and batch transforms where cheap llm api unit economics matter more than peak IQ.",
  "MinerU2.5-Pro":
    "MinerU2.5-Pro is the async PDF/layout parser—submit once, poll /v1/task/{id}, then feed structured text to your LLM. Prefer it over chat-OCR for multi-page packets.",
  "Unlimited-OCR":
    "Unlimited-OCR stays on chat completions so existing multimodal clients can paste images/PDFs without a second SDK; use MinerU when you need dedicated async parse jobs.",
  UVDoc:
    "UVDoc is preprocessing, not OCR: unwarp curved phone scans first, then hand the flattened image to MinerU or Unlimited-OCR for higher text accuracy.",
  "Qwen3-TTS":
    "Qwen3-TTS is async speech with clone-friendly voices—create via /v1/async/audio/speech, poll the task, then play the audio URL in your product.",
  "RMBG-2.0":
    "RMBG-2.0 is a true matting API on /v1/images/mattings (multipart image upload), not a chat toy. Metered near $0.0068/request for catalog and avatar pipelines.",
  VajraV1:
    "VajraV1 exposes YOLO-style detection (and related segmentation/pose routes) for retail and industrial CV without standing up your own GPU fleet.",
  sam3:
    "sam3 delivers open-vocabulary masks on /v1/images/segmentation—prompt arbitrary objects without a closed class list, then pipe masks into editors or analytics.",
  "Real-ESRGAN":
    "Real-ESRGAN upscales real photos on /v1/images/upscaling when marketplace or mobile captures need sharper pixels before OCR or publishing.",
  AnimeSharp:
    "AnimeSharp is the illustration/anime upscaler sibling of Real-ESRGAN—keep line art sharp instead of photoreal texture guesses.",
  "Duix-Avatar":
    "Duix-Avatar is async audio+video→talking avatar: post to /v1/async/videos/audio-video-to-video and poll /v1/task/{id} for the rendered clip.",
  InfiniteTalk:
    "InfiniteTalk turns an image into talking-head video via /v1/async/videos/image-to-video—ideal for support avatars and localized explainers.",
};

const EXPAND = {
  "claude-fable-5":
    "When you evaluate Claude API pricing as a SaaS founder, the hidden cost is usually not the first million tokens—it is the long tail of agent retries, tool loops, and failed plans. Fable 5 on KeyoAPI lets you keep those loops on a Claude-class model while Luna or Sonnet absorb cheap classification. Write eval harnesses that score planner quality separately from executor quality so you know when Fable is worth the uplift. Log prompt tokens, completion tokens, and tool-call counts per session; finance will ask for that breakdown before approving volume. For SDK migration, keep your existing OpenAI client, set baseURL to https://www.keyoapi.xyz/v1, and only change the model string. That is the whole point of an AI API relay: capability switching without a second SDK.",
  "claude-opus-5":
    "Opus-class models are where teams overspend if every chat window defaults to max intelligence. Put Opus behind an explicit “deep mode” button or an agent router that only escalates after Sonnet fails a rubric. On KeyoAPI you can A/B that router against gpt-5.6-sol without new credentials. Capture failure modes—wrong file edits, invented APIs, incomplete refactors—so you can prove Opus is paying for itself. Document a kill switch to demote traffic to Sonnet during cost spikes. Claude API pricing only stays rational when escalation is intentional.",
  "claude-sonnet-5":
    "Sonnet 5 is the model you should leave as the default string in most production configs. It covers support macros, RAG answers, light coding, and structured extraction without the Opus bill. Build golden-set evals for your top twenty prompts and only escalate outliers. Because KeyoAPI shares keys with Whisper and OCR, you can attach documents or transcripts in the same product session without a second vendor. Publish an internal runbook: Sonnet first, Fable/Opus on call, Luna for batch. That runbook is what keeps Claude API pricing predictable as usage scales.",
  "gpt-5.6-terra":
    "Terra is the GPT-class default for products that need reliable Q&A without burning the GPT-4o list price. Wire it into onboarding bots, help centers, and CRUD copilots first. Keep a shadow eval that compares Terra vs Luna on your hardest ten prompts weekly so you know when to escalate. Use streaming for UI latency and store token usage per tenant for chargebacks. GPT API pricing becomes a board-friendly story when Terra handles the median request and Sol/Claude handle the p95. KeyoAPI’s OpenAI-compatible path means Cursor, LangChain, and official SDKs need only a base URL swap.",
  "gpt-5.6-sol":
    "Sol is the “think harder” GPT-5.6 tier for dense analysis, long briefs, and stubborn instruction following. Do not put Sol on every autocomplete keystroke—route it from a classifier or from user intent like “deep research.” Pair Sol with Luna for summarising tool output so the expensive model only sees compressed context. Track dollars per successful task, not just tokens. That metric sells an AI API relay better than raw GPT API pricing slides. Start experiments on /pricing/gpt-5.6-sol and keep Terra as the safe rollback model string.",
  "gpt-5.6-luna":
    "Luna exists because most tokens in production are boring: labels, rewrites, triage, translations of short strings. Those jobs should never hit flagship rates. Put Luna behind queues for nightly batch, behind routers for inbound email, and behind agent tools that summarise JSON. Measure quality with automated checks (JSON schema, banned phrases) instead of human review for every row. When quality dips, escalate that slice to Terra—not the whole traffic mix. This is how a cheap llm api actually shows up in unit economics.",
  "MinerU2.5-Pro":
    "Document pipelines fail when you treat PDFs like plain text. MinerU2.5-Pro recovers layout so tables and headings survive into your LLM context. Design the job as async: upload, store task id, poll, then write markdown into your vector store. Retry only failed pages. Cache hashes so re-uploads are free. For finance and legal, keep the original PDF URL next to the parsed chunk for citation. Chain UVDoc first when users photograph paper. That OCR API stack on one Keyo key beats stitching three SaaS vendors.",
  "Unlimited-OCR":
    "Unlimited-OCR is for product surfaces that already speak multimodal chat: the user pastes a screenshot and asks a question in one turn. Send an image part plus a text instruction asking for structured JSON or markdown tables. Validate the schema server-side before showing answers. When documents are multi-page PDFs with complex layout, prefer MinerU’s async parse instead of stuffing everything into one chat call. Unlimited-OCR’s token pricing fits variable-length captures; MinerU’s per-page pricing fits batch archives. Document both paths in your internal OCR API guide so engineers pick deliberately.",
  UVDoc:
    "Phone scans fail OCR because of curvature and perspective, not because the OCR model is weak. UVDoc’s job is geometric cleanup before recognition. Run it only on camera captures; skip it for digital-born PDFs to save latency and cost. Store both the warped original and the unwarped result for audit. After UVDoc, call MinerU or Unlimited-OCR and compare character error rates on a labeled set of receipts or IDs. That A/B is how you justify the extra hop. KeyoAPI keeps unwarp + OCR + LLM on one prepaid balance.",
  "Qwen3-TTS":
    "TTS product quality is about voice consistency and async UX, not just a synchronous HTTP beep. Create speech jobs, poll until ready, then CDN-cache the audio URL. Offer clone samples only after consent and PII review. Fallback to a default voice when clone confidence is low. Measure time-to-first-byte of finished audio, not just API accept latency. Text-to-speech API buyers care about multilingual coverage and cost per minute of finished media—log both. KeyoAPI’s async speech endpoint keeps TTS next to Whisper for full duplex voice agents.",
  "RMBG-2.0":
    "Background removal in commerce is a reliability problem: hair edges, transparent packaging, and white-on-white SKUs. Build a QA loop that flags mattes with too much leftover background using simple pixel heuristics, then re-run or escalate to sam3 masks. Store alpha PNGs with SKU ids for CDN delivery. Meter per request so you can charge merchants per successful cutout. Do not demo this with chat/completions—use /v1/images/mattings with multipart uploads. That single detail separates a real background removal API from a toy prompt.",
  VajraV1:
    "YOLO-style detection is for closed vocabularies you already understand: people, boxes, vehicles, shelves. Sample frames from video instead of every frame to control cost. Persist boxes with camera id and timestamp for analytics. When you need “find the weird unlabeled object,” escalate to sam3. Feed compact detection JSON into Luna for incident summaries so the LLM never sees raw pixels. Object detection API pricing stays sane when you batch stills and cache identical frames.",
  sam3:
    "Open-vocabulary segmentation shines when class lists fail—medical tools, rare SKUs, custom props. Prompt with short noun phrases and keep a human-in-the-loop for first-week taxonomy discovery. Export masks as PNGs or RLE depending on your editor. Combine with RMBG when you only need subject/background, and keep sam3 for multi-object scenes. Image segmentation API traffic should be rate-limited per tenant; masks are heavier than classification tokens. KeyoAPI hosts sam3 beside detection so you can escalate inside one gateway.",
  "Real-ESRGAN":
    "Upscaling helps marketplace photos and OCR preprocessors more than it helps already-sharp DSLR shots. Detect low resolution before calling Real-ESRGAN to avoid wasting requests. Compare SSIM or a simple sharpness score pre/post. For text-heavy scans, upscale then OCR; for portraits, upscale then RMBG. Image upscaling API costs add up in user-generated content apps—cache by content hash. Keyo’s /v1/images/upscaling path keeps this step next to other vision tools.",
  AnimeSharp:
    "Anime and illustration assets need different priors than photos. AnimeSharp preserves line art that Real-ESRGAN may soften. Use it in sticker pipelines, manga cleanup, and game sprite prep. Keep a style classifier so photoreal uploads never hit AnimeSharp by mistake. Offer before/after previews in your admin tool so artists trust the automation. This is a narrow but high-converting long-tail API page: creators search for anime upscalers specifically.",
  "Duix-Avatar":
    "Talking avatars are async media jobs: validate face video and voice sample length before submit, then poll task status. Show progress UI; do not block HTTP workers. Moderate inputs for deepfake abuse. Cache finished MP4s by (face hash, audio hash). Digital human API buyers care about lip sync and queue time—log both. KeyoAPI’s audio-video-to-video route keeps avatar generation on the same key as TTS and STT for full agent personas.",
  InfiniteTalk:
    "Image-to-talking-head is the onboarding-friendly digital human path: one portrait plus one audio track. Enforce portrait resolution minimums and reject group photos. Localize audio with Qwen3-TTS, then animate with InfiniteTalk for multilingual explainers. Store consent flags for likeness rights. For support bots, pre-render common answers; only generate live for long-tail questions. This workflow is hard to assemble across vendors—KeyoAPI packages it as one relay.",
};

function curlFor(id, endpoint) {
  if (endpoint.includes("/audio/transcriptions")) {
    return `curl https://www.keyoapi.xyz/v1/audio/transcriptions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F file=@./sample.wav`;
  }
  if (endpoint.includes("/async/audio/speech")) {
    return `curl https://www.keyoapi.xyz/v1/async/audio/speech \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${id}","input":"Hello from KeyoAPI TTS."}'\n# then: GET /v1/task/{id}`;
  }
  if (endpoint.includes("/images/mattings")) {
    return `curl https://www.keyoapi.xyz/v1/images/mattings \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F image=@./photo.png`;
  }
  if (endpoint.includes("/images/upscaling")) {
    return `curl https://www.keyoapi.xyz/v1/images/upscaling \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F image=@./photo.png`;
  }
  if (endpoint.includes("/images/unwarping")) {
    return `curl https://www.keyoapi.xyz/v1/images/unwarping \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F image=@./scan.png`;
  }
  if (endpoint.includes("/images/object-detection")) {
    return `curl https://www.keyoapi.xyz/v1/images/object-detection \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F image=@./frame.png`;
  }
  if (endpoint.includes("/images/segmentation")) {
    return `curl https://www.keyoapi.xyz/v1/images/segmentation \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F image=@./frame.png`;
  }
  if (endpoint.includes("/async/documents/parse")) {
    return `curl https://www.keyoapi.xyz/v1/async/documents/parse \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F file=@./doc.pdf\n# then: GET /v1/task/{id}`;
  }
  if (endpoint.includes("/async/videos/audio-video-to-video")) {
    return `curl https://www.keyoapi.xyz/v1/async/videos/audio-video-to-video \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F audio=@./voice.wav \\\n  -F video=@./face.mp4\n# then: GET /v1/task/{id}`;
  }
  if (endpoint.includes("/async/videos/image-to-video")) {
    return `curl https://www.keyoapi.xyz/v1/async/videos/image-to-video \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F model=${id} \\\n  -F image=@./portrait.png \\\n  -F audio=@./voice.wav\n# then: GET /v1/task/{id}`;
  }
  if (id === "Unlimited-OCR") {
    return `curl https://www.keyoapi.xyz/v1/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"Unlimited-OCR","messages":[{"role":"user","content":[{"type":"text","text":"Extract tables as markdown"},{"type":"image_url","image_url":{"url":"https://example.com/scan.png"}}]}]}'`;
  }
  return `curl https://www.keyoapi.xyz/v1/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${id}","messages":[{"role":"user","content":"Hello from KeyoAPI"}]}'`;
}

function words(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function stripShared(body) {
  let out = body;
  for (const re of SHARED_SNIPPETS) out = out.replace(re, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

for (const m of data.models) {
  const endpoint = ENDPOINTS[m.id];
  if (!endpoint) throw new Error("missing endpoint for " + m.id);
  m.endpoint = endpoint;
  m.codeHint = `model=${m.id}`;
  m.curlExample = curlFor(m.id, endpoint);
  m.uniqueBlurb = UNIQUE[m.id];
  m.body = stripShared(m.body);
  if (m.uniqueBlurb && !m.body.includes(m.uniqueBlurb.slice(0, 40))) {
    m.body = `${m.body}\n\n${m.uniqueBlurb}`;
  }
  const expand = EXPAND[m.id];
  if (expand && !m.body.includes(expand.slice(0, 48))) {
    m.body = `${m.body}\n\n${expand}`;
  }
  if (m.sections) {
    for (const k of Object.keys(m.sections)) {
      m.sections[k] = stripShared(m.sections[k]);
    }
  }
  m.bodyWordCount = words(m.body);
  if (m.bodyWordCount < 300) {
    console.warn("LOW", m.id, m.bodyWordCount);
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log(
  "Patched",
  data.models.length,
  "models; minWords=",
  Math.min(...data.models.map((m) => m.bodyWordCount))
);
