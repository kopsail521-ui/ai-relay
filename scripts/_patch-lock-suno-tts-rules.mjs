/** Lock suno_music(_open) + gemini-3.1-flash-tts-preview tags in RULES. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const f = path.join(root, "services/gitee-passthrough/fix-marketplace-meta.mjs");
let s = fs.readFileSync(f, "utf8");

// 1) VENDOR_ICON += Suno
if (!s.includes("Suno:")) {
  const anchor = '  "Black Forest Labs": "Flux",';
  if (!s.includes(anchor)) throw new Error("VENDOR_ICON anchor missing");
  s = s.replace(anchor, anchor + '\n  Suno: "Custom",');
}

// 2) RULES entries after the gemini-embedding-2-preview rule
const anchor2 = `  "gemini-embedding-2-preview": {
    vendor: "Google",
    tag: "嵌入模型",
    endpoints: EP.embed,
    icon: "Gemini.Color",
  },`;
if (!s.includes(anchor2)) throw new Error("gemini-embedding rule anchor missing");
const additions = anchor2 + `
  "suno_music_open": {
    vendor: "Suno",
    tag: "音乐",
    endpoints: JSON.stringify({ suno: "/suno/submit/MUSIC" }),
    icon: "Suno",
  },
  "suno_music": {
    vendor: "Suno",
    tag: "音乐",
    endpoints: JSON.stringify({ suno: "/suno/submit/MUSIC" }),
    icon: "Suno",
  },
  "gemini-3.1-flash-tts-preview": {
    vendor: "Google",
    tag: "语音合成",
    endpoints: EP.tts,
    icon: "Gemini.Color",
  },`;
s = s.replace(anchor2, additions);
fs.writeFileSync(f, s);
console.log("RULES locked: suno_music_open / suno_music / gemini-3.1-flash-tts-preview + VENDOR_ICON.Suno");
