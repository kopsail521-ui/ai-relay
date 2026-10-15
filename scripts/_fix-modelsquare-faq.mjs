// One-off: drop the "Model Square (/pricing)" paren pattern (renders as
// "Model Square (the pricing page)") and the stale "warm up your pipeline"
// FAQ phrasing that contradicts the honest no-free-video-tier copy.
// Run from repo root: node scripts/_fix-modelsquare-faq.mjs
import fs from "fs";
import path from "path";

const file = path.resolve("config/seo/pricing-landings.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

// slug -> [oldExact, newExact]; each must match exactly one FAQ answer or body paragraph.
const edits = {
  "openai-api-pricing": [
    [
      "and use Model Square (/pricing) for interactive try/buy",
      "and use /pricing (Model Square) for interactive try/buy",
    ],
    [
      "confirm interactive try/buy under Model Square (/pricing)",
      "confirm interactive try/buy under /pricing (Model Square)",
    ],
  ],
  "tts-api": [
    [
      "Create a key at /sign-up, then open Model Square (/pricing) for interactive try/buy.",
      "Create a key at /sign-up, then open /pricing (Model Square) for interactive try/buy.",
    ],
  ],
  "minimax-h3-api-pricing": [
    [
      "Create a key at /sign-up and open Model Square (/pricing) to find MiniMax-H3, or start with a $0 free catalog ID on /free-models to warm up your pipeline.",
      "Create a key at /sign-up and open /pricing (Model Square) to find MiniMax-H3. To prove out base URL and auth first, call a $0 gift-credit ID on /free-models (chat and speech models), then switch model=.",
    ],
  ],
  "flux-3-video-api-pricing": [
    [
      "Create a key at /sign-up and open Model Square (/pricing) to find flux-3-video, or start with a $0 free catalog ID on /free-models.",
      "Create a key at /sign-up and open /pricing (Model Square) to find flux-3-video, or start with a $0 gift-credit ID on /free-models.",
    ],
  ],
  "wan3-video-api-pricing": [
    [
      "Create a key at /sign-up and open Model Square (/pricing) to find wan3.0-video, or start with a $0 free catalog ID on /free-models.",
      "Create a key at /sign-up and open /pricing (Model Square) to find wan3.0-video, or start with a $0 gift-credit ID on /free-models.",
    ],
  ],
  "agnes-video-2-5-api-pricing": [
    [
      "or find it in Model Square (/pricing).",
      "or find it in /pricing (Model Square).",
    ],
  ],
};

for (const p of data.pages || []) {
  const ops = edits[p.slug];
  if (!ops) continue;
  for (const [oldS, newS] of ops) {
    let hits = 0;
    for (const f of p.faqs || []) {
      if (f.a.includes(oldS)) {
        f.a = f.a.replace(oldS, newS);
        hits++;
      }
    }
    for (const b of p.body || []) {
      if (b.includes(oldS)) {
        p.body[p.body.indexOf(b)] = b.replace(oldS, newS);
        hits++;
      }
    }
    if (hits !== 1) {
      // idempotent re-run: already applied in a previous pass
      if (hits === 0 && JSON.stringify(p).includes(newS)) continue;
      throw new Error(`${p.slug}: expected 1 match, got ${hits}`);
    }
  }
  console.log("OK", p.slug);
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("WROTE", file);