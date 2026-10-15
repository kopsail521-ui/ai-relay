// One-off: add/refresh the four video pricing landing config entries.
// Run from repo root: node scripts/_add-video-pricing-landings.mjs
import fs from "fs";
import path from "path";

const file = path.resolve("config/seo/pricing-landings.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (!data.pages || !Array.isArray(data.pages)) throw new Error("no pages array");

const newPages = [
  {
    slug: "seedance-2-5-api-pricing",
    navLabel: "Seedance 2.5 pricing",
    h1: "Seedance 2.5 API Pricing — KeyoAPI Video Generation Rates",
    title: "Seedance 2.5 API Pricing | KeyoAPI",
    metaDescription: "Seedance 2.5 API pricing on KeyoAPI: seedance-2.5-1080p ~$0.138/sec, seedance-2.0-1080p ~$0.1006/sec, seedance-2.0-720p ~$0.0962/sec. OpenAI-compatible video endpoint on one prepaid key.",
    targetKeywords: ["seedance 2.5 api pricing", "seedance api pricing", "seedance video api price"],
    lead: "Seedance 2.5 video generation API. KeyoAPI hosts seedance-2.5-1080p, seedance-2.0-1080p and seedance-2.0-720p on one OpenAI-compatible key with prepaid billing.",
    rows: [
      { model: "seedance-2.5-1080p", official: "ByteDance Seedance list — verify on volcengine.com before budgeting", keyo: "~$0.138 / second", note: "1080p video generation · POST /v1/videos/generations" },
      { model: "seedance-2.0-1080p", official: "ByteDance Seedance list — verify on volcengine.com before budgeting", keyo: "~$0.1006 / second", note: "1080p video generation · POST /v1/videos/generations" },
      { model: "seedance-2.0-720p", official: "ByteDance Seedance list — verify on volcengine.com before budgeting", keyo: "~$0.0962 / second", note: "720p video generation · POST /v1/videos/generations" }
    ],
    freeKiller: {
      title: "Prototype free, then generate video",
      body: "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits) — handy for warming up your pipeline before switching model= to seedance-2.5-1080p on the same base URL and key."
    },
    body: [
      "Seedance is ByteDance's video generation family. On KeyoAPI you call the same OpenAI-compatible endpoint you already use for chat: set OPENAI_BASE_URL=https://www.keyoapi.xyz/v1, send POST /v1/videos/generations with model=seedance-2.5-1080p (or the 2.0 tiers), and pay per second of generated video from your prepaid wallet.",
      "Keyo rates above are indicative sell prices from the live Keyo catalog. Confirm the interactive card under /pricing/seedance-2.5-1080p before volume, and treat official ByteDance figures as planning context — list bands move.",
      "Seedance bills by generated second, so a shorter clip costs less. For image-to-video and longer scenes, compare the 2.5 and 2.0 tiers on this page, then check /pricing-list for the full catalog."
    ],
    faqs: [
      { q: "Is Keyo cheaper than official Seedance API pricing?", a: "The Keyo rows above are indicative sell rates from the live catalog. Official ByteDance bands change with tiers and promotions, so treat this page as a planning snapshot and verify both sides before committing." },
      { q: "How do I try Seedance on Keyo?", a: "Create a key at /sign-up, then open /pricing/seedance-2.5-1080p for interactive try/buy. Model Square is the try path." },
      { q: "Which Seedance model should I use?", a: "seedance-2.5-1080p is the current 2.5 flagship for 1080p output. seedance-2.0-1080p and seedance-2.0-720p are prior-generation tiers at lower per-second rates. Pick by resolution and budget." }
    ]
  },
  {
    slug: "minimax-h3-api-pricing",
    navLabel: "MiniMax H3 pricing",
    h1: "MiniMax-H3 API Pricing — KeyoAPI Video Generation Rates",
    title: "MiniMax-H3 API Pricing | KeyoAPI",
    metaDescription: "MiniMax-H3 API pricing on KeyoAPI: ~$0.0205/sec at 480p, ~$0.0288/sec at 768p, ~$0.0411/sec at 1080p. OpenAI-compatible video endpoint on one prepaid key.",
    targetKeywords: ["minimax h3 api pricing", "minimax h3 video api price", "minimax video generation api"],
    lead: "MiniMax-H3 video generation API. KeyoAPI hosts MiniMax-H3 at 480p / 768p / 1080p on an OpenAI-compatible key with prepaid billing.",
    rows: [
      { model: "MiniMax-H3", official: "MiniMax official list — verify on minimax.io before budgeting", keyo: "~$0.0205 / second", note: "480p output · POST /v1/videos/generations" },
      { model: "MiniMax-H3", official: "MiniMax official list — verify on minimax.io before budgeting", keyo: "~$0.0288 / second", note: "768p output · POST /v1/videos/generations" },
      { model: "MiniMax-H3", official: "MiniMax official list — verify on minimax.io before budgeting", keyo: "~$0.0411 / second", note: "1080p output · POST /v1/videos/generations" }
    ],
    freeKiller: {
      title: "Prototype free, then generate video",
      body: "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your video pipeline at $0, then switch model= to MiniMax-H3 on the same base URL and key."
    },
    body: [
      "MiniMax-H3 is MiniMax's video generation model, billed per second of output on KeyoAPI. Use the standard OpenAI-compatible flow: set OPENAI_BASE_URL=https://www.keyoapi.xyz/v1 and POST /v1/videos/generations with model=MiniMax-H3; the resolution you request (480p / 768p / 1080p) decides the per-second rate.",
      "Keyo rates above are indicative sell prices from the live Keyo catalog. Confirm the interactive card under /pricing before volume, and treat MiniMax official figures as planning context — list bands move.",
      "MiniMax-H3 supports reference images for image-to-video. Compare it with Seedance and other video lanes on /pricing-list when you need a second vendor on the same key."
    ],
    faqs: [
      { q: "How is MiniMax-H3 billed on KeyoAPI?", a: "Per second of generated video, at the resolution you request. 480p is the lowest rate; 1080p is the highest of the three tiers listed above." },
      { q: "Can I use reference images with MiniMax-H3?", a: "Yes — MiniMax-H3 supports reference images for image-to-video generation through the standard /v1/videos/generations endpoint." },
      { q: "How do I try MiniMax-H3 on Keyo?", a: "Create a key at /sign-up and open Model Square (/pricing) to find MiniMax-H3, or start with a $0 free catalog ID on /free-models to warm up your pipeline." }
    ]
  },
  {
    slug: "flux-3-video-api-pricing",
    navLabel: "FLUX.3 Video pricing",
    h1: "FLUX.3 Video API Pricing — KeyoAPI Video Generation Rates",
    title: "FLUX.3 Video API Pricing | KeyoAPI",
    metaDescription: "FLUX.3 Video API pricing on KeyoAPI: ~$0.0576/sec DRAFT, ~$0.1632/sec HD, ~$0.2784/sec FHD, with V2V tiers. OpenAI-compatible video endpoint on one prepaid key.",
    targetKeywords: ["flux 3 video api pricing", "flux video generation api", "black forest labs video api price"],
    lead: "FLUX.3 Video generation API from Black Forest Labs. KeyoAPI hosts flux-3-video DRAFT / HD / FHD and V2V tiers on an OpenAI-compatible key with prepaid billing.",
    rows: [
      { model: "flux-3-video", official: "Black Forest Labs list — verify on bfl.ai before budgeting", keyo: "~$0.0576 / second", note: "DRAFT tier · POST /v1/videos/generations" },
      { model: "flux-3-video", official: "Black Forest Labs list — verify on bfl.ai before budgeting", keyo: "~$0.1632 / second", note: "HD tier · POST /v1/videos/generations" },
      { model: "flux-3-video", official: "Black Forest Labs list — verify on bfl.ai before budgeting", keyo: "~$0.2784 / second", note: "FHD tier · POST /v1/videos/generations" },
      { model: "flux-3-video", official: "Black Forest Labs list — verify on bfl.ai before budgeting", keyo: "~$0.3936 / second", note: "V2V-HD tier · POST /v1/videos/generations" },
      { model: "flux-3-video", official: "Black Forest Labs list — verify on bfl.ai before budgeting", keyo: "~$0.5088 / second", note: "V2V-FHD tier · POST /v1/videos/generations" }
    ],
    freeKiller: {
      title: "Prototype free, then generate video",
      body: "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your pipeline at $0, then switch model= to flux-3-video on the same base URL and key."
    },
    body: [
      "FLUX.3 Video is Black Forest Labs' video generation line. On KeyoAPI you call the OpenAI-compatible /v1/videos/generations endpoint with model=flux-3-video and pick a quality tier (DRAFT / HD / FHD) — or V2V tiers when you start from video. Billing is per second of generated output from your prepaid wallet.",
      "Keyo rates above are indicative sell prices from the live Keyo catalog. Confirm the interactive card under /pricing before volume, and treat Black Forest Labs official figures as planning context — list bands move.",
      "DRAFT is the budget tier for quick iteration; HD and FHD cost more per second. V2V (video-to-video) tiers add a second input clip and bill at the higher end of the table."
    ],
    faqs: [
      { q: "What do the FLUX.3 Video tiers mean?", a: "DRAFT is the fastest, lowest-cost tier for iterating. HD and FHD are higher-quality outputs at higher per-second rates. V2V tiers generate from a video input clip." },
      { q: "Is Keyo cheaper than official FLUX.3 Video pricing?", a: "The Keyo rows are indicative sell rates from the live catalog. Black Forest Labs bands change, so treat this page as a planning snapshot and verify both sides before committing." },
      { q: "How do I try FLUX.3 Video on Keyo?", a: "Create a key at /sign-up and open Model Square (/pricing) to find flux-3-video, or start with a $0 free catalog ID on /free-models." }
    ]
  },
  {
    slug: "wan3-video-api-pricing",
    navLabel: "Wan 3.0 Video pricing",
    h1: "Wan 3.0 Video API Pricing — KeyoAPI Video Generation Rates",
    title: "Wan 3.0 Video API Pricing | KeyoAPI",
    metaDescription: "Wan 3.0 video API pricing on KeyoAPI: ~$0.0411/sec at 480P, ~$0.0823/sec at 720P, ~$0.1646/sec at 1080P. OpenAI-compatible video endpoint on one prepaid key.",
    targetKeywords: ["wan 3.0 video api pricing", "wan video generation api", "tongyi wanx video api price"],
    lead: "Wan 3.0 video generation API from Alibaba. KeyoAPI hosts wan3.0-video at 480P / 720P / 1080P on an OpenAI-compatible key with prepaid billing.",
    rows: [
      { model: "wan3.0-video", official: "Alibaba Tongyi Wanxiang list — verify on aliyun.com before budgeting", keyo: "~$0.0411 / second", note: "480P output · POST /v1/videos/generations" },
      { model: "wan3.0-video", official: "Alibaba Tongyi Wanxiang list — verify on aliyun.com before budgeting", keyo: "~$0.0823 / second", note: "720P output · POST /v1/videos/generations" },
      { model: "wan3.0-video", official: "Alibaba Tongyi Wanxiang list — verify on aliyun.com before budgeting", keyo: "~$0.1646 / second", note: "1080P output · POST /v1/videos/generations" }
    ],
    freeKiller: {
      title: "Prototype free, then generate video",
      body: "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your pipeline at $0, then switch model= to wan3.0-video on the same base URL and key."
    },
    body: [
      "Wan 3.0 is Alibaba's video generation model, available on KeyoAPI as wan3.0-video. Use the OpenAI-compatible /v1/videos/generations endpoint with your Keyo key; the output resolution (480P / 720P / 1080P) decides the per-second rate.",
      "Keyo rates above are indicative sell prices from the live Keyo catalog. Confirm the interactive card under /pricing before volume, and treat Alibaba official figures as planning context — list bands move.",
      "Wan 3.0 supports text-to-video and image-to-video workflows. Compare it with Seedance, MiniMax-H3 and FLUX.3 Video on /pricing-list when you want multiple video vendors on one key."
    ],
    faqs: [
      { q: "How is Wan 3.0 billed on KeyoAPI?", a: "Per second of generated video at the requested resolution. 480P is the entry tier; 1080P is the highest of the three rates listed above." },
      { q: "Does Wan 3.0 support image-to-video?", a: "Yes — Wan 3.0 supports image-to-video generation through the standard /v1/videos/generations endpoint." },
      { q: "How do I try Wan 3.0 on Keyo?", a: "Create a key at /sign-up and open Model Square (/pricing) to find wan3.0-video, or start with a $0 free catalog ID on /free-models." }
    ]
  }
];

const slugs = new Set(newPages.map((p) => p.slug));
data.pages = data.pages.filter((p) => !slugs.has(p.slug));
data.pages.push(...newPages);

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("WROTE", file);
for (const p of newPages) {
  console.log("OK", p.slug, "rows:", p.rows.length, "body:", p.body.length, "faqs:", p.faqs.length);
}