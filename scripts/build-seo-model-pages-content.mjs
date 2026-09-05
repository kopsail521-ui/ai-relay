/**
 * Validate config/seo/model-pages.json word counts (>=300 each).
 * Content source of truth is the JSON file (edit there, then gen-seo-pages.mjs).
 * Usage: node scripts/build-seo-model-pages-content.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const file = path.join(root, "config/seo/model-pages.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

function words(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

let min = Infinity;
for (const m of data.models) {
  const n = m.bodyWordCount || words(m.body);
  if (n < 300) {
    console.error(`FAIL ${m.id}: ${n} words`);
    process.exit(1);
  }
  min = Math.min(min, n);
}
console.log("OK", data.models.length, "models, minWords=", min, "file=", file);
