// One-off: nano banana line page batch —
// 1) nano-banana-pro model guide (sellable at $0.0274/image, previously no page)
// 2) /nano-banana-api-pricing family landing (three tiers, images curl)
// 3) point the 2/2.1 "vs" FAQ at the new pro guide.
// Run from repo root: node scripts/_add-nano-banana-pages.mjs
import fs from "fs";
import path from "path";

// ---------- 1) model-pages.json: nano-banana-pro guide ----------
const mpFile = path.resolve("config/seo/model-pages.json");
const mp = JSON.parse(fs.readFileSync(mpFile, "utf8"));

const pro = {
  id: "nano-banana-pro",
  category: "vision",
  targetKeywords: [
    "nano banana pro api",
    "nano banana pro",
    "nano banana pro pricing",
    "nano banana pro image api",
  ],
  h1: "Nano Banana Pro API — Google's Top Image Tier on KeyoAPI",
  title: "Nano Banana Pro API — Pricing & Quick Start | KeyoAPI",
  metaDescription:
    "Nano Banana Pro API on KeyoAPI: high-resolution image generation and fine-grained editing via POST /v1/images/generations at $0.0274 per image. Same OpenAI-compatible key as chat.",
  priceLabel: "$0.0274 / image",
  priceUnit: "per_call",
  related: ["nano-banana-2.1", "nano-banana-2", "RMBG-2.0"],
  endpoint: "POST /v1/images/generations",
  codeHint: "model=nano-banana-pro · prompt required · size optional (e.g. 1024x1024)",
  faqs: [
    {
      q: "How do I call the Nano Banana Pro API?",
      a: "Use your KeyoAPI Bearer key and POST to /v1/images/generations with model=nano-banana-pro and a prompt. The endpoint is OpenAI-compatible, so existing image clients work with a base URL change.",
    },
    {
      q: "Nano Banana Pro vs 2 vs 2.1 — which one?",
      a: "nano-banana-pro is the top tier at $0.0274 per image with higher resolution and finer editing control; nano-banana-2 is the base lane at $0.0205; nano-banana-2.1 is the newer release at $0.0123. All three run on the same key — see /model/nano-banana-2.1, /model/nano-banana-2 and /pricing-list.",
    },
  ],
  sections: {
    intro:
      "Nano Banana Pro is Google's top image generation tier served on KeyoAPI's OpenAI-compatible /v1/images/generations endpoint — same Bearer key as chat, $0.0274 per image, built for high-resolution commercial visuals and fine-grained editing.",
  },
  body: "Nano Banana Pro is the top tier of Google's Nano Banana image family, served on KeyoAPI through the OpenAI-compatible /v1/images/generations endpoint. If you already call chat, Whisper, or OCR with a KeyoAPI key, image generation is one more model string — no Google Cloud project, no second credential.\n\nPricing is per generated image: $0.0274 on pro, against nano-banana-2 at $0.0205 (base lane) and nano-banana-2.1 at $0.0123 (newer release). Pro earns its premium when fidelity dominates — higher resolution output and finer editing control for commercial visuals, detailed image work and art direction. All three tiers run on the same key, so escalating a prompt from 2.1 to pro is a model-string change.\n\nCall it with POST /v1/images/generations, model=nano-banana-pro, and a prompt. size is optional (1024x1024 by default). Responses come back in the OpenAI images shape synchronously — no task polling — so existing clients and SDKs work after pointing base_url at https://www.keyoapi.xyz/v1. Confirm live rates on /pricing-list before volume work.",
  curlExample:
    'curl https://www.keyoapi.xyz/v1/images/generations \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"nano-banana-pro","prompt":"a mug of coffee on a desk, studio light","size":"1024x1024"}\'',
  uniqueBlurb:
    "nano-banana-pro is Google's top image tier on /v1/images/generations at $0.0274 per image — higher resolution and finer editing control, on the same Bearer key as chat, TTS, and OCR.",
};

if (!mp.models.some((m) => m.id === pro.id)) {
  const at = mp.models.findIndex((m) => m.id === "nano-banana-2.1");
  if (at >= 0) mp.models.splice(at + 1, 0, pro);
  else mp.models.push(pro);
}
// point the existing 2/2.1 "vs" FAQ at the new pro guide
for (const m of mp.models) {
  if (m.id === "nano-banana-2" || m.id === "nano-banana-2.1") {
    for (const f of m.faqs || []) {
      f.a = f.a.replace(
        "see /model/nano-banana-2.1 and /pricing-list.",
        "see /model/nano-banana-2.1, /model/nano-banana-pro and /pricing-list.",
      );
    }
  }
}
fs.writeFileSync(mpFile, JSON.stringify(mp, null, 2) + "\n");
console.log("OK model guide:", pro.id);

// ---------- 2) pricing-landings.json: family landing ----------
const plFile = path.resolve("config/seo/pricing-landings.json");
const pl = JSON.parse(fs.readFileSync(plFile, "utf8"));

const OFFICIAL = "Google Gemini image list — verify on ai.google.dev before budgeting";
const landing = {
  slug: "nano-banana-api-pricing",
  navLabel: "Nano Banana pricing",
  h1: "Nano Banana API Pricing — KeyoAPI Image Generation Rates",
  title: "Nano Banana API Pricing | KeyoAPI",
  metaDescription:
    "Nano Banana API pricing on KeyoAPI: nano-banana-2.1 $0.0123/image, nano-banana-2 $0.0205/image, nano-banana-pro $0.0274/image on one OpenAI-compatible key. POST /v1/images/generations.",
  targetKeywords: [
    "nano banana api pricing",
    "nano banana pricing",
    "nano banana image api price",
    "google nano banana api cost",
  ],
  lead: "Nano Banana image generation API. KeyoAPI hosts all three Google Nano Banana tiers — 2.1, 2 and Pro — on one OpenAI-compatible key, billed per generated image.",
  rows: [
    { model: "nano-banana-2.1", official: OFFICIAL, keyo: "$0.0123 / image", note: "Newer release · POST /v1/images/generations" },
    { model: "nano-banana-2", official: OFFICIAL, keyo: "$0.0205 / image", note: "Base lane · POST /v1/images/generations" },
    { model: "nano-banana-pro", official: OFFICIAL, keyo: "$0.0274 / image", note: "Top tier — higher resolution, finer editing · POST /v1/images/generations" },
  ],
  freeKiller: {
    title: "No free image tier — wire your client on gift credits",
    body: "The gift-credit IDs are chat and speech models only — image generation has no free tier. They bill at normal rates from your one-time $10 new-user credit (fair-use limits) and are the right place to prove out base URL, auth and retry wiring. Then switch model= to a nano-banana tier on the same key; images bill per generated image at the rates on this page.",
  },
  body: [
    "Nano Banana is Google's image generation family. On KeyoAPI all three tiers run on the same OpenAI-compatible endpoint: POST /v1/images/generations with model=nano-banana-2.1 (newer release, $0.0123 per image), model=nano-banana-2 (base lane, $0.0205) or model=nano-banana-pro (top tier with higher resolution and finer editing control, $0.0274). The model string is the only thing that changes between tiers.",
    "Billing is per generated image and the endpoint returns synchronously — no task polling. Keyo rates above are indicative sell prices from the live Keyo catalog; confirm the interactive card under /pricing before volume, and treat official Google figures as planning context — list bands move.",
    "Per-tier walkthroughs live on the model guides: /model/nano-banana-2.1, /model/nano-banana-2 and /model/nano-banana-pro. For other image lanes on the same key (gpt-image and friends) see /pricing-list.",
  ],
  faqs: [
    {
      q: "Which Nano Banana tier should I use?",
      a: "Start with nano-banana-2.1 — the newer release at the lowest per-image rate ($0.0123). Keep nano-banana-2 where your stack pins the base lane ($0.0205), and escalate to nano-banana-pro ($0.0274) when you need higher resolution and finer editing control for commercial work.",
    },
    {
      q: "How is Nano Banana billed on KeyoAPI?",
      a: "Per generated image, at the tier's rate. The images endpoint returns synchronously — there is no task polling.",
    },
    {
      q: "How do I try Nano Banana on Keyo?",
      a: "Create a key at /sign-up and open /pricing (Model Square) to find the nano-banana tiers, or start with a gift-credit ID on /free-models to wire your client first.",
    },
  ],
  curlExample: `curl https://www.keyoapi.xyz/v1/images/generations \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"nano-banana-2.1","prompt":"a mug of coffee on a desk, studio light","size":"1024x1024"}'
# Synchronous: the response returns image URLs directly — no task polling`,
};

pl.pages = (pl.pages || []).filter((p) => p.slug !== landing.slug);
pl.pages.push(landing);
fs.writeFileSync(plFile, JSON.stringify(pl, null, 2) + "\n");
console.log("OK pricing landing:", landing.slug, "rows:", landing.rows.length);