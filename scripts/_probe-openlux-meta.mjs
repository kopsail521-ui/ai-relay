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
const r = await fetch(`${base}/api/pricing_new`, {
  headers: { Authorization: `Bearer ${key}` },
});
const j = await r.json();
const out = { topKeys: Object.keys(j) };
for (const k of Object.keys(j)) {
  if (k === "data" || k === "vendors") continue;
  const v = j[k];
  if (Array.isArray(v)) {
    out[k] = { type: "array", len: v.length, sample: v.slice(0, 3) };
  } else if (v && typeof v === "object") {
    const keys = Object.keys(v);
    out[k] = {
      type: "object",
      keyCount: keys.length,
      sampleKeys: keys.slice(0, 15),
      sample: Object.fromEntries(keys.slice(0, 5).map((x) => [x, v[x]])),
    };
  } else out[k] = v;
}
// group ratios for relevant groups
const groups = [
  "Openai-Gpt-1",
  "Openai-Gpt-2",
  "Azure-Gpt-5",
  "Azure-Gpt-6",
  "default",
];
for (const candidate of ["group_ratio", "GroupRatio", "groupRatio", "groups", "auto_groups"]) {
  if (j[candidate]) {
    out.wanted = {};
    for (const g of groups) {
      out.wanted[g] = j[candidate][g] ?? null;
    }
  }
}
fs.writeFileSync(
  path.join(root, "scripts/_openlux-pricing-meta.json"),
  JSON.stringify(out, null, 2)
);
console.log("wrote meta");

// Also check how gpt-6-astra appears for formula calibration
const astra = j.data.find((m) => m.model_name === "gpt-6-astra");
console.log("astra", JSON.stringify({
  model_ratio: astra?.model_ratio,
  completion_ratio: astra?.completion_ratio,
  enable_groups: astra?.enable_groups,
  quota_type: astra?.quota_type,
}));
