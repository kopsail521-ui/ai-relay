import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const base = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const key = env.OPENLUX_API_KEY;

// 1. headers of the non-stream response
const r1 = await fetch(`${base}/v1/chat/completions`, {
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
console.log("non-stream headers:");
r1.headers.forEach((v, k) => { if (/audio|url|quota|usage|content/i.test(k)) console.log("  ", k, ":", v.slice(0, 100)); });
const j1 = await r1.json();
console.log("content:", JSON.stringify(j1.choices?.[0]?.message?.content));

// 2. stream: true
const r2 = await fetch(`${base}/v1/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gemini-3.8-flash-tts",
    modalities: ["text", "audio"],
    audio: { voice: "Kore", format: "wav" },
    stream: true,
    messages: [{ role: "user", content: "Say hi." }],
  }),
  signal: AbortSignal.timeout(90000),
});
console.log("stream status:", r2.status, r2.headers.get("content-type"));
const text = await r2.text();
const lines = text.split("\n").filter(Boolean);
console.log("stream chunks:", lines.length);
let audioLen = 0, sawUsage = false;
for (const ln of lines.slice(0, 4)) console.log("  ", ln.slice(0, 160));
for (const ln of lines) {
  if (ln.includes('"audio"') || ln.includes("UklGR") || ln.includes("data:audio")) audioLen += ln.length;
  if (ln.includes("usage")) sawUsage = true;
}
console.log("audio-ish bytes in stream:", audioLen, "usage_chunk:", sawUsage);
const lastChunks = lines.slice(-3);
for (const ln of lastChunks) console.log("  tail:", ln.slice(0, 200));
