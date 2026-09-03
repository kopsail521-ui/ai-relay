import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), "build-keyo-docs-i18n.mjs");
let s = fs.readFileSync(p, "utf8");

const pairs = [
  [
    'nGemFast: "Gemini 快",\n    nDsFast: "DeepSeek 快",\n    nDsStrong: "DeepSeek 强"',
    'nGemFast: "Gemini 快",\n    nGemFast38: "Gemini 3.8 快",\n    nDsFast: "DeepSeek 快",\n    nDsStrong: "DeepSeek 强"',
  ],
  [
    'nGemFast: "Gemini 快",\n    nDsFast: "DeepSeek 快",\n    nDsStrong: "DeepSeek 強"',
    'nGemFast: "Gemini 快",\n    nGemFast38: "Gemini 3.8 快",\n    nDsFast: "DeepSeek 快",\n    nDsStrong: "DeepSeek 強"',
  ],
  [
    'nGemFast: "Gemini 高速",\n    nDsFast: "DeepSeek 高速"',
    'nGemFast: "Gemini 高速",\n    nGemFast38: "Gemini 3.8 高速",\n    nDsFast: "DeepSeek 高速"',
  ],
  [
    'nGemFast: "Gemini rapide",\n    nDsFast: "DeepSeek rapide"',
    'nGemFast: "Gemini rapide",\n    nGemFast38: "Gemini 3.8 rapide",\n    nDsFast: "DeepSeek rapide"',
  ],
  [
    'nGemFast: "Gemini быстрый",\n    nDsFast: "DeepSeek быстрый"',
    'nGemFast: "Gemini быстрый",\n    nGemFast38: "Gemini 3.8 быстрый",\n    nDsFast: "DeepSeek быстрый"',
  ],
  [
    'nGemFast: "Gemini nhanh",\n    nDsFast: "DeepSeek nhanh"',
    'nGemFast: "Gemini nhanh",\n    nGemFast38: "Gemini 3.8 nhanh",\n    nDsFast: "DeepSeek nhanh"',
  ],
];

for (const [a, b] of pairs) {
  if (!s.includes(a)) {
    console.error("MISSING:", a.slice(0, 80));
    process.exit(1);
  }
  s = s.replace(a, b);
}

if (!s.includes('nGemFast38: "Gemini 3.8 fast"')) {
  console.error("en nGemFast38 missing (first patch may have failed)");
  process.exit(1);
}

const row = '  ["gemini-3.7-flash", "~$0.28", "~$1.38", "nGemFast"],';
const row2 =
  '  ["gemini-3.7-flash", "~$0.28", "~$1.38", "nGemFast"],\n  ["gemini-3.8-flash", "~$0.28", "~$1.38", "nGemFast38"],';
if (!s.includes("gemini-3.8-flash")) {
  if (!s.includes(row)) {
    console.error("chat row missing");
    process.exit(1);
  }
  s = s.replace(row, row2);
}

fs.writeFileSync(p, s);
console.log("ok nGemFast38 count=", (s.match(/nGemFast38/g) || []).length);
