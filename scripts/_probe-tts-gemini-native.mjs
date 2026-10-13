import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const base = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const key = env.OPENLUX_API_KEY;
const H = { "x-goog-api-key": key, "Content-Type": "application/json" };

async function tryNative(label, path, body) {
  try {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.log(label, "=>", r.status, JSON.stringify(j).slice(0, 300)); return; }
    const cand = j.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const audio = parts.find(p => p.inlineData?.data);
    const text = parts.find(p => p.text);
    console.log(label, "=>", r.status,
      "parts:", parts.map(p => p.inlineData ? `inline(${p.inlineData.mimeType}, b64len=${p.inlineData.data.length})` : `text(${(p.text || "").slice(0, 30)})`).join(" | "),
      "usage:", JSON.stringify(j.usageMetadata));
    if (audio) {
      const head = Buffer.from(audio.inlineData.data.slice(0, 8), "base64");
      console.log("   wav magic:", head.toString("hex"), "(RIFF=52494646)");
    }
  } catch (e) {
    console.log(label, "=> ERR", String(e).slice(0, 150));
  }
}

await tryNative(
  "gemini-native generateContent",
  "/v1beta/models/gemini-3.8-flash-tts:generateContent",
  {
    contents: [{ parts: [{ text: "Say hi." }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
    },
  }
);
