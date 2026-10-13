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
const r = await fetch(`${base}/api/pricing_new`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
const j = await r.json();
const gmr = j.group_model_ratio || {};
console.log("group_model_ratio top-level groups:", Object.keys(gmr).length);

for (const name of ["gemini-3.8-flash-tts", "gemini-3.8-flash"]) {
  console.log("=====", name);
  const raw = j.data.find((x) => x.model_name === name);
  console.log("base model_ratio:", raw?.model_ratio, "completion_ratio:", raw?.completion_ratio);
  for (const [g, models] of Object.entries(gmr)) {
    const e = models && (models[name] ?? null);
    if (e) {
      const ratio = e.model_ratio ?? e.ratio ?? null;
      const comp = e.completion_ratio ?? e.completion ?? null;
      const effIn = ratio != null ? +(ratio * (j.group_ratio[g] ?? 1) * 2).toFixed(8) : null;
      const effOut = effIn != null && comp != null ? +(effIn * comp).toFixed(8) : null;
      console.log("  ", g, JSON.stringify({ override: e, eff_cost_in: effIn, eff_cost_out: effOut }));
    }
  }
}
