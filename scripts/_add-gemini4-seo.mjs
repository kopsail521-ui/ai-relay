/**
 * 为 gemini-4-argon / gemini-4-barium 追加 batch2 SEO 模型页配置。
 *   node scripts/_add-gemini4-seo.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const p = path.join(root, "config/seo/batch2-models.json");
const data = JSON.parse(fs.readFileSync(p, "utf8"));

const entries = [
  {
    id: "gemini-4-argon",
    category: "llm",
    batch: 2,
    targetKeywords: ["gemini 4 argon api", "gemini-4-argon", "gemini api"],
    h1: "Gemini 4 Argon API on KeyoAPI",
    title: "Gemini 4 Argon API Guide | KeyoAPI",
    metaDescription:
      "Call gemini-4-argon on KeyoAPI ~$0.74/$3.68 per 1M. OpenAI-compatible Gemini 4 chat with strong coding and multimodal reasoning.",
    priceLabel: "~$0.74 / $3.68 per 1M in/out",
    priceUnit: "per_1m_tokens",
    related: ["gemini-3.8-flash", "gemini-4-barium", "gpt-6-astra"],
    endpoint: "POST /v1/chat/completions",
    codeHint: "model=gemini-4-argon",
    faqs: [
      {
        q: "How do I call gemini-4-argon?",
        a: "Set baseURL to https://www.keyoapi.xyz/v1, Authorization: Bearer YOUR_KEY, and model=gemini-4-argon on POST /v1/chat/completions.",
      },
      {
        q: "Where is live pricing?",
        a: "Confirm on /pricing/gemini-4-argon. Indicative Keyo rates are about $0.74 / $3.68 per 1M in/out.",
      },
    ],
    body:
      "gemini-4-argon is a current KeyoAPI Gemini 4-class chat ID — strong coding, reasoning, and multimodal input on an OpenAI-compatible endpoint at https://www.keyoapi.xyz/v1. Indicative sell rates are about $0.74 / $3.68 per 1M in/out; confirm /pricing/gemini-4-argon before volume. Family table: /gemini-api-pricing. The Barium sibling /model/gemini-4-barium covers million-token context lanes.",
    curlExample:
      'curl https://www.keyoapi.xyz/v1/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"gemini-4-argon","messages":[{"role":"user","content":"Compare Gemini 4 Argon and Flash on KeyoAPI"}]}\'',
    uniqueBlurb: "Live gemini-4-argon ID with current Keyo sell rates.",
  },
  {
    id: "gemini-4-barium",
    category: "llm",
    batch: 2,
    targetKeywords: ["gemini 4 barium api", "gemini-4-barium", "gemini long context api"],
    h1: "Gemini 4 Barium API on KeyoAPI",
    title: "Gemini 4 Barium API Guide | KeyoAPI",
    metaDescription:
      "Call gemini-4-barium on KeyoAPI ~$0.74/$3.68 per 1M. OpenAI-compatible Gemini 4 chat with million-token context.",
    priceLabel: "~$0.74 / $3.68 per 1M in/out",
    priceUnit: "per_1m_tokens",
    related: ["gemini-4-argon", "gemini-3.8-flash", "claude-sonnet-5-5"],
    endpoint: "POST /v1/chat/completions",
    codeHint: "model=gemini-4-barium",
    faqs: [
      {
        q: "How do I call gemini-4-barium?",
        a: "Set baseURL to https://www.keyoapi.xyz/v1, Authorization: Bearer YOUR_KEY, and model=gemini-4-barium on POST /v1/chat/completions.",
      },
      {
        q: "What is gemini-4-barium best at?",
        a: "Million-token context work: whole-repo review, legal and finance document analysis, and long tool transcripts. Confirm live rates on /pricing/gemini-4-barium.",
      },
    ],
    body:
      "gemini-4-barium is a current KeyoAPI Gemini 4-class chat ID with million-token context and multimodal input on an OpenAI-compatible endpoint at https://www.keyoapi.xyz/v1. Indicative sell rates are about $0.74 / $3.68 per 1M in/out; confirm /pricing/gemini-4-barium before volume. Family table: /gemini-api-pricing. For faster coding lanes, use the Argon sibling /model/gemini-4-argon.",
    curlExample:
      'curl https://www.keyoapi.xyz/v1/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"gemini-4-barium","messages":[{"role":"user","content":"Summarize this long document and list risks"}]}\'',
    uniqueBlurb: "Live gemini-4-barium ID with current Keyo sell rates.",
  },
];

const existing = new Set(data.models.map((m) => m.id));
for (const e of entries) {
  if (existing.has(e.id)) {
    const i = data.models.findIndex((m) => m.id === e.id);
    data.models[i] = e;
  } else {
    data.models.push(e);
  }
}
fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ok: true, ids: entries.map((e) => e.id), total: data.models.length }));
