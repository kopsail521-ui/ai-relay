/**
 * Strip SEO meta-talk from model page source JSON (visible to users/crawlers).
 * Usage: node scripts/clean-seo-meta-talk.mjs && node scripts/gen-seo-pages.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const FILES = [
  path.join(root, "config/seo/model-pages.json"),
  path.join(root, "config/seo/batch2-models.json"),
];

function cleanText(s) {
  if (!s || typeof s !== "string") return s;
  let out = s;

  // Drop whole paragraphs that are SEO operator notes
  out = out
    .split(/\n\n+/)
    .filter((p) => {
      const t = p.trim();
      if (/^Practical checklist for /i.test(t)) return false;
      if (/Target queries such as /i.test(t) && /CSR shell/i.test(t)) return false;
      if (/should land here with crawlable HTML/i.test(t)) return false;
      if (/Prefer this static guide for SEO/i.test(t)) return false;
      if (/^Target keywords:/i.test(t)) return false;
      return true;
    })
    .join("\n\n");

  // Sentence-level rewrites / removals
  out = out.replace(
    /for teams whose primary keyword is literally cheap llm api\.?/gi,
    "for teams that need a low-cost, high-volume LLM API."
  );
  out = out.replace(
    /whose primary keyword is literally [^.]+\.?/gi,
    "that need a cost-efficient API for this model."
  );
  out = out.replace(/\bTarget keywords:\s*[^.]*\.?/gi, "");
  out = out.replace(
    /Target queries such as [^.]*should land here with crawlable HTML—not a CSR shell\.?/gi,
    ""
  );
  out = out.replace(
    /Prefer this static guide for SEO and onboarding emails; prefer the console when operators need live balance and logs\.?/gi,
    ""
  );
  out = out.replace(
    /Re-test curl monthly when upstream request shapes change\.?/gi,
    ""
  );
  out = out.replace(/\bcrawlable HTML—not a CSR shell\b/gi, "OpenAI-compatible HTTP API");
  out = out.replace(/\bCSR shell\b/gi, "JavaScript-only page");
  out = out.replace(/\bfor SEO and onboarding emails\b/gi, "for onboarding docs");
  out = out.replace(
    /This landing page targets teams shopping for a cheap llm api that still clears hard coding and research workloads\.?/gi,
    "It suits teams that need strong coding and research quality without giving up OpenAI-compatible tooling."
  );
  out = out.replace(
    /This landing page targets teams[^.]*\.?/gi,
    ""
  );
  out = out.replace(
    /Why is this the cheap llm api hero model\?/gi,
    "Why pick this model for high-volume workloads?"
  );
  out = out.replace(
    /the cheap llm api hero model/gi,
    "a strong cost-efficient chat option"
  );
  out = out.replace(
    /Searchers evaluating claude api pricing usually land on Sonnet-class tiers first; this page shows how to buy that capability through an AI API relay\.?/gi,
    "If you are comparing Claude API pricing, Sonnet-class tiers are usually the first production fit — KeyoAPI exposes that capability through one OpenAI-compatible relay."
  );
  out = out.replace(
    /If you are optimizing gpt api pricing without rewriting clients, an OpenAI-compatible cheap llm api like KeyoAPI is the shortest path\.?/gi,
    "If you want lower GPT API pricing without rewriting clients, KeyoAPI keeps the OpenAI-compatible request shape."
  );
  out = out.replace(
    /where cheap llm api unit economics matter more than peak IQ\.?/gi,
    "where unit cost matters more than peak model IQ."
  );
  out = out.replace(
    /This is how a cheap llm api actually shows up in unit economics\.?/gi,
    "That is how lower token rates show up in real unit economics."
  );
  out = out.replace(
    /Luna is where cheap llm api claims become real COGS\.?/gi,
    "Luna is where low token rates become real cost of goods."
  );
  out = out.replace(
    /priced for a cheap llm api budget\.?/gi,
    "priced for production budgets."
  );
  out = out.replace(
    /available through KeyoAPI’s cheap llm api gateway\.?/gi,
    "available through KeyoAPI’s OpenAI-compatible gateway."
  );
  // Collapse spaces/tabs only — keep paragraph breaks
  out = out.replace(/[^\S\n]{2,}/g, " ");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

function cleanModel(m) {
  if (m.body) m.body = cleanText(m.body);
  if (m.uniqueBlurb) m.uniqueBlurb = cleanText(m.uniqueBlurb);
  if (m.sections) {
    for (const k of Object.keys(m.sections)) {
      m.sections[k] = cleanText(m.sections[k]);
    }
  }
  if (Array.isArray(m.faqs)) {
    for (const f of m.faqs) {
      if (f.q) f.q = cleanText(f.q);
      if (f.a) f.a = cleanText(f.a);
    }
  }
  return m;
}

let changed = 0;
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const models = data.models || [];
  for (const m of models) {
    const before = JSON.stringify(m);
    cleanModel(m);
    if (JSON.stringify(m) !== before) changed += 1;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log("cleaned", path.relative(root, file), "models_touched≈", changed);
}

console.log("Done. Next: node scripts/gen-seo-pages.mjs");
