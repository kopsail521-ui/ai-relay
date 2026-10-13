import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const base = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const key = env.OPENLUX_API_KEY;
const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const body = (over = {}) => ({
  model: "gemini-3.8-flash-tts",
  modalities: ["text", "audio"],
  audio: { voice: "Kore", format: "wav" },
  messages: [{ role: "user", content: "Say hi." }],
  ...over,
});

// 1. modalities audio-only
try {
  const r = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: H, body: JSON.stringify(body({ modalities: ["audio"] })), signal: AbortSignal.timeout(90000) });
  const j = await r.json();
  const msg = j.choices?.[0]?.message || {};
  console.log("audio-only:", r.status, "msg keys:", Object.keys(msg), "content head:", JSON.stringify(String(msg.content ?? "").slice(0, 40)), "audio?:", !!msg.audio, "usage:", JSON.stringify(j.usage?.completion_tokens_details));
} catch (e) { console.log("audio-only ERR", String(e).slice(0, 120)); }

// 2. mp3
try {
  const r = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: H, body: JSON.stringify(body({ audio: { voice: "Kore", format: "mp3" } })), signal: AbortSignal.timeout(90000) });
  const j = await r.json();
  const msg = j.choices?.[0]?.message || {};
  console.log("mp3:", r.status, "msg keys:", Object.keys(msg), "content head:", JSON.stringify(String(msg.content ?? "").slice(0, 40)), "audio?:", !!msg.audio);
} catch (e) { console.log("mp3 ERR", String(e).slice(0, 120)); }

// 3. stream retry
try {
  const r = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: H, body: JSON.stringify(body({ stream: true })), signal: AbortSignal.timeout(90000) });
  const t = await r.text();
  console.log("stream:", r.status, "len:", t.length, "head:", JSON.stringify(t.slice(0, 120)));
  console.log("stream has base64/wav marker:", t.includes("UklGR") || t.includes("data:audio") || t.includes('"audio"'));
} catch (e) { console.log("stream ERR", String(e).slice(0, 120)); }
