// One-off: add the three remaining video-lane pricing landings + fix the
// two video-tool catalogRows endpoints (they are async tools, not generations).
// Data sources: config/apimart-selected-models.json, static/brand/video-capabilities.json,
// static/brand/keyo-api-ref.html §1.11a, services/volc-passthrough/server.mjs.
// Run from repo root: node scripts/_add-video-tools-landings.mjs
import fs from "fs";
import path from "path";

const file = path.resolve("config/seo/pricing-landings.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

// --- 1) fix catalogRows endpoints for the async video tools ---
for (const r of data.catalogRows || []) {
  if (r.model === "video-enhance-pro") {
    r.endpoint = "POST /v1/async/videos/enhance";
    r.keyo = "$0.0342–$0.1370 / second (720p/1080p/2k)";
  }
  if (r.model === "subtitle-erase-pro") {
    r.endpoint = "POST /v1/async/videos/subtitle-erase";
  }
}

// --- 2) the three new landing pages ---
const POLL_PLURAL = "# Poll GET /v1/tasks/{id} with the same key: processing = still rendering, completed = ready url";
const POLL_SINGULAR = "# Poll GET /v1/task/{id} (singular) with the same key until it returns the result url";

const pages = [
  {
    slug: "agnes-video-2-5-api-pricing",
    navLabel: "Agnes Video 2.5 pricing",
    h1: "Agnes Video 2.5 API Pricing — KeyoAPI Video Generation Rates",
    title: "Agnes Video 2.5 API Pricing | KeyoAPI",
    metaDescription: "Agnes Video 2.5 API pricing on KeyoAPI: ~$0.0205/sec at 720p, ~$0.0349/sec at 1080p, ~$0.0473/sec at 2k, up to 12 seconds per clip. OpenAI-style JSON video endpoint on one prepaid key.",
    targetKeywords: ["agnes video 2.5 api pricing", "agnes video api price", "agnes video generation api"],
    lead: "Agnes Video 2.5 video generation API. KeyoAPI hosts agnes-video-2.5 at 720p / 1080p / 2k, text-to-video and image-to-video, up to 12 seconds per clip, billed per second.",
    rows: [
      { model: "agnes-video-2.5", official: "Agnes AI list via grsai — verify before budgeting", keyo: "~$0.0205 / second", note: "720p output · POST /v1/videos/generations" },
      { model: "agnes-video-2.5", official: "Agnes AI list via grsai — verify before budgeting", keyo: "~$0.0349 / second", note: "1080p output · POST /v1/videos/generations" },
      { model: "agnes-video-2.5", official: "Agnes AI list via grsai — verify before budgeting", keyo: "~$0.0473 / second", note: "2k output · POST /v1/videos/generations" }
    ],
    freeKiller: {
      title: "Prototype free, then generate video",
      body: "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your pipeline at $0, then switch model= to agnes-video-2.5 on the same base URL and key."
    },
    body: [
      "Agnes Video 2.5 is a text-to-video and image-to-video model. On KeyoAPI you POST /v1/videos/generations with model=agnes-video-2.5, a prompt, and the output resolution (720p / 1080p / 2k); clips run 1–12 seconds (default 5) and billing is per generated second from your prepaid wallet.",
      "Optional inputs follow the same JSON body: aspectRatio (landscape / portrait / square, or 16:9 / 9:16 / 1:1), up to 9 reference images for image-to-video, up to 3 audio clips, and a seed. Keyo rates above are indicative sell prices from the live Keyo catalog — confirm the interactive card under /pricing before volume.",
      "For other video lanes on the same key see Seedance 2.5, MiniMax-H3 and FLUX.3 Video on /pricing-list; for post-generation cleanup see the subtitle erase and video enhance tools."
    ],
    faqs: [
      { q: "How long can an Agnes Video 2.5 clip be?", a: "1 to 12 seconds, default 5. You are billed per generated second at the resolution you request." },
      { q: "Does Agnes Video 2.5 support image-to-video?", a: "Yes — pass up to 9 https image URLs in the images field to animate a still, or leave it out for text-to-video." },
      { q: "How do I try Agnes Video 2.5 on Keyo?", a: "Create a key at /sign-up, then call POST /v1/videos/generations with model=agnes-video-2.5, or find it in Model Square (/pricing)." }
    ],
    curlExample: `curl https://www.keyoapi.xyz/v1/videos/generations \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"agnes-video-2.5","prompt":"A drone shot over neon city rain, cinematic","duration":5,"resolution":"720p","aspectRatio":"landscape"}'
${POLL_PLURAL}`
  },
  {
    slug: "video-enhance-pro-api-pricing",
    navLabel: "Video Enhance Pro pricing",
    h1: "Video Enhance Pro API Pricing — KeyoAPI Video Enhancement Rates",
    title: "Video Enhance Pro API Pricing | KeyoAPI",
    metaDescription: "Video Enhance Pro API pricing on KeyoAPI: ~$0.0342/sec at 720p, ~$0.0685/sec at 1080p, ~$0.1370/sec at 2k. Async submit + poll on one prepaid key.",
    targetKeywords: ["video enhance api pricing", "video enhancement api price", "video upscale api cost"],
    lead: "Video Enhance Pro API. KeyoAPI hosts video-enhance-pro generative quality enhancement at 720p / 1080p / 2k — submit a video URL, poll for the enhanced result, billed per second of processed video.",
    rows: [
      { model: "video-enhance-pro", official: "Managed tool lane — compare MediaKit-class tooling before budgeting", keyo: "~$0.0342 / second", note: "720p enhancement · POST /v1/async/videos/enhance" },
      { model: "video-enhance-pro", official: "Managed tool lane — compare MediaKit-class tooling before budgeting", keyo: "~$0.0685 / second", note: "1080p enhancement (default) · POST /v1/async/videos/enhance" },
      { model: "video-enhance-pro", official: "Managed tool lane — compare MediaKit-class tooling before budgeting", keyo: "~$0.1370 / second", note: "2k enhancement · POST /v1/async/videos/enhance" }
    ],
    freeKiller: {
      title: "Prototype free, then enhance",
      body: "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Wire up your submit-and-poll loop against a $0 model first, then point it at /v1/async/videos/enhance with the same key."
    },
    body: [
      "video-enhance-pro is a generative video enhancement tool: you submit an existing video and get back a higher-quality version. Call POST /v1/async/videos/enhance with model=video-enhance-pro, the source video as video_url (https), and the target resolution (720p / 1080p / 2k; default 1080p).",
      "The call returns a task id immediately — poll GET /v1/task/{id} (singular) with the same key until it returns the result URL. Billing is per second of successfully processed video, so a 10-second 1080p clip costs about $0.68.",
      "Keyo rates above are indicative sell prices from the live Keyo catalog; confirm under /pricing before volume. For removing burned-in subtitles on the same key see the subtitle erase tool; for generation see Seedance, MiniMax-H3, FLUX.3 and Wan 3.0 on /pricing-list."
    ],
    faqs: [
      { q: "How is Video Enhance Pro billed?", a: "Per second of processed video at the target resolution — 720p $0.0342/s, 1080p $0.0685/s, 2k $0.1370/s (indicative). A 10-second 1080p enhancement costs about $0.68." },
      { q: "How do I submit a video?", a: "POST /v1/async/videos/enhance with model, video_url (https link to your source video) and resolution. Then poll GET /v1/task/{id} for the result URL." },
      { q: "Can I enhance to 4K?", a: "The current tiers are 720p, 1080p and 2k. Submit at the highest tier you need — the tool upscales and restores detail generatively." }
    ],
    curlExample: `curl https://www.keyoapi.xyz/v1/async/videos/enhance \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"video-enhance-pro","video_url":"https://example.com/clip.mp4","resolution":"1080p"}'
${POLL_SINGULAR}`
  },
  {
    slug: "subtitle-erase-pro-api-pricing",
    navLabel: "Subtitle Erase Pro pricing",
    h1: "Subtitle Erase Pro API Pricing — KeyoAPI Hard-Subtitle Removal Rates",
    title: "Subtitle Erase Pro API Pricing | KeyoAPI",
    metaDescription: "Subtitle Erase Pro API pricing on KeyoAPI: ~$0.0183 per second of processed video. Remove burned-in hard subtitles via async submit + poll on one prepaid key.",
    targetKeywords: ["subtitle removal api pricing", "erase subtitles api price", "hard subtitle removal api"],
    lead: "Subtitle Erase Pro API. KeyoAPI hosts subtitle-erase-pro refined hard-subtitle removal at ~$0.0183 per second of processed video — submit a video URL, poll for the cleaned result.",
    rows: [
      { model: "subtitle-erase-pro", official: "Managed tool lane — compare MediaKit-class tooling before budgeting", keyo: "~$0.0183 / second", note: "Refined hard-subtitle erase · POST /v1/async/videos/subtitle-erase" }
    ],
    freeKiller: {
      title: "Prototype free, then erase",
      body: "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Build your submit-and-poll pipeline against a $0 model first, then point it at /v1/async/videos/subtitle-erase with the same key."
    },
    body: [
      "subtitle-erase-pro removes burned-in (hard) subtitles from video and reconstructs the area behind them. Call POST /v1/async/videos/subtitle-erase with model=subtitle-erase-pro and the source video as video_url (https).",
      "The call returns a task id immediately — poll GET /v1/task/{id} (singular) with the same key until it returns the cleaned video URL. Billing is per second of successfully processed video; a 60-second clip costs about $1.10.",
      "Keyo rates above are indicative sell prices from the live Keyo catalog; confirm under /pricing before volume. Pair it with the video enhance tool for restore-then-upscale workflows; for generation see the Seedance, MiniMax-H3, FLUX.3 and Wan 3.0 lanes on /pricing-list."
    ],
    faqs: [
      { q: "How is Subtitle Erase Pro billed?", a: "A flat ~$0.0183 per second of processed video (indicative). A 60-second clip costs about $1.10." },
      { q: "Does it remove soft subtitles?", a: "No — soft subtitle tracks are text streams you can strip with any muxer. This tool erases subtitles burned into the picture and inpaints the background." },
      { q: "How do I submit a video?", a: "POST /v1/async/videos/subtitle-erase with model and video_url (https link to your video). Then poll GET /v1/task/{id} for the cleaned video URL." }
    ],
    curlExample: `curl https://www.keyoapi.xyz/v1/async/videos/subtitle-erase \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"subtitle-erase-pro","video_url":"https://example.com/subtitled.mp4"}'
${POLL_SINGULAR}`
  }
];

const slugs = new Set(pages.map((p) => p.slug));
data.pages = (data.pages || []).filter((p) => !slugs.has(p.slug));
data.pages.push(...pages);

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("WROTE", file);
for (const p of pages) console.log("OK", p.slug, "rows:", p.rows.length, "curl:", !!p.curlExample);
console.log("catalogRows endpoints fixed for video-enhance-pro / subtitle-erase-pro");