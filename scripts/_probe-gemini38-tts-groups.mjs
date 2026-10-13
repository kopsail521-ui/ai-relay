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
const res = await fetch(`${base}/api/pricing_new`, {
  headers: { Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(30000),
});
const j = await res.json();
if (!j.success) {
  console.error("pricing_new failed", JSON.stringify(j).slice(0, 300));
  process.exit(1);
}
console.log("usable_group:", JSON.stringify(j.usable_group ?? null));
for (const name of ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"]) {
  const m = j.data.find((x) => x.model_name === name);
  if (!m) {
    console.log(name, "=> MISSING");
    continue;
  }
  console.log("=====", name);
  console.log("  model_ratio:", m.model_ratio, "completion_ratio:", m.completion_ratio, "model_price:", m.model_price, "quota_type:", m.quota_type);
  const groups = (m.enable_groups || []).map((g) => {
    const r = j.group_ratio[g];
    const costIn = r != null ? +(m.model_ratio * r * 2).toFixed(8) : null;
    const costOut = costIn != null ? +(costIn * (m.completion_ratio || 1)).toFixed(8) : null;
    return { group: g, ratio: r, cost_in: costIn, cost_out: costOut };
  }).sort((a, b) => (a.ratio ?? 9) - (b.ratio ?? 9));
  for (const g of groups) console.log("  ", JSON.stringify(g));
}
