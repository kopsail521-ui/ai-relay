// Probe: native Gemini protocol for gemini-3.8-flash-tts on openlux upstream.
// POST {base}/v1beta/models/{model}:generateContent  with x-goog-api-key
// body: contents + generationConfig.responseModalities=["AUDIO"]
import fs from "fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const base = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const key = env.OPENLUX_API_KEY;

const MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"];
const VOICES = ["Kore", "Kore"];

for (const model of MODELS) {
  const url = `${base}/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: "Say hello." }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
    },
  };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(model, "=>", r.status, ct, "bytes:", buf.length, "head:", buf.slice(0, 4).toString("hex"));
      continue;
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.log(model, "=>", r.status, JSON.stringify(j).slice(0, 300));
      continue;
    }
    const cand = j.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const audioPart = parts.find((p) => p.inlineData?.data);
    const textPart = parts.find((p) => p.text);
    console.log(model, "=>", r.status);
    console.log("  parts:", parts.map((p) => (p.inlineData ? `inline(${p.inlineData.mimeType}, b64len=${p.inlineData.data.length})` : `text(${JSON.stringify((p.text || "").slice(0, 40))})`)).join(" | "));
    if (audioPart) {
      const head = Buffer.from(audioPart.inlineData.data.slice(0, 8), "base64");
      console.log("  wav magic:", head.toString("hex"), "(RIFF = 52494646)");
    }
    console.log("  usage:", JSON.stringify(j.usageMetadata));
  } catch (e) {
    console.log(model, "=> ERR", String(e).slice(0, 150));
  }
}
