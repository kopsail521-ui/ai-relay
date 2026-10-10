/**
 * grok-video-1.5 rename + mojibake fix + group price table + tag corrections.
 * 1) both marketplace copy files: $0-expansion repair, key rename, price_table
 * 2) RULES: rename entry, UVDoc -> OCR, add gemini-embedding-2-preview
 * 3) docs: id rename in keyo-docs.html + keyo-api-ref(.en).md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);

const OLD_ID = "grok-imagine-video-1.5";
const NEW_ID = "grok-video-1.5";

/* ---------- 1) marketplace copy (both) ---------- */
for (const f of [
  "config/marketplace-model-copy.json",
  "services/creem-moderation-proxy/marketplace-model-copy.json",
]) {
  const j = JSON.parse(read(f));
  const e = j[OLD_ID];
  if (!e) throw new Error(f + ": entry missing");
  // mojibake repair across all locales of this entry
  const fix = (t) => String(t).split("/usr/bin/bash.3082").join("$0.3082");
  e.description = fix(e.description);
  if (e.description_zh) e.description_zh = fix(e.description_zh);
  if (e.description_en) e.description_en = fix(e.description_en);
  if (e.descriptions) {
    for (const k of Object.keys(e.descriptions)) e.descriptions[k] = fix(e.descriptions[k]);
  }
  // group price table (billing-unit-inject renders it like MiniMax-H3)
  e.price_table = {
    columns: {
      zhCN: ["场景", "价格 (/次)"],
      en: ["Scenario", "Price (/req)"],
    },
    rows: [
      ["文生 / 单图生视频", "$0.3082"],
      ["首尾帧", "$0.3082"],
      ["多参考图", "$0.3082"],
    ],
  };
  delete j[OLD_ID];
  j[NEW_ID] = e;
  // any other $0-expansion damage anywhere in the file?
  const leftover = JSON.stringify(j).match(/\/usr\/bin\/bash\.[0-9]/g);
  if (leftover) throw new Error(f + ": unrepaired mojibake remains");
  write(f, JSON.stringify(j, null, 2) + "\n");
  console.log(f, "-> renamed + mojibake fixed + price_table added");
}

/* ---------- 2) RULES ---------- */
const rulesPath = "services/gitee-passthrough/fix-marketplace-meta.mjs";
let m = read(rulesPath);
const oldRule = `  "${OLD_ID}": {
    vendor: "xAI",
    tag: "视频模型",
    endpoints: EP.chat,
    icon: "XAI",
  },`;
const newRule = `  "${NEW_ID}": {
    vendor: "xAI",
    tag: "视频模型",
    endpoints: EP.chat,
    icon: "XAI",
  },
  "gemini-embedding-2-preview": {
    vendor: "Google",
    tag: "嵌入模型",
    endpoints: EP.embed,
    icon: "Gemini.Color",
  },`;
if (!m.includes(oldRule)) throw new Error("grok rule not found");
m = m.replace(oldRule, newRule);
const uvdocOld = `  UVDoc: { vendor: "其他", tag: "图像处理", endpoints: EP.imageProcess, icon: "Custom" },`;
const uvdocNew = `  UVDoc: { vendor: "其他", tag: "OCR", endpoints: EP.imageProcess, icon: "Custom" },`;
if (!m.includes(uvdocOld)) throw new Error("UVDoc rule not found");
m = m.replace(uvdocOld, uvdocNew);
write(rulesPath, m);
console.log("RULES: renamed, UVDoc -> OCR, gemini-embedding-2-preview -> 嵌入模型");

/* ---------- 3) docs id rename ---------- */
for (const f of [
  "static/brand/keyo-docs.html",
  "static/brand/keyo-api-ref.md",
  "static/brand/keyo-api-ref.en.md",
]) {
  const s = read(f);
  const n = (s.match(new RegExp(OLD_ID, "g")) || []).length;
  if (n === 0) throw new Error(f + ": no occurrences to rename");
  write(f, s.split(OLD_ID).join(NEW_ID));
  console.log(f, "renamed x", n);
}
console.log("DONE_GROK_RENAME_TAGS");
