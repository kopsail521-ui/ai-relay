// One-off: set correct video curl examples on the four video pricing landings.
// Request shapes copied from static/brand/keyo-api-ref.html section 5.
// Run from repo root: node scripts/_set-video-curl-examples.mjs
import fs from "fs";
import path from "path";

const file = path.resolve("config/seo/pricing-landings.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const POLL = "# Poll GET /v1/tasks/{id} with the same key: processing = still rendering, completed = ready url";

const examples = {
  "seedance-2-5-api-pricing": `curl https://www.keyoapi.xyz/v1/videos/generations \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"seedance-2.5-1080p","prompt":"A red paper boat drifting on calm water at sunset","duration":5}'
${POLL}`,
  "minimax-h3-api-pricing": `curl https://www.keyoapi.xyz/v1/videos/generations \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"MiniMax-H3","prompt":"A red balloon rising into a blue sky, cinematic light","aspectRatio":"landscape","resolution":"480p","duration":5}'
${POLL}`,
  "flux-3-video-api-pricing": `curl https://www.keyoapi.xyz/v1/videos/generations \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"flux-3-video","prompt":"A flower blooming, slow camera push-in","duration":5,"resolution":"hd"}'
${POLL}`,
  "wan3-video-api-pricing": `curl https://www.keyoapi.xyz/v1/videos/generations \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"wan3.0-video","prompt":"A kitten running across a moonlit rooftop","resolution":"720P","duration":5}'
${POLL}`,
};

for (const p of data.pages || []) {
  if (examples[p.slug]) {
    p.curlExample = examples[p.slug];
    console.log("SET", p.slug);
  }
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("WROTE", file);