import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const base = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const key = env.OPENLUX_API_KEY;

const r = await fetch(`${base}/v1/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gemini-3.8-flash-tts",
    modalities: ["text", "audio"],
    audio: { voice: "Kore", format: "wav" },
    messages: [{ role: "user", content: "Say hi." }],
  }),
  signal: AbortSignal.timeout(90000),
});
const j = await r.json();
console.log("status:", r.status);
console.log("top-level keys:", Object.keys(j));
const msg = j.choices?.[0]?.message || {};
console.log("message keys:", Object.keys(msg));
for (const [k, v] of Object.entries(msg)) {
  if (typeof v === "string") console.log(`  ${k}: str len=${v.length} head=${JSON.stringify(v.slice(0, 60))}`);
  else if (v && typeof v === "object") console.log(`  ${k}: object keys=${JSON.stringify(Object.keys(v))}`, Object.entries(v).map(([kk, vv]) => `${kk}:${typeof vv}${typeof vv === "string" ? `(len ${vv.length}, head ${JSON.stringify(vv.slice(0, 30))})` : `=${vv}`}`).join(", "));
  else console.log(`  ${k}:`, v);
}
console.log("usage:", JSON.stringify(j.usage));
