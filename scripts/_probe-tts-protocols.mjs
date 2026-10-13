import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const base = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const key = env.OPENLUX_API_KEY;
const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

function summarize(j) {
  const out = { ...j };
  if (out.data) out.data = `<base64 len=${String(out.data).length}>`;
  if (out.audio?.data) out.audio = { ...out.audio, data: `<len=${out.audio.data.length}>` };
  if (Array.isArray(out.choices)) {
    out.choices = out.choices.map(c => ({
      finish_reason: c.finish_reason,
      message: c.message ? {
        content: c.message.content ?? null,
        audio: c.message.audio ? { data_len: (c.message.audio.data || "").length, transcript: c.message.audio.transcript ?? null, expires_at: c.message.audio.expires_at ?? null } : undefined,
      } : undefined,
    }));
  }
  return JSON.stringify(out).slice(0, 700);
}

async function tryReq(label, url, body) {
  try {
    const r = await fetch(`${base}${url}`, { method: "POST", headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("json")) {
      console.log(label, "=>", r.status, summarize(await r.json()));
    } else {
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(label, "=>", r.status, ct, "bytes:", buf.length);
    }
  } catch (e) {
    console.log(label, "=> ERR", String(e).slice(0, 150));
  }
}

await tryReq("A 3.1 /v1/audio/speech", "/v1/audio/speech", { model: "gemini-3.1-flash-tts-preview", input: "Hello", voice: "Kore" });
await tryReq("B 3.8 chat+audio", "/v1/chat/completions", {
  model: "gemini-3.8-flash-tts",
  modalities: ["text", "audio"],
  audio: { voice: "Kore", format: "wav" },
  messages: [{ role: "user", content: "Say hello in one short sentence." }],
});
await tryReq("C 3.8 /v1/audio/generations", "/v1/audio/generations", { model: "gemini-3.8-flash-tts", input: "Hello", voice: "Kore" });
