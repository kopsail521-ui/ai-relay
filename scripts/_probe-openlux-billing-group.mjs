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
const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const pr = await fetch(`${base}/api/pricing_new`, { headers: H, signal: AbortSignal.timeout(30000) });
const pj = await pr.json();
const grp = pj.group_ratio || {};
console.log("group_ratio.default =", grp["default"] ?? "(absent)");
console.log("group_ratio samples:", JSON.stringify({
  "Aistudio-Gemini-2": grp["Aistudio-Gemini-2"],
  "Aistudio-Gemini-3": grp["Aistudio-Gemini-3"],
  "Vertex-Gemini-2": grp["Vertex-Gemini-2"],
  default: grp["default"] ?? null,
}));

const target = pj.data.find((x) => x.model_name === "gemini-3.8-flash");
if (!target) throw new Error("gemini-3.8-flash missing upstream");
const MR = target.model_ratio, CR = target.completion_ratio;
console.log("calibration model gemini-3.8-flash: model_ratio", MR, "completion_ratio", CR);

async function usage() {
  const r = await fetch(`${base}/v1/dashboard/billing/usage`, { headers: H, signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  return j.total_usage;
}
const u1 = await usage();
console.log("usage_before(cents):", u1);

const N = 10;
let sumPt = 0, sumCt = 0, last = null, ok = 0;
for (let i = 0; i < N; i++) {
  try {
    const r = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        model: "gemini-3.8-flash",
        messages: [{ role: "user", content: "Count slowly from 1 to 30, one number per line." }],
        max_tokens: 500,
        stream: false,
      }),
      signal: AbortSignal.timeout(90000),
    });
    const j = await r.json();
    if (j.usage) {
      ok++;
      sumPt += j.usage.prompt_tokens || 0;
      sumCt += j.usage.completion_tokens || 0;
      last = j.usage;
    } else {
      console.log("req", i, "no usage:", JSON.stringify(j).slice(0, 200));
    }
  } catch (e) {
    console.log("req", i, "ERR", String(e).slice(0, 120));
  }
}
console.log("requests_ok:", ok, "sum_prompt_tokens:", sumPt, "sum_completion_tokens:", sumCt);
console.log("last_usage:", JSON.stringify(last));

const u2 = await usage();
console.log("usage_after(cents):", u2);
const deltaCents = u2 - u1;
console.log("delta_cents:", deltaCents);
const deltaUsd = deltaCents / 100;
const denom = (sumPt * MR + sumCt * MR * CR) * 2;
if (denom > 0 && deltaUsd > 0) {
  const g = (deltaUsd * 1e6) / denom;
  console.log("EFFECTIVE_GROUP_RATIO:", g.toFixed(6));
  const costInTTS = 0.25 * g * 2, costOutTTS = costInTTS * 18;
  console.log("gemini-3.8-flash-tts REAL cost:", costInTTS.toFixed(6), "/", costOutTTS.toFixed(6), "per 1M");
  console.log("sell x2:", (costInTTS * 2).toFixed(6), "/", (costOutTTS * 2).toFixed(6));
} else {
  console.log("cannot solve: delta", deltaUsd, "denom", denom);
}
