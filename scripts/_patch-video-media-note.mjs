import fs from "fs";
const p = "static/brand/keyo-docs.html";
let s = fs.readFileSync(p, "utf8");
const note =
  '    "videoMediaNote": "Media: JSON only. Public http(s) URLs required. No local paths / data:base64.",\n';
const noteTw =
  '    "videoMediaNote": "媒體硬規則：只要 JSON。圖/影/音須為公網 http(s)。本機路徑與 data:base64 會被拒。",\n';

function injectBefore(needle, insert) {
  if (s.includes('"videoMediaNote"') && s.split('"videoMediaNote"').length > 3) {
    // may already have some
  }
  const idx = s.indexOf(needle);
  if (idx < 0) {
    console.log("MISS", needle.slice(0, 50));
    return;
  }
  // avoid double-insert immediately before this needle
  const before = s.slice(Math.max(0, idx - 80), idx);
  if (before.includes("videoMediaNote")) {
    console.log("SKIP", needle.slice(0, 40));
    return;
  }
  s = s.slice(0, idx) + insert + s.slice(idx);
  console.log("OK", needle.slice(0, 40));
}

injectBefore(
  '    "videoImagineNote": "grok-imagine-video-1.5-preview 僅支援',
  noteTw
);
injectBefore(
  '    "videoImagineNote": "grok-imagine-video-1.5-preview は画像',
  note
);
injectBefore(
  '    "videoImagineNote": "grok-imagine-video-1.5-preview = image→vidéo',
  note
);
injectBefore(
  '    "videoImagineNote": "grok-imagine-video-1.5-preview только',
  note
);
injectBefore(
  '    "videoImagineNote": "grok-imagine-video-1.5-preview chỉ',
  note
);

fs.writeFileSync(p, s);
console.log("wrote", p);
