/**
 * One-shot: pull /api/pricing and write config/seo/free-models-extra.json
 * (fixed $0 models that are not in Keyo Free *-free list).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "config/seo/free-models-extra.json");
const permanentPath = path.join(root, "config/sensenova-free-models.json");

const permanent = new Set(
  JSON.parse(fs.readFileSync(permanentPath, "utf8")).models.map((m) => m.id)
);

const res = await fetch("https://www.keyoapi.xyz/api/pricing");
if (!res.ok) throw new Error(`pricing HTTP ${res.status}`);
const j = await res.json();
const data = Array.isArray(j.data) ? j.data : [];

function family(id) {
  const s = String(id).toLowerCase();
  if (s.includes("glm")) return "GLM";
  if (s.includes("qwen")) return "Qwen";
  if (s.includes("gemma") || s.includes("gemini")) return "Google";
  if (s.includes("deepseek")) return "DeepSeek";
  if (s.includes("nemotron")) return "NVIDIA";
  if (s.includes("mistral")) return "Mistral";
  if (s.includes("step")) return "StepFun";
  if (s.includes("ling")) return "Ant Group";
  if (s.includes("muse") || s.includes("atria") || s.includes("laguna")) return "Other";
  return "Other";
}

const extra = data
  .filter((m) => Number(m.quota_type) === 1 && Number(m.model_price) === 0)
  .filter((m) => !permanent.has(m.model_name))
  .map((m) => ({
    id: m.model_name,
    family: family(m.model_name),
    note: "Fixed $0 on Keyo catalog (fair-use). Availability can change with upstream free pools.",
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const payload = {
  _note:
    "Additional fixed-$0 model IDs from live /api/pricing (quota_type=1, model_price=0), excluding Keyo Free *-free IDs. Refresh with: node scripts/_sync-free-extra-from-live.mjs",
  synced_at: new Date().toISOString().slice(0, 10),
  models: extra,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`wrote ${extra.length} extras → ${outPath}`);
