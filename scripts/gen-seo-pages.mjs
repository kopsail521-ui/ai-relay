/**
 * Generate static SEO pages into static/seo/
 * Source: config/seo/model-pages.json (+ official-price-refs.json)
 * Usage: node scripts/gen-seo-pages.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { caddySeoHandles } from "./caddy-seo-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "static/seo");
const site = "https://www.keyoapi.xyz";

const pages = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/model-pages.json"), "utf8")
);
const priceRefs = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/official-price-refs.json"), "utf8")
);

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** First sentence without breaking on decimals like RMBG-2.0 */
function firstSentence(text) {
  const t = String(text || "").trim();
  const m = t.match(/^[\s\S]+?[.!?](?=\s|$)/);
  return m ? m[0].trim() : t.slice(0, 220).trim();
}

function css() {
  return `
:root {
  --bg0:#f7fafc; --bg1:#eef6ff; --ink:#0f172a; --muted:#475569;
  --line:#cbd5e1; --accent:#2563eb; --card:#fff; --ok:#047857;
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:linear-gradient(180deg,var(--bg0),var(--bg1));color:var(--ink);line-height:1.65}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:880px;margin:0 auto;padding:32px 20px 64px}
.nav,.footer{display:flex;flex-wrap:wrap;gap:10px 16px;font-size:14px;color:var(--muted)}
.nav{padding-bottom:20px;border-bottom:1px solid var(--line);margin-bottom:28px}
.footer{padding-top:28px;border-top:1px solid var(--line);margin-top:40px}
.eyebrow{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 10px}
h1{font-size:clamp(1.75rem,4vw,2.4rem);line-height:1.2;margin:0 0 14px}
h2{font-size:1.25rem;margin:28px 0 10px}
p{margin:0 0 14px;color:var(--ink)}
.lead{font-size:1.1rem;color:var(--muted)}
.meta{font-size:14px;color:var(--muted);margin:0 0 18px}
.btnrow{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 28px}
.btn{display:inline-block;padding:10px 16px;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none}
.btn-primary{background:var(--accent);color:#fff}
.btn-secondary{background:#fff;color:var(--ink);border:1px solid var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:16px 0}
pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow:auto;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--card)}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
th{background:#f1f5f9}
.ok{color:var(--ok);font-weight:600}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin:16px 0}
.grid a{display:block;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);text-decoration:none}
.grid a:hover{border-color:var(--accent)}
ul{margin:0 0 14px;padding-left:1.2em}
.faq details{border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 10px;background:#fff}
.faq summary{cursor:pointer;font-weight:600}
`.trim();
}

function nav() {
  return `<nav class="nav" aria-label="Primary">
  <a href="/">Home</a>
  <a href="/compare">Compare</a>
  <a href="/pricing">Pricing</a>
  <a href="/brand/keyo-docs.html">Docs</a>
  <a href="/sign-in">Sign in</a>
  <a href="/sign-up">Sign up</a>
</nav>`;
}

function footer() {
  return `<footer class="footer">
  <a href="/">Home</a>
  <a href="/compare">AI API price comparison</a>
  <a href="/pricing">Pricing list</a>
  <a href="/brand/keyo-docs.html">Docs</a>
  <a href="/brand/faq.html">FAQ</a>
  <a href="/brand/privacy.html">Privacy</a>
  <a href="/brand/terms.html">Terms</a>
  <a href="/sign-in">Console login</a>
</footer>`;
}

function layout({ title, description, canonical, h1, bodyHtml, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${site}/logo.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${css()}</style>
</head>
<body>
<div class="wrap">
${nav()}
<p class="eyebrow">KEYOAPI</p>
<h1>${esc(h1)}</h1>
${bodyHtml}
${footer()}
</div>
</body>
</html>
`;
}

function relatedLinks(ids) {
  const links = ids
    .map((id) => {
      const m = pages.models.find((x) => x.id === id);
      if (!m) return "";
      const label = m.h1.split(/\s[-–—]\s/)[0].trim();
      return `<a href="/model/${encodeURIComponent(id)}">${esc(label)}</a>`;
    })
    .filter(Boolean)
    .join("\n");
  return `<div class="grid">${links}</div>`;
}

function compareTableRows() {
  return priceRefs.compare_rows
    .map(
      (r) => `<tr>
  <td>${esc(r.capability)}</td>
  <td>${esc(r.official)}</td>
  <td><a href="/model/${encodeURIComponent(r.keyo_model)}">${esc(r.keyo_model)}</a><br/><span class="ok">${esc(r.keyo_price)}</span></td>
  <td>${esc(r.note)}</td>
</tr>`
    )
    .join("\n");
}

function renderModel(m) {
  const canonical = `${site}/model/${encodeURIComponent(m.id)}`;
  const leadSrc = m.sections?.intro || m.body;
  const lead = firstSentence(leadSrc);
  const paras = m.body
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n");
  const faqs = m.faqs
    .map(
      (f) =>
        `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`
    )
    .join("\n");
  const curl = m.curlExample || "";
  const bodyHtml = `
<p class="lead">${esc(lead)}</p>
<p class="meta">Target keywords: ${m.targetKeywords.map(esc).join(" · ")} · Price: <span class="ok">${esc(m.priceLabel)}</span></p>
<div class="btnrow">
  <a class="btn btn-primary" href="/pricing/${encodeURIComponent(m.id)}">Open interactive pricing</a>
  <a class="btn btn-secondary" href="/compare">Compare API prices</a>
  <a class="btn btn-secondary" href="/sign-up">Create account</a>
</div>
<h2>Overview</h2>
${paras}
<h2>Quick start</h2>
<div class="card">
<p>Base URL: <code>https://www.keyoapi.xyz/v1</code></p>
<p>Endpoint: <code>${esc(m.endpoint)}</code></p>
<p>Model: <code>${esc(m.codeHint)}</code></p>
<pre><code>${esc(curl)}</code></pre>
<p>Auth uses the same Bearer API key as chat. Full notes: <a href="/brand/keyo-docs.html">Keyo docs</a>.</p>
</div>
<h2>FAQ</h2>
<div class="faq">${faqs}</div>
<h2>Related models</h2>
${relatedLinks(m.related)}
<p class="meta">Static guide for <strong>${esc(m.id)}</strong>. Interactive try/buy: <a href="/pricing/${encodeURIComponent(m.id)}">/pricing/${esc(m.id)}</a>. Catalog: <a href="/pricing">/pricing</a>.</p>
`;
  return layout({
    title: m.title,
    description: m.metaDescription,
    canonical,
    h1: m.h1,
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: `KeyoAPI ${m.id}`,
      applicationCategory: "DeveloperApplication",
      url: canonical,
      description: m.metaDescription,
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        description: m.priceLabel,
      },
    },
  });
}

function renderHome() {
  const modelLinks = pages.models
    .map(
      (m) =>
        `<li><a href="/model/${encodeURIComponent(m.id)}">${esc(m.id)}</a> — ${esc(m.priceLabel)} · <a href="/model/${encodeURIComponent(m.id)}">guide</a></li>`
    )
    .join("\n");
  const bodyHtml = `
<p class="lead">KeyoAPI is a <strong>cheap llm api</strong> and multimodal <strong>ai api relay</strong> for overseas developers who want OpenAI-compatible access to chat, Whisper, OCR, vision, TTS, and digital humans — without five vendor bills.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Start free</a>
  <a class="btn btn-secondary" href="/compare">Full AI API price comparison</a>
  <a class="btn btn-secondary" href="/pricing">Pricing list</a>
</div>
<h2>Headline price anchors</h2>
<p class="meta">Indicative rates for planning. Confirm live sell prices on <a href="/pricing">/pricing</a>.</p>
<table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI</th><th>Notes</th></tr></thead>
<tbody>${compareTableRows()}</tbody>
</table>
<p><a href="/compare">See the full comparison page →</a></p>
<h2>Why teams pick this AI API relay</h2>
<p>KeyoAPI wins on purchase-intent searches: <strong>cheap llm api</strong>, <strong>ai api relay</strong>, and model-specific “{name} api” when developers already have a production bill to cut.</p>
<p>One base URL <code>https://www.keyoapi.xyz/v1</code>, one API key, prepaid balance, and model IDs you can swap in existing OpenAI SDKs for Python, Node.js, and Cursor-compatible clients.</p>
<h2>Featured capabilities</h2>
<ul>
  <li><a href="/model/gpt-5.6-luna">GPT-5.6 Luna</a> — high-volume cheap LLM tier</li>
  <li><a href="/model/claude-sonnet-5">Claude Sonnet 5</a> — balanced Claude-class chat</li>
  <li><a href="/model/whisper-large-v3">Whisper Large V3</a> — multilingual speech-to-text</li>
  <li><a href="/model/Qwen3-TTS">Qwen3-TTS</a> — async text to speech + voice clone</li>
  <li><a href="/model/MinerU2.5-Pro">MinerU2.5-Pro</a> — async document parsing OCR</li>
  <li><a href="/model/RMBG-2.0">RMBG-2.0</a> — background removal via /v1/images/mattings</li>
</ul>
<h2>All SEO model pages (batch 1)</h2>
<ul>${modelLinks}</ul>
<h2>Integrate in minutes</h2>
<pre><code>export OPENAI_BASE_URL=https://www.keyoapi.xyz/v1
export OPENAI_API_KEY=sk-...
# chat: model=gpt-5.6-terra or claude-sonnet-5
# speech: POST /v1/audio/transcriptions model=whisper-large-v3</code></pre>
<p>Docs: <a href="/brand/keyo-docs.html">/brand/keyo-docs.html</a> · Compare: <a href="/compare">/compare</a> · Console: <a href="/sign-in">/sign-in</a>.</p>
`;
  return layout({
    title: "KeyoAPI - Cheap LLM API & AI API Relay for Developers",
    description:
      "KeyoAPI is a cheap LLM API and AI API relay: OpenAI-compatible access to GPT-class, Claude-class, Whisper, OCR, vision, TTS, and digital humans.",
    canonical: `${site}/`,
    h1: "Cheap LLM API & AI API Relay for Global Developers",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "KeyoAPI",
      url: site,
      description:
        "Cheap LLM API and multimodal AI API relay with OpenAI-compatible endpoints.",
      applicationCategory: "DeveloperApplication",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  });
}

function renderCompare() {
  const llmRows = pages.models
    .filter((m) => m.category === "llm")
    .map(
      (m) =>
        `<tr><td><a href="/model/${encodeURIComponent(m.id)}">${esc(m.id)}</a></td><td>${esc(m.priceLabel)}</td><td><a href="/pricing/${encodeURIComponent(m.id)}">Interactive</a></td></tr>`
    )
    .join("\n");
  const bodyHtml = `
<p class="lead">This <strong>AI API price comparison</strong> page shows how KeyoAPI relay pricing stacks up against common official list rates for GPT-class, Claude-class, Whisper, and vision APIs.</p>
<p class="meta">Figures are indicative for planning. Always confirm live sell rates on <a href="/pricing">/pricing</a> before contracting volume.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Create KeyoAPI account</a>
  <a class="btn btn-secondary" href="/pricing">Open pricing list</a>
</div>
<h2>Headline comparisons</h2>
<table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI model</th><th>Notes</th></tr></thead>
<tbody>${compareTableRows()}</tbody>
</table>
<h2>Keyo LLM token rates (batch)</h2>
<table>
<thead><tr><th>Model</th><th>Listed Keyo price</th><th>Interactive page</th></tr></thead>
<tbody>${llmRows}</tbody>
</table>
<h2>How to use this comparison</h2>
<p>Searchers for <strong>ai api price comparison</strong> usually need a spreadsheet-ready story: same OpenAI SDK, lower blended token cost, and multimodal add-ons on one invoice. KeyoAPI is built as that <strong>ai api relay</strong>.</p>
<p>Recommended rollout: <a href="/model/gpt-5.6-luna">gpt-5.6-luna</a> on high-volume paths, <a href="/model/gpt-5.6-terra">gpt-5.6-terra</a> or <a href="/model/claude-sonnet-5">claude-sonnet-5</a> as default chat, escalate to <a href="/model/claude-opus-5">claude-opus-5</a> / <a href="/model/claude-fable-5">claude-fable-5</a>.</p>
<h2>Modality pages</h2>
${relatedLinks(["whisper-large-v3", "Qwen3-TTS", "MinerU2.5-Pro", "RMBG-2.0", "VajraV1", "Duix-Avatar"])}
`;
  return layout({
    title: "AI API Price Comparison - KeyoAPI vs Official Rates",
    description:
      "AI API price comparison for cheap LLM API and multimodal relay pricing on KeyoAPI versus typical OpenAI and Anthropic list rates.",
    canonical: `${site}/compare`,
    h1: "AI API Price Comparison: KeyoAPI vs Official List Rates",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "AI API Price Comparison",
      url: `${site}/compare`,
      description:
        "Compare KeyoAPI relay prices with official OpenAI and Anthropic list rates.",
    },
  });
}

function renderPricing() {
  const rows = pages.models
    .map(
      (m) => `<tr>
  <td><a href="/model/${encodeURIComponent(m.id)}"><code>${esc(m.id)}</code></a></td>
  <td>${esc(m.category)}</td>
  <td class="ok">${esc(m.priceLabel)}</td>
  <td><code>${esc(m.endpoint)}</code></td>
  <td><a href="/model/${encodeURIComponent(m.id)}">SEO guide</a> · <a href="/pricing/${encodeURIComponent(m.id)}">Try / buy</a></td>
</tr>`
    )
    .join("\n");
  const bodyHtml = `
<p class="lead">Static <strong>AI API pricing</strong> list for KeyoAPI — model IDs, indicative USD rates, and real endpoints. Use this page for crawlable gpt api pricing / claude api pricing research; open interactive try/buy links when you are ready to generate keys.</p>
<p class="meta">Rates below are catalog snapshots for SEO and planning. Wallet top-up and live sell prices are confirmed in the console after <a href="/sign-up">sign-up</a>.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Create account</a>
  <a class="btn btn-secondary" href="/compare">AI API price comparison</a>
  <a class="btn btn-secondary" href="/brand/keyo-docs.html">Docs</a>
</div>
<h2>Batch 1 model price table</h2>
<table>
<thead><tr><th>Model ID</th><th>Category</th><th>Listed price</th><th>Endpoint</th><th>Links</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<h2>Headline vs official list</h2>
<table>
<thead><tr><th>Capability</th><th>Typical official</th><th>Keyo</th><th>Notes</th></tr></thead>
<tbody>${compareTableRows()}</tbody>
</table>
<h2>How billing works</h2>
<p>KeyoAPI is a prepaid <strong>ai api relay</strong>: one balance covers chat, Whisper, OCR, vision, TTS, and digital humans. LLM rows are usually token-metered; many vision/speech models are per-request or async-task metered.</p>
<p>Interactive per-model pages under <code>/pricing/{modelId}</code> remain available for console try-out after login. Static guides live under <code>/model/{modelId}</code> for search engines.</p>
`;
  return layout({
    title: "AI API Pricing List - KeyoAPI Models & Rates",
    description:
      "Crawlable KeyoAPI pricing list: GPT-class, Claude-class, Whisper, OCR, vision, TTS model IDs with indicative USD rates and endpoints.",
    canonical: `${site}/pricing`,
    h1: "AI API Pricing List: Models, Rates & Endpoints",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "KeyoAPI Pricing List",
      url: `${site}/pricing`,
      description:
        "Static pricing table for KeyoAPI cheap LLM API and multimodal models.",
    },
  });
}

function writeRobots() {
  return `User-agent: *
Allow: /
Allow: /compare
Allow: /model/
Allow: /pricing
Allow: /brand/
Allow: /about

Sitemap: ${site}/sitemap.xml

Disallow: /pricing/
Disallow: /dashboard
Disallow: /console
Disallow: /sign-in
Disallow: /sign-up
Disallow: /setup
Disallow: /admin
Disallow: /api/
`;
}

function writeSitemap() {
  const urls = [
    { loc: `${site}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${site}/compare`, priority: "0.95", changefreq: "weekly" },
    { loc: `${site}/pricing`, priority: "0.9", changefreq: "daily" },
    ...pages.models.map((m) => ({
      loc: `${site}/model/${encodeURIComponent(m.id)}`,
      priority: "0.9",
      changefreq: "weekly",
    })),
    {
      loc: `${site}/brand/keyo-docs.html`,
      priority: "0.5",
      changefreq: "monthly",
    },
    { loc: `${site}/brand/faq.html`, priority: "0.4", changefreq: "monthly" },
    {
      loc: `${site}/brand/privacy.html`,
      priority: "0.2",
      changefreq: "yearly",
    },
    { loc: `${site}/brand/terms.html`, priority: "0.2", changefreq: "yearly" },
  ];
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

fs.mkdirSync(path.join(outDir, "model"), { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), renderHome());
fs.writeFileSync(path.join(outDir, "compare.html"), renderCompare());
fs.writeFileSync(path.join(outDir, "pricing.html"), renderPricing());
for (const m of pages.models) {
  fs.writeFileSync(path.join(outDir, "model", `${m.id}.html`), renderModel(m));
}
fs.writeFileSync(path.join(outDir, "robots.txt"), writeRobots());
fs.writeFileSync(path.join(outDir, "sitemap.xml"), writeSitemap());
fs.writeFileSync(path.join(outDir, "sitemap-live.xml"), writeSitemap());
fs.writeFileSync(path.join(root, "new-api/web/public/robots.txt"), writeRobots());
fs.writeFileSync(
  path.join(root, "new-api/web/public/sitemap.xml"),
  writeSitemap()
);
fs.writeFileSync(
  path.join(root, "scripts/caddy-seo-handles.caddyfragment"),
  caddySeoHandles() + "\n"
);

console.log(
  "Generated",
  3 + pages.models.length,
  "HTML pages + robots.txt + sitemap.xml ->",
  outDir
);
