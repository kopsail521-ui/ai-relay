#!/usr/bin/env node
/**
 * Compare gitee media catalog IDs vs docs buttons / RULES endpoints.
 * Run: node scripts/audit-gitee-media-whitelist.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const catalog = JSON.parse(read("services/gitee-passthrough/catalog.json"));
const catIds = new Set(catalog.models.map((m) => m.id));

const docs = read("static/brand/keyo-docs.html");
// model buttons that look like gitee media / asr / tts / vision
const interesting = [
  "VajraV1",
  "sam3",
  "AnimeSharp",
  "Real-ESRGAN",
  "UVDoc",
  "RMBG-2.0",
  "MinerU2.5-Pro",
  "Unlimited-OCR",
  "Duix-Avatar",
  "InfiniteTalk",
  "MOSS-Audio-8B-Thinking",
  "Fun-ASR-Nano-2512",
  "GLM-ASR",
  "whisper-large-v3",
  "whisper-large-v3-turbo",
  "Qwen3-TTS",
  "CosyVoice3",
  "GLM-TTS",
  "IndexTTS-2",
  "Step-Audio-TTS-3B",
  "nonescape-v0",
  "Security-semantic-filtering",
  "nsfw-classifier",
  "Atria-dawn-v2",
  "DeepSeek-Prover-V2-7B",
];
const docIds = new Set(
  [...docs.matchAll(/data-copy="([^"]+)"/g)]
    .map((x) => x[1])
    .filter((id) => interesting.includes(id) || /Embedding|Reranker|WeMM|Qwen3-VL/.test(id))
);

let failed = false;
const missingInCat = [...docIds].filter((x) => !catIds.has(x)).sort();
const missingInDocs = interesting.filter((x) => catIds.has(x) && !docIds.has(x));

if (missingInCat.length) {
  failed = true;
  console.error("FAIL docs media not in gitee catalog:", missingInCat.join(", "));
} else {
  console.log("OK   docs media ⊆ gitee catalog");
}
console.log(
  "INFO catalog-only (ok if not on docs table):",
  [...catIds].filter((x) => !docIds.has(x)).sort().join(", ") || "(none)"
);
console.log(
  "INFO interesting missing from docs buttons:",
  missingInDocs.join(", ") || "(none)"
);
console.log("gitee_catalog_count", catIds.size);
console.log(failed ? "AUDIT_DRIFT" : "AUDIT_OK");
process.exit(failed ? 1 : 0);
