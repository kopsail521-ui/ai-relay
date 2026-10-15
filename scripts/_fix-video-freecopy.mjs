// One-off: make the video-line freeKiller copy honest — the $0 catalog IDs are
// chat/speech lanes, there is no free video tier. Also aligns the 2.0 FAQ.
// Run from repo root: node scripts/_fix-video-freecopy.mjs
import fs from "fs";
import path from "path";

const file = path.resolve("config/seo/pricing-landings.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const GEN_TITLE = "No free video tier — wire your client at $0";
const TOOL_TITLE = "No free tier — wire the loop at $0";
const WIRING =
  "They draw down your $10 welcome credit (fair-use rate limits) and are the right place to prove out base URL, auth and retry wiring.";
const PREFIX =
  "The fixed free catalog IDs cost $0 per call — chat and speech models only, there is no free video tier. ";

const edits = {
  "seedance-2-5-api-pricing": {
    title: GEN_TITLE,
    body: `${PREFIX}${WIRING} Then switch model= to seedance-2.5-1080p on the same key; video bills per generated second at the rates on this page.`,
    oldBody:
      "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits) — handy for warming up your pipeline before switching model= to seedance-2.5-1080p on the same base URL and key.",
  },
  "seedance-2-0-api-pricing": {
    title: "No free Seedance tier — wire your client at $0",
    body: `Keyo ships no free Seedance ID — the $0 catalog IDs are chat and speech models only. Use them (covered by your $10 welcome credit, fair-use rate limits) to prove out base URL, auth and retry wiring, then switch model= to a seedance-2.0 SKU on the same key. Video bills per generated second; the 720p-mini tier starts at about $0.0499.`,
    oldBody:
      "Keyo ships no free Seedance ID, but the fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your video pipeline at $0, then switch model= to a seedance-2.0 SKU on the same base URL and key — the mini tiers start around five cents per generated second.",
    faqOld:
      "No free Seedance ID exists on Keyo. The $0 path is the fixed free catalog IDs (covered by your $10 welcome credit, fair-use rate limits) for pipeline prototyping, then switch model= to a seedance-2.0 SKU. The cheapest paid tier is seedance-2.0-720p-mini at about $0.0499 per generated second.",
    faqNew:
      "No free Seedance ID exists on Keyo — the $0 catalog IDs are chat and speech models only. Use them (covered by your $10 welcome credit, fair-use rate limits) to prove out your wiring, then switch model= to a seedance-2.0 SKU. The cheapest paid tier is seedance-2.0-720p-mini at about $0.0499 per generated second.",
  },
  "minimax-h3-api-pricing": {
    title: GEN_TITLE,
    body: `${PREFIX}${WIRING} Then switch model= to MiniMax-H3 on the same key; video bills per generated second from about $0.0205 (480p) at the rates on this page.`,
    oldBody:
      "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your video pipeline at $0, then switch model= to MiniMax-H3 on the same base URL and key.",
  },
  "flux-3-video-api-pricing": {
    title: GEN_TITLE,
    body: `${PREFIX}${WIRING} Then switch model= to flux-3-video on the same key; video bills per generated second — the DRAFT tier starts at about $0.0576.`,
    oldBody:
      "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your pipeline at $0, then switch model= to flux-3-video on the same base URL and key.",
  },
  "wan3-video-api-pricing": {
    title: GEN_TITLE,
    body: `${PREFIX}${WIRING} Then switch model= to wan3.0-video on the same key; video bills per generated second — 480P starts at about $0.0411.`,
    oldBody:
      "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your pipeline at $0, then switch model= to wan3.0-video on the same base URL and key.",
  },
  "agnes-video-2-5-api-pricing": {
    title: GEN_TITLE,
    body: `${PREFIX}${WIRING} Then switch model= to agnes-video-2.5 on the same key; video bills per generated second — 720p starts at about $0.0205.`,
    oldBody:
      "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your pipeline at $0, then switch model= to agnes-video-2.5 on the same base URL and key.",
  },
  "video-enhance-pro-api-pricing": {
    title: TOOL_TITLE,
    body: `The fixed free catalog IDs cost $0 per call — chat and speech models only, this tool has no free tier. ${WIRING} Then point your submit-and-poll loop at /v1/async/videos/enhance with the same key; billing is per second of processed video at the rates on this page.`,
    oldBody:
      "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Wire up your submit-and-poll loop against a $0 model first, then point it at /v1/async/videos/enhance with the same key.",
  },
  "subtitle-erase-pro-api-pricing": {
    title: TOOL_TITLE,
    body: `The fixed free catalog IDs cost $0 per call — chat and speech models only, this tool has no free tier. ${WIRING} Then point your submit-and-poll loop at /v1/async/videos/subtitle-erase with the same key; billing is per second of processed video at about $0.0183.`,
    oldBody:
      "Keyo's fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Build your submit-and-poll pipeline against a $0 model first, then point it at /v1/async/videos/subtitle-erase with the same key.",
  },
};

for (const p of data.pages || []) {
  const e = edits[p.slug];
  if (!e) continue;
  if (p.freeKiller.body !== e.oldBody) {
    throw new Error(`${p.slug}: freeKiller body does not match expected old text`);
  }
  p.freeKiller.title = e.title;
  p.freeKiller.body = e.body;
  if (e.faqOld) {
    const faq = (p.faqs || []).find((f) => f.a === e.faqOld);
    if (!faq) throw new Error(`${p.slug}: FAQ answer does not match expected old text`);
    faq.a = e.faqNew;
  }
  console.log("OK", p.slug);
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("WROTE", file);