import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const base = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const key = env.OPENLUX_API_KEY;
const j = await (
  await fetch(`${base}/api/pricing_new`, {
    headers: { Authorization: `Bearer ${key}` },
  })
).json();

const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "config/openlux-chat-catalog.json"), "utf8")
);

function cheapest(groups) {
  let best = null;
  for (const g of groups || []) {
    const r = j.group_ratio[g];
    if (r == null) continue;
    if (!best || r < best.ratio) best = { group: g, ratio: r };
  }
  return best;
}

const samples = [
  "gpt-6-astra",
  "claude-fable-5",
  "deepseek-v4-flash",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
];
for (const name of samples) {
  const m = j.data.find((x) => x.model_name === name);
  const c = catalog.models.find((x) => x.model === name);
  if (!m) {
    console.log(name, "missing upstream");
    continue;
  }
  const g = cheapest(m.enable_groups);
  const costInGuess = m.model_ratio * g.ratio * 2;
  const costOutGuess = costInGuess * m.completion_ratio;
  console.log(
    JSON.stringify({
      name,
      model_ratio: m.model_ratio,
      completion_ratio: m.completion_ratio,
      image_ratio: m.image_ratio,
      group: g,
      guess_in: +costInGuess.toFixed(6),
      guess_out: +costOutGuess.toFixed(6),
      catalog_in: c?.cost_in_usd,
      catalog_out: c?.cost_out_usd,
      catalog_group: c?.group,
    })
  );
}

// For image models: maybe image tokens use image_ratio
const img = j.data.find((x) => x.model_name === "gpt-image-2.5-flare");
const g = cheapest(img.enable_groups);
console.log(
  "image token cost guesses",
  JSON.stringify({
    text_in: img.model_ratio * g.ratio * 2,
    image_in: (img.image_ratio || img.model_ratio) * g.ratio * 2,
    out: img.model_ratio * g.ratio * 2 * img.completion_ratio,
    out_via_image: (img.image_ratio || 1) * g.ratio * 2 * img.completion_ratio,
  })
);
