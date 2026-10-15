// One-off: replace plain-text sibling mentions in video-line body copy with
// site paths so linkifySitePaths renders them as natural-word internal links.
// Run from repo root: node scripts/_linkify-video-body-mentions.mjs
import fs from "fs";
import path from "path";

const file = path.resolve("config/seo/pricing-landings.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

// slug -> array of [oldSubstring, newSubstring]; each must match exactly once.
const edits = {
  "seedance-2-0-api-pricing": [
    [
      "For the current-generation flagship see Seedance 2.5 pricing; for other video lanes on the same key see MiniMax-H3, FLUX.3 Video, Wan 3.0 and Agnes Video 2.5 on /pricing-list.",
      "For the current-generation flagship see /seedance-2-5-api-pricing; for other video lanes on the same key see /minimax-h3-api-pricing, /flux-3-video-api-pricing, /wan3-video-api-pricing and /agnes-video-2-5-api-pricing, all listed on /pricing-list.",
    ],
  ],
  "seedance-2-5-api-pricing": [
    [
      "For image-to-video and longer scenes, compare the 2.5 and 2.0 tiers on this page, then check /pricing-list for the full catalog.",
      "For image-to-video and longer scenes, compare the 2.5 tiers here with the six 2.0 SKUs on /seedance-2-0-api-pricing, then check /pricing-list for the full catalog.",
    ],
  ],
  "minimax-h3-api-pricing": [
    [
      "Compare it with Seedance and other video lanes on /pricing-list when you need a second vendor on the same key.",
      "Compare it with /seedance-2-5-api-pricing and other video lanes on /pricing-list when you need a second vendor on the same key.",
    ],
  ],
  "wan3-video-api-pricing": [
    [
      "Compare it with Seedance, MiniMax-H3 and FLUX.3 Video on /pricing-list when you want multiple video vendors on one key.",
      "Compare it with /seedance-2-5-api-pricing, /minimax-h3-api-pricing and /flux-3-video-api-pricing on /pricing-list when you want multiple video vendors on one key.",
    ],
  ],
  "agnes-video-2-5-api-pricing": [
    [
      "For other video lanes on the same key see Seedance 2.5, MiniMax-H3 and FLUX.3 Video on /pricing-list; for post-generation cleanup see the subtitle erase and video enhance tools.",
      "For other video lanes on the same key see /seedance-2-5-api-pricing, /minimax-h3-api-pricing and /flux-3-video-api-pricing on /pricing-list; for post-generation cleanup see /subtitle-erase-pro-api-pricing and /video-enhance-pro-api-pricing.",
    ],
  ],
  "video-enhance-pro-api-pricing": [
    [
      "For removing burned-in subtitles on the same key see the subtitle erase tool; for generation see Seedance, MiniMax-H3, FLUX.3 and Wan 3.0 on /pricing-list.",
      "For removing burned-in subtitles on the same key see /subtitle-erase-pro-api-pricing; for generation see /seedance-2-5-api-pricing, /minimax-h3-api-pricing, /flux-3-video-api-pricing and /wan3-video-api-pricing on /pricing-list.",
    ],
  ],
  "subtitle-erase-pro-api-pricing": [
    [
      "Pair it with the video enhance tool for restore-then-upscale workflows; for generation see the Seedance, MiniMax-H3, FLUX.3 and Wan 3.0 lanes on /pricing-list.",
      "Pair it with /video-enhance-pro-api-pricing for restore-then-upscale workflows; for generation see /seedance-2-5-api-pricing, /minimax-h3-api-pricing, /flux-3-video-api-pricing and /wan3-video-api-pricing on /pricing-list.",
    ],
  ],
};

for (const p of data.pages || []) {
  const ops = edits[p.slug];
  if (!ops) continue;
  for (const [oldS, newS] of ops) {
    let hits = 0;
    for (let i = 0; i < (p.body || []).length; i++) {
      if (p.body[i].includes(oldS)) {
        p.body[i] = p.body[i].replace(oldS, newS);
        hits++;
      }
    }
    if (hits !== 1) throw new Error(`${p.slug}: expected 1 match, got ${hits} for: ${oldS.slice(0, 60)}...`);
  }
  console.log("OK", p.slug);
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("WROTE", file);