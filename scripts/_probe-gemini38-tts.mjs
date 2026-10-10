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
});
const j = await res.json();
if (!j.success) {
  console.error("pricing_new failed", JSON.stringify(j).slice(0, 500));
  process.exit(1);
}

const names = ["gemini-3.8-flash-tts", "gemini-3.8-flash", "gemini-3.1-flash-tts-preview"];
for (const name of names) {
  const m = j.data.find((x) => x.model_name === name);
  if (!m) {
    console.log(name, "=> MISSING");
    continue;
  }
  const groups = (m.enable_groups || []).map((g) => ({
    group: g,
    ratio: j.group_ratio[g] ?? null,
  })).filter((g) => g.ratio != null).sort((a, b) => a.ratio - b.ratio);
  const cheapest = groups[0] || null;
  const costIn = cheapest ? m.model_ratio * cheapest.ratio * 2 : null;
  const costOut = costIn != null ? costIn * (m.completion_ratio || 1) : null;
  console.log(JSON.stringify({
    name,
    model_ratio: m.model_ratio,
    completion_ratio: m.completion_ratio,
    model_price: m.model_price,
    quota_type: m.quota_type,
    model_type: m.model_type,
    tags: m.tags,
    endpoint_types: m.supported_endpoint_types,
    group_count: groups.length,
    cheapest_group: cheapest,
    cost_in_usd: costIn != null ? +costIn.toFixed(8) : null,
    cost_out_usd: costOut != null ? +costOut.toFixed(8) : null,
    sell_in_usd_2x: costIn != null ? +(costIn * 2).toFixed(8) : null,
    sell_out_usd_2x: costOut != null ? +(costOut * 2).toFixed(8) : null,
  }, null, 2));
}
