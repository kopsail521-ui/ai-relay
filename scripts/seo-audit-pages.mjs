#!/usr/bin/env node
/**
 * Local SEO/GEO page audit — mechanical proxy for the external geo audit
 * (T-008..T-013 acceptance). The external tool (geo.py/audit.json) is not in
 * this repo, so this implements the same criteria with explicit rules:
 *
 *   - unique H1 (exactly one)                       [T-013]
 *   - H2 section count in the 6-10 band             [T-013]
 *   - list density >= 0.35                          [T-013]
 *       density = li / (li + p + h2 + h3)
 *   - visible update date                           [T-013]
 *   - definition block   (subject + "is a ..." 20+ words sentence) [T-009]
 *   - numeric-facts block (compact ul/ol/table with >=3 numbers)   [T-008]
 *   - steps block        (ol with >=3 items)                      [T-010]
 *   - citable paragraphs (>=60 words + a number/definition)       [T-011]
 *   - body word count >=1000                                     [T-012]
 *
 * Usage: node scripts/seo-audit-pages.mjs [--json out.json] [--top N]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const seoDir = path.join(root, "static/seo");
const brandDir = path.join(root, "static/brand");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : "";
const topN = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : 15;

function listFiles(dir, ext, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, ext, base));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const files = [
  ...listFiles(seoDir, ".html")
    .filter((f) => !f.includes("landing-templates"))
    // SPA shells (by design) and the noindex redirect stub are not content pages
    .filter((f) => !/spa[-_]shell|deepseek-v4-pro\.html$/.test(f)),
  ...["keyo-docs.html", "keyo-api-ref.html", "faq.html"].map((f) =>
    path.join(brandDir, f)
  ),
];

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function count(re, s) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (s.match(g) || []).length;
}

function audit(file) {
  const raw = fs.readFileSync(file, "utf8");
  const body = strip(raw.slice(raw.indexOf("<body") > -1 ? raw.indexOf("<body") : 0));
  const rel = path.relative(root, file).replace(/\\/g, "/");

  const h1 = count(/<h1[\s>]/i, body);
  const h2 = count(/<h2[\s>]/i, body);
  const h3 = count(/<h3[\s>]/i, body);
  const li = count(/<li[\s>]/i, body);
  const p = count(/<p[\s>]/i, body);
  const density = li + p + h2 + h3 > 0 ? li / (li + p + h2 + h3) : 0;

  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text ? text.split(" ").length : 0;

  // update date: "Updated ..." or an explicit yyyy-mm-dd in the visible body
  const hasDate =
    /\b(updated|last updated)\b/i.test(body) ||
    /\b20\d{2}-\d{2}-\d{2}\b/.test(body) ||
    /<time[\s>]/i.test(body);

  // definition block: a paragraph with a "<Subject> is a ..." sentence of 20+ words
  const paragraphs = (body.match(/<p[\s>][^>]*>[\s\S]*?<\/p>/gi) || []).map((x) =>
    x.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
  const hasDef = paragraphs.some(
    (t) => /\bis an?\b/.test(t) && t.split(" ").length >= 20
  );

  // numeric-facts block: a ul/ol/table whose text carries >=3 distinct numbers
  const blocks = body.match(/<(ul|ol|table)[\s>][\s\S]*?<\/\1>/gi) || [];
  const hasFacts = blocks.some((b) => {
    const nums = b.replace(/<[^>]+>/g, " ").match(/\d+(?:[.,]\d+)?/g) || [];
    return new Set(nums).size >= 3;
  });

  // steps block: ol with >=3 items
  const hasSteps = blocks.some(
    (b) => /^<ol/i.test(b.trim()) && count(/<li[\s>]/i, b) >= 3
  );

  // citable paragraphs: >=60 words and contains a number
  const citable = paragraphs.filter(
    (t) => t.split(" ").length >= 60 && /\d/.test(t)
  ).length;

  let score = 0;
  score += h1 === 1 ? 15 : 0;
  score += h2 >= 6 && h2 <= 10 ? 15 : h2 >= 4 ? 8 : 0;
  score += density >= 0.35 ? 15 : Math.round((density / 0.35) * 15);
  score += hasDate ? 10 : 0;
  score += hasDef ? 12 : 0;
  score += hasFacts ? 12 : 0;
  score += hasSteps ? 11 : 0;
  score += words >= 1000 ? 10 : words >= 600 ? 5 : 0;

  return {
    file: rel,
    score,
    h1,
    h2,
    density: Number(density.toFixed(2)),
    words,
    hasDate,
    hasDef,
    hasFacts,
    hasSteps,
    citable,
  };
}

const rows = files.map(audit).sort((a, b) => a.score - b.score);
const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
const noDef = rows.filter((r) => !r.hasDef).length;
const noFacts = rows.filter((r) => !r.hasFacts).length;
const noSteps = rows.filter((r) => !r.hasSteps).length;
const noCitable = rows.filter((r) => r.citable === 0).length;
const short = rows.filter((r) => r.words < 1000).length;

console.log(`pages=${rows.length} avg=${avg.toFixed(1)}`);
console.log(
  `missing: def=${noDef} facts=${noFacts} steps=${noSteps} citable0=${noCitable} lt1000words=${short}`
);
console.log(`\nlowest ${topN}:`);
for (const r of rows.slice(0, topN)) {
  console.log(
    `${String(r.score).padStart(3)} ${r.file} h1=${r.h1} h2=${r.h2} den=${r.density} w=${r.words}` +
      ` date=${r.hasDate ? 1 : 0} def=${r.hasDef ? 1 : 0} facts=${r.hasFacts ? 1 : 0} steps=${r.hasSteps ? 1 : 0} cite=${r.citable}`
  );
}
if (jsonOut) {
  fs.writeFileSync(
    jsonOut,
    JSON.stringify({ avg, noDef, noFacts, noSteps, noCitable, short, rows }, null, 1)
  );
  console.log(`\nwrote ${jsonOut}`);
}
