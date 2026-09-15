/**
 * Generate static SEO pages into static/seo/
 * Source: config/seo/model-pages.json (+ official-price-refs.json)
 * Usage: node scripts/gen-seo-pages.mjs
 *
 * User-facing copy: do not use meta-talk such as "crawlable", "for SEO",
 * "search engines", "this page targets", "search demand", "searches are",
 * "buyers usually want", "How to think about this page", "What this page is not".
 * Keep product CTAs to /pricing/{id}. Do not globally strip the word "SEO" from
 * use cases (e.g. "SEO rewriting").
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { caddySeoHandles, caddyLandingHandlesTemplate } from "./caddy-seo-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "static/seo");
const site = "https://www.keyoapi.xyz";

const pages = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/model-pages.json"), "utf8")
);
const batch2 = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/batch2-models.json"), "utf8")
);
pages.models = [...pages.models, ...batch2.models];
const priceRefs = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/official-price-refs.json"), "utf8")
);
const pricingLandings = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/pricing-landings.json"), "utf8")
);
const freeCfg = JSON.parse(
  fs.readFileSync(path.join(root, "config/sensenova-free-models.json"), "utf8")
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
  <a href="/console">Console</a>
  <a href="/pricing">Model Square</a>
  <a href="/pricing-list">Pricing list</a>
  <a href="/rankings">Rankings</a>
  <a href="/brand/keyo-docs.html">Docs</a>
  <a href="/about">About</a>
  <a href="/sign-up">Get Started</a>
</nav>`;
}

function landingNavLabel(p) {
  return (
    p.navLabel ||
    p.slug.replace(/-api-pricing$/, " pricing").replace(/-/g, " ")
  );
}

function landingDeepDiveHtml(separator = " · ") {
  return (pricingLandings.pages || [])
    .map(
      (p) =>
        `<a href="/${esc(p.slug)}">${esc(landingNavLabel(p))}</a>`
    )
    .join(separator);
}

function footer() {
  const landingLinks = (pricingLandings.pages || [])
    .map(
      (p) =>
        `  <a href="/${esc(p.slug)}">${esc(landingNavLabel(p))}</a>`
    )
    .join("\n");
  return `<footer class="footer">
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/pricing">Model Square</a>
  <a href="/pricing-list">Pricing list</a>
  <a href="/models">Model guides</a>
  <a href="/compare">Price comparison</a>
  <a href="/free-models">Free AI API</a>
${landingLinks}
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

function freeTierBlock(m) {
  const ft = m.freeTier;
  if (!ft?.id) return "";
  const paid = m.id;
  const freeId = ft.id;
  const channel = ft.channel || "Keyo Free";
  return `
<h2>Free tier available</h2>
<div class="card">
<p>Same model family on KeyoAPI: use <code>${esc(freeId)}</code> for permanent <span class="ok">$0</span> fair-use calls (${esc(channel)} channel), or <code>${esc(paid)}</code> for token-metered production traffic.</p>
<p>Rules: free = <code>*-free</code> suffix; paid = bare ID. Fair-use rate/concurrency limits apply on free — see <a href="/free-models">/free-models</a>.</p>
<p><strong>Free curl</strong></p>
<pre><code>curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${esc(freeId)}","messages":[{"role":"user","content":"Hello"}]}'</code></pre>
<p><strong>Paid curl</strong></p>
<pre><code>curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${esc(paid)}","messages":[{"role":"user","content":"Hello"}]}'</code></pre>
</div>
`;
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
<p class="meta">Listed price: <span class="ok">${esc(m.priceLabel)}</span> · Confirm live rates on <a href="/pricing/${encodeURIComponent(m.id)}">interactive pricing</a>.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/pricing/${encodeURIComponent(m.id)}">Open interactive pricing</a>
  <a class="btn btn-secondary" href="/compare">Compare API prices</a>
  <a class="btn btn-secondary" href="/sign-up">Create account</a>
</div>
<h2>Overview</h2>
${paras}
${freeTierBlock(m)}
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
<p class="meta">Guide for <strong>${esc(m.id)}</strong>. Try/buy: <a href="/pricing/${encodeURIComponent(m.id)}">/pricing/${esc(m.id)}</a> · Catalog: <a href="/pricing">/pricing</a>.</p>
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
  // Conversion-first hero (matches keyo-home) + below-fold anchors.
  // OpenAI-compatible is a path fact, not a whole-catalog claim.
  const title = "KeyoAPI - One API Key for Chat, Speech, OCR & Vision | Cheap LLM API";
  const description =
    "One key, one balance for GPT-class, Claude, DeepSeek, Whisper, OCR, vision, TTS and avatar models. Chat, image and speech paths are OpenAI-compatible; OCR, CV and digital-human use dedicated REST paths. Cheap LLM API with prepaid credits.";
  const canonical = `${site}/`;
  const ogDescription =
    "One API key for chat, image, speech, OCR, vision and avatars — OpenAI-compatible on chat/image/speech paths; dedicated REST for the rest.";
  const twitterDescription = ogDescription;
  const headlineRows = priceRefs.compare_rows
    .slice(0, 4)
    .map(
      (r) => `<tr>
  <td>${esc(r.capability)}</td>
  <td>${esc(r.official)}</td>
  <td><a href="/model/${encodeURIComponent(r.keyo_model)}">${esc(r.keyo_model)}</a><br/><span class="ok">${esc(r.keyo_price)}</span></td>
  <td>${esc(r.note)}</td>
</tr>`
    )
    .join("\n");
  const featured = [
    ["gpt-5.6-terra", "GPT-5.6 Terra — flagship chat"],
    ["gpt-5.6-luna", "GPT-5.6 Luna — high-volume cheap LLM"],
    ["claude-sonnet-5", "Claude Sonnet 5 — reasoning"],
    ["deepseek-v4-flash", "DeepSeek V4 Flash — fast lane"],
    ["deepseek-v4-pro", "DeepSeek V4 Pro — flagship open-model"],
    ["glm-5.2", "GLM 5.2 — glm api lane"],
    ["kimi-k3", "Kimi K3 — Moonshot lane"],
    ["whisper-large-v3", "Whisper Large V3 — speech-to-text"],
  ]
    .filter(([id]) => pages.models.some((m) => m.id === id))
    .map(
      ([id, label]) =>
        `<a href="/model/${encodeURIComponent(id)}">${esc(label)}</a>`
    )
    .join("\n");
  const freeCards = freeCfg.models
    .map((m) => {
      const paid = m.upstream || String(m.id).replace(/-free$/, "");
      return `<a href="/model/${encodeURIComponent(paid)}"><code>${esc(m.id)}</code> — $0</a>`;
    })
    .join("\n");
  const modelFoot = pages.models
    .map(
      (m) =>
        `<a href="/model/${encodeURIComponent(m.id)}">${esc(m.id)}</a>`
    )
    .join("\n");
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
<meta property="og:description" content="${esc(ogDescription)}" />
<meta property="og:image" content="${site}/logo.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(twitterDescription)}" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "KeyoAPI",
    url: site,
    description:
      "Cheap LLM API relay: OpenAI-compatible chat/image/speech paths plus dedicated REST for OCR, vision and avatars — one prepaid key.",
    applicationCategory: "DeveloperApplication",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  })}</script>
<style>
:root{--bg0:#f7fafc;--bg1:#eef6ff;--ink:#0f172a;--muted:#475569;--line:#cbd5e1;--accent:#2563eb;--card:#fff;--ok:#047857;--panel:#0f172a;--panel-ink:#e2e8f0;--panel-muted:#94a3b8}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:linear-gradient(180deg,var(--bg0),var(--bg1));color:var(--ink);line-height:1.65}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.topnav{max-width:960px;margin:0 auto;padding:18px 20px 0;display:flex;flex-wrap:wrap;gap:10px 16px;font-size:14px;color:var(--muted)}
.hero{min-height:58vh;display:flex;align-items:center;justify-content:center;padding:32px 20px 24px}
.inner{max-width:760px;text-align:center}
.eyebrow{font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:14px}
h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.15;margin:0 0 16px}
.sub{font-size:1.125rem;color:var(--muted);margin:0 auto 28px;max-width:560px;line-height:1.6}
.actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:28px}
.btn{padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block}
.btn-primary{background:var(--accent);color:#fff}
.btn-secondary{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn-link{background:transparent;color:var(--accent)}
.panel{background:var(--panel);color:var(--panel-ink);border-radius:12px;padding:16px 18px;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;overflow:auto}
.panel .label{color:var(--panel-muted);margin-bottom:6px}
.panel .label+.label{margin-top:14px}
.surfaces{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:16px 0 8px;text-align:left}
.surf{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:14px}
.surf h3{font-size:15px;margin:0 0 8px}
.surf ul{margin:0;padding-left:1.15em;color:var(--muted)}
.surf code{font-size:12px;color:var(--ink)}
.content{max-width:880px;margin:0 auto;padding:8px 20px 48px}
h2{font-size:1.25rem;margin:28px 0 10px}
.meta{font-size:14px;color:var(--muted);margin:0 0 14px}
.ok{color:var(--ok);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--card)}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
th{background:#f1f5f9}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin:16px 0}
.grid a{display:block;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);text-decoration:none}
.grid a:hover{border-color:var(--accent)}
pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow:auto;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.foot{max-width:960px;margin:0 auto;padding:24px 20px 40px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
.frow{display:flex;flex-wrap:wrap;gap:10px 14px;margin-bottom:12px}
</style>
</head>
<body>
<nav class="topnav" aria-label="Primary">
  <a href="/">Home</a>
  <a href="/console">Console</a>
  <a href="/pricing">Model Square</a>
  <a href="/pricing-list">Pricing list</a>
  <a href="/rankings">Rankings</a>
  <a href="/brand/keyo-docs.html">Docs</a>
  <a href="/about">About</a>
  <a href="/sign-up">Get started</a>
</nav>
<section class="hero">
  <div class="inner">
    <div class="eyebrow">KEYOAPI · ONE KEY, MANY MODELS</div>
    <h1>One API for Multiple AI Models</h1>
    <p class="sub"><strong>One API key for chat, image, speech, OCR, vision and avatars</strong> — OpenAI-compatible on chat/image/speech paths; dedicated REST for the rest. A <strong>cheap LLM API</strong> with one prepaid balance — without five vendor bills.</p>
    <div class="actions">
      <a class="btn btn-primary" href="/sign-up">Start free — get API key</a>
      <a class="btn btn-secondary" href="/brand/keyo-docs.html">Docs</a>
      <a class="btn btn-link" href="/pricing">Browse Models</a>
    </div>
    <div class="panel">
      <div class="label">Base URL</div>
      <div>https://www.keyoapi.xyz/v1</div>
      <div class="label">Example (OpenAI-compatible chat)</div>
      <div>POST /v1/chat/completions &nbsp;·&nbsp; model=gpt-5.6-luna</div>
      <div class="label">What you get</div>
      <div>Compatible: chat / image / speech · Dedicated REST: OCR, CV, async video/docs, digital human · one key · /pricing</div>
    </div>
  </div>
</section>
<div class="content">
<h2>API surfaces (same key, same balance)</h2>
<p class="meta">Billing unit is a quick compatibility signal: token or OpenAI path ≈ SDK drop-in; page / request / second / characters ≈ dedicated docs path.</p>
<div class="surfaces">
  <div class="surf">
    <h3>OpenAI-compatible</h3>
    <ul>
      <li><code>/v1/chat/completions</code> — GPT-class, Claude, DeepSeek, GLM, Kimi</li>
      <li><code>/v1/images/generations</code> — text-to-image</li>
      <li><code>/v1/audio/transcriptions</code> — Whisper</li>
      <li><code>/v1/audio/speech</code> — sync TTS</li>
    </ul>
  </div>
  <div class="surf">
    <h3>Dedicated REST (see docs)</h3>
    <ul>
      <li>OCR / docs — often per page</li>
      <li>Vision tools (matting, detect, upscale) — per request</li>
      <li>Async TTS / video / digital human — per chars / request / second</li>
    </ul>
  </div>
</div>
<h2>Headline prices</h2>
<p class="meta">Indicative KeyoAPI sell rates for planning. Full table on <a href="/compare">/compare</a> · live list on <a href="/pricing-list">/pricing-list</a>.</p>
<table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI</th><th>Notes</th></tr></thead>
<tbody>
${headlineRows}
</tbody>
</table>
<p><a href="/compare">See the full comparison page →</a></p>
<h2>Free models — permanently $0</h2>
<p class="meta">Prototype on permanent free IDs, then flip to the token-metered twin. Rules: <a href="/free-models">/free-models</a>.</p>
<div class="grid">
${freeCards}
</div>
<h2>Featured models</h2>
<div class="grid">
${featured}
</div>
<p class="meta">Compare in depth: ${landingDeepDiveHtml()} · <a href="/models">all model guides</a></p>
<h2>Integrate in minutes</h2>
<pre><code>export OPENAI_BASE_URL=https://www.keyoapi.xyz/v1
export OPENAI_API_KEY=sk-...
# chat (OpenAI SDK): model=gpt-5.6-terra | claude-sonnet-5 | glm-5.2-free
# speech: POST /v1/audio/transcriptions model=whisper-large-v3
# OCR / matting / avatars: use dedicated paths in Docs — not drop-in chat SDK</code></pre>
</div>
<footer class="foot">
  <div class="frow">
    <a href="/pricing">Model Square</a>
    <a href="/pricing-list">Pricing list</a>
    <a href="/models">All model guides</a>
    <a href="/compare">Compare</a>
    <a href="/free-models">Free AI API</a>
${(pricingLandings.pages || [])
  .map(
    (p) =>
      `    <a href="/${esc(p.slug)}">${esc(landingNavLabel(p))}</a>`
  )
  .join("\n")}
    <a href="/brand/faq.html">FAQ</a>
    <a href="/brand/privacy.html">Privacy</a>
    <a href="/brand/terms.html">Terms</a>
    <a href="/sign-in">Sign in</a>
  </div>
  <div class="frow" aria-label="Popular model guides">
${modelFoot}
  </div>
</footer>
</body>
</html>
`;
}

function renderModelsIndex() {
  const rows = pages.models
    .map(
      (m) =>
        `<tr><td><a href="/model/${encodeURIComponent(m.id)}"><code>${esc(m.id)}</code></a></td><td>${esc(m.category || "")}</td><td class="ok">${esc(m.priceLabel)}</td><td><a href="/model/${encodeURIComponent(m.id)}">Guide</a> · <a href="/pricing/${encodeURIComponent(m.id)}">Try</a></td></tr>`
    )
    .join("\n");
  const bodyHtml = `
<p class="lead">Index of KeyoAPI model guides — chat, speech, vision, OCR, TTS, and digital humans. For the interactive catalog use <a href="/pricing">Model Square</a>.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/pricing">Browse Models</a>
  <a class="btn btn-secondary" href="/compare">Price comparison</a>
  <a class="btn btn-secondary" href="/free-models">Free models</a>
</div>
<h2>Headline price anchors</h2>
<table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI</th><th>Notes</th></tr></thead>
<tbody>${compareTableRows()}</tbody>
</table>
<h2>All model guides</h2>
<table>
<thead><tr><th>Model ID</th><th>Category</th><th>Listed price</th><th>Links</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p class="meta">Also: ${landingDeepDiveHtml()}.</p>
`;
  return layout({
    title: "AI Model Guides Index | KeyoAPI",
    description:
      "Index of KeyoAPI model guides — GPT-class, Claude, DeepSeek, GLM, Whisper, OCR, vision, TTS — with links to pricing and free tiers.",
    canonical: `${site}/models`,
    h1: "AI Model Guides on KeyoAPI",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "KeyoAPI Model Guides",
      url: `${site}/models`,
    },
  });
}

function renderAbout() {
  const priceSample = priceRefs.compare_rows
    .slice(0, 3)
    .map(
      (r) => `<tr>
  <td>${esc(r.capability)}</td>
  <td>${esc(r.official)}</td>
  <td><span class="ok">${esc(r.keyo_price)}</span></td>
</tr>`
    )
    .join("\n");
  const freeCards = freeCfg.models
    .map((m) => {
      const paid = m.upstream || String(m.id).replace(/-free$/, "");
      return `<a href="/model/${encodeURIComponent(paid)}"><code>${esc(m.id)}</code> · $0</a>`;
    })
    .join("\n");
  const bodyHtml = `
<p class="lead">KeyoAPI is a developer-first <strong>AI API relay</strong>: chat, image and speech are OpenAI-compatible, while OCR, vision tools, async video/docs and digital-human models run on dedicated REST paths — <strong>same key, same prepaid balance</strong>. No five vendor dashboards, no five invoices.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Start free — get API key</a>
  <a class="btn btn-secondary" href="/brand/keyo-docs.html">Docs</a>
  <a class="btn btn-secondary" href="/pricing">Browse Models</a>
</div>
<h2>What we do</h2>
<p>We aggregate many model providers behind one prepaid account. For chat (and supported image/speech paths), keep the OpenAI SDK: set <code>OPENAI_BASE_URL=https://www.keyoapi.xyz/v1</code> and swap <code>model=</code>. For OCR, matting, detection, async video and avatars, call the documented dedicated paths with the same key.</p>
<ul>
  <li><strong>OpenAI-compatible paths:</strong> <code>/v1/chat/completions</code>, <code>/v1/images/generations</code>, <code>/v1/audio/transcriptions</code>, <code>/v1/audio/speech</code>.</li>
  <li><strong>Dedicated REST:</strong> OCR, CV tools, async TTS/video, digital humans — billed per page / request / second / characters.</li>
  <li><strong>One key, one balance:</strong> no per-vendor accounts or credits to manage.</li>
  <li><strong>A permanently free tier:</strong> four models at $0 for prototyping (fair-use limits apply).</li>
</ul>
<h2>Pricing philosophy</h2>
<p>We publish rates openly, model by model. Sample indicative Keyo sell rates:</p>
<table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI</th></tr></thead>
<tbody>
${priceSample}
</tbody>
</table>
<p>Full list: <a href="/compare">/compare</a> · <a href="/pricing-list">/pricing-list</a> · deep dives: ${landingDeepDiveHtml()}</p>
<h2>Four models, permanently free</h2>
<p>No trial clock — these four run at <strong>$0</strong> when you call the <code>*-free</code> model ID. Paid twins (bare names) are token-metered for production. Rules: <a href="/free-models">/free-models</a></p>
<div class="grid">
${freeCards}
</div>
<h2>Model categories</h2>
<div class="grid">
  <a href="/model/gpt-5.6-terra">GPT-class chat</a>
  <a href="/model/claude-sonnet-5">Claude-class reasoning</a>
  <a href="/model/deepseek-v4-pro">DeepSeek open models</a>
  <a href="/model/glm-5.2">GLM</a>
  <a href="/model/kimi-k3">Kimi</a>
  <a href="/model/whisper-large-v3">Speech-to-text</a>
  <a href="/model/MinerU2.5-Pro">Document &amp; OCR</a>
  <a href="/model/Qwen3-TTS">TTS &amp; audio</a>
</div>
<h2>Support</h2>
<p>For product docs see <a href="/brand/keyo-docs.html">Docs</a>. Account and billing questions: use the <a href="/sign-in">console</a> after signup, or read <a href="/brand/faq.html">FAQ</a>, <a href="/brand/privacy.html">Privacy</a>, and <a href="/brand/terms.html">Terms</a>.</p>
<h2>Start building</h2>
<p>Grab a key and make your first request in minutes — free models included.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Start free — get API key</a>
  <a class="btn btn-secondary" href="/models">All model guides</a>
</div>
`;
  return layout({
    title: "About KeyoAPI - One API Key for Chat, Speech, OCR & Vision | Cheap LLM API",
    description:
      "KeyoAPI is an AI API relay: chat, image and speech are OpenAI-compatible; OCR, vision, TTS-async and digital-human models use dedicated REST paths — same key, same prepaid balance, 4 permanently free models.",
    canonical: `${site}/about`,
    h1: "One API for Multiple AI Models",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About KeyoAPI",
      url: `${site}/about`,
      description:
        "About KeyoAPI — cheap LLM API relay with OpenAI-compatible chat/image/speech and dedicated REST for OCR, vision and avatars.",
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
<p class="meta">Figures are indicative for planning. Always confirm live sell rates in <a href="/pricing">Model Square</a> or the static <a href="/pricing-list">pricing list</a> before contracting volume.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Create KeyoAPI account</a>
  <a class="btn btn-secondary" href="/pricing-list">Open pricing list</a>
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
  <td><a href="/model/${encodeURIComponent(m.id)}">Guide</a> · <a href="/pricing/${encodeURIComponent(m.id)}">Try / buy</a></td>
</tr>`
    )
    .join("\n");
  const bodyHtml = `
<p class="lead">Static <strong>AI API pricing</strong> list for KeyoAPI — model IDs, indicative USD rates, and real endpoints. Use this page to compare rates; open interactive try/buy links when you are ready to generate keys.</p>
<p class="meta">Rates below are catalog snapshots for planning. Wallet top-up and live sell prices are confirmed in the console after <a href="/sign-up">sign-up</a>.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Create account</a>
  <a class="btn btn-secondary" href="/pricing">Open Model Square</a>
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
<p>Try or buy from <code>/pricing/{modelId}</code> after login. Model explainers are at <code>/model/{modelId}</code>.</p>
`;
  return layout({
    title: "AI API Pricing List - KeyoAPI Models & Rates",
    description:
      "KeyoAPI pricing list: GPT-class, Claude-class, Whisper, OCR, vision, TTS model IDs with indicative USD rates and endpoints.",
    canonical: `${site}/pricing-list`,
    h1: "AI API Pricing List: Models, Rates & Endpoints",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "KeyoAPI Pricing List",
      url: `${site}/pricing-list`,
      description:
        "Static pricing table for KeyoAPI cheap LLM API and multimodal models.",
    },
  });
}

function renderFreeModels() {
  const rows = freeCfg.models
    .map((m) => {
      const paid = m.upstream || String(m.id).replace(/-free$/, "");
      return `<tr>
  <td><code>${esc(m.id)}</code></td>
  <td><a href="/model/${encodeURIComponent(paid)}"><code>${esc(paid)}</code></a></td>
  <td class="ok">$0</td>
  <td>${esc(m.vendor || "—")}</td>
  <td>${esc(freeCfg.channel_name || "Keyo Free")}</td>
</tr>`;
    })
    .join("\n");
  const exampleFree =
    freeCfg.models.find((m) => m.id.includes("flash"))?.id ||
    freeCfg.models[0]?.id ||
    "deepseek-v4-flash-free";
  const examplePaid = String(exampleFree).replace(/-free$/, "");
  const bodyHtml = `
<p class="lead">KeyoAPI offers a permanent <strong>free AI API</strong> tier — four LLM model IDs at <strong>$0</strong>, no credit card, not a time-boxed trial. Register a key and call with the <code>-free</code> suffix. Same capability family as the paid bare IDs; paid IDs are token-metered with higher priority.</p>
<p class="meta">Built for prototypes, demos, CI smoke tests, and eval harnesses. Production workloads should prefer paid bare model IDs.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Get a free API key</a>
  <a class="btn btn-secondary" href="/pricing-list">Full pricing list</a>
  <a class="btn btn-secondary" href="/brand/keyo-docs.html">Docs</a>
</div>
<h2>Free models (permanently $0)</h2>
<table>
<thead><tr><th>Free model ID</th><th>Paid twin (token-billed)</th><th>Price</th><th>Family</th><th>Channel</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p>Call the free ID exactly as listed (include <code>-free</code>). The paid twin uses the bare name and bills per token on the paid relay channel.</p>
<h2>Quick start (curl)</h2>
<p>Base URL is the OpenAI-compatible Chat Completions endpoint on KeyoAPI:</p>
<pre>curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${esc(exampleFree)}",
    "messages": [{"role":"user","content":"Hello"}]
  }'</pre>
<p>Paid twin (same family, token-metered):</p>
<pre>curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${esc(examplePaid)}",
    "messages": [{"role":"user","content":"Hello"}]
  }'</pre>
<h2>Free rules (read before you ship)</h2>
<ul>
  <li><strong>Price:</strong> ModelPrice is fixed at <strong>$0</strong> for <code>*-free</code> IDs — not a signup coupon that expires into a paid plan.</li>
  <li><strong>ID naming:</strong> free = <code>{name}-free</code>; full capability paid = bare <code>{name}</code>.</li>
  <li><strong>Fair use:</strong> Free traffic rides a dedicated free channel with <strong>fair-use rate / concurrency limits</strong>. Limits exist to keep the tier sustainable; they can be tightened under abuse. Do not treat free IDs as an unlimited production SLA.</li>
  <li><strong>Catch (honest):</strong> You get real model capability at $0; you do <em>not</em> get paid-tier priority or guaranteed throughput. If you need stable production QPS, use the paid twin.</li>
</ul>
<div class="faq">
<h2>FAQ</h2>
<details open>
  <summary>Is it really free?</summary>
  <p>Yes for the four <code>*-free</code> IDs listed above: permanently $0, no credit card required to start. Create an account, mint an API key, and set <code>model</code> to a free ID.</p>
</details>
<details>
  <summary>What's the catch?</summary>
  <p>Fair-use rate limiting and lower priority on the free channel. We publish this page so you are not surprised after signup. Exact RPM/concurrency can change; if you need predictable limits, use paid bare IDs.</p>
</details>
<details>
  <summary>Free vs paid?</summary>
  <p>Same model family / capability class. Free IDs are $0 with fair-use limits. Paid bare IDs are token-billed with higher priority — preferred for production.</p>
</details>
<details>
  <summary>Can I use it in production?</summary>
  <p>You can. For anything user-facing or latency-sensitive, we recommend the paid twin. Free is ideal for prototypes, demos, CI smoke tests, and eval harnesses.</p>
</details>
<details>
  <summary>Why one page for all four?</summary>
  <p>Four near-identical pages would repeat the same curl example and drift out of sync; one hub keeps the IDs, limits, and examples accurate. Paid model guides embed a Free tier block where relevant.</p>
</details>
</div>
<p class="meta">Also see the interactive catalog on <a href="/pricing">/pricing</a> (filter Free) and the OpenAI-compatible docs.</p>
`;
  return layout({
    title: "Free AI API — 4 Permanent $0 LLM Models | KeyoAPI",
    description:
      "Free AI API / free LLM API on KeyoAPI: four permanent $0 model IDs (deepseek-v4-pro-free, deepseek-v4-flash-free, kimi-k3-free, glm-5.2-free). No credit card. Fair-use limits apply.",
    canonical: `${site}/free-models`,
    h1: "Free AI API — 4 Models, Permanently $0, No Credit Card",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Free AI API — KeyoAPI",
      url: `${site}/free-models`,
      description:
        "Permanent $0 free LLM API models on KeyoAPI with OpenAI-compatible chat completions.",
    },
  });
}

function renderPricingLanding(p) {
  const canonical = `${site}/${p.slug}`;
  const tableHeading = p.tableHeading || "Price comparison table";
  const colOfficial = p.colOfficial || "Typical official / context";
  const bodyHeading = p.bodyHeading || "Rates and how to call";
  const rows = p.rows
    .map(
      (r) => `<tr>
  <td><code>${esc(r.model)}</code></td>
  <td>${esc(r.official)}</td>
  <td class="ok">${esc(r.keyo)}</td>
  <td>${esc(r.note)}</td>
</tr>`
    )
    .join("\n");
  const bodyParas = p.body.map((t) => `<p>${esc(t)}</p>`).join("\n");
  const faqs = p.faqs
    .map(
      (f) =>
        `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`
    )
    .join("\n");
  const defaultModel =
    p.rows.find((r) => !String(r.model).endsWith("-free"))?.model ||
    p.rows[0].model;
  const curlBlock = p.curlExample
    ? `<pre>${esc(p.curlExample)}</pre>`
    : `<pre>curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${esc(defaultModel)}","messages":[{"role":"user","content":"Hello"}]}'</pre>`;
  const bodyHtml = `
<p class="lead">${esc(p.lead)}</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Get API key</a>
  <a class="btn btn-secondary" href="/pricing">Open Model Square</a>
  <a class="btn btn-secondary" href="/pricing-list">Full pricing list</a>
  <a class="btn btn-secondary" href="/free-models">Free models</a>
</div>
<h2>${esc(tableHeading)}</h2>
<p class="meta">Indicative figures for planning. Confirm live Keyo sell rates on interactive <a href="/pricing">Model Square</a> or the static <a href="/pricing-list">pricing list</a>.</p>
<table>
<thead><tr><th>Model ID</th><th>${esc(colOfficial)}</th><th>KeyoAPI</th><th>Notes</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<h2>${esc(p.freeKiller.title)}</h2>
<p>${esc(p.freeKiller.body)}</p>
<h2>${esc(bodyHeading)}</h2>
${bodyParas}
${curlBlock}
<h2>FAQ</h2>
<div class="faq">${faqs}</div>
<p class="meta">Also see <a href="/compare">/compare</a>, <a href="/free-models">/free-models</a>, and model guides under <code>/model/</code>.</p>
`;
  return layout({
    title: p.title,
    description: p.metaDescription,
    canonical,
    h1: p.h1,
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: p.title,
      url: canonical,
      description: p.metaDescription,
    },
  });
}

function writeRobots() {
  const landingAllows = (pricingLandings.pages || [])
    .map((p) => `Allow: /${p.slug}`)
    .join("\n");
  return `User-agent: *
Allow: /
Allow: /compare
Allow: /model/
Allow: /pricing-list
Allow: /free-models
Allow: /models
${landingAllows}
Allow: /brand/
Allow: /about

Sitemap: ${site}/sitemap.xml

# Exact /pricing is Model Square SPA (served with noindex). /pricing/{id} stay blocked.
Disallow: /pricing/
Disallow: /dashboard
Disallow: /console
Disallow: /rankings
Disallow: /sign-in
Disallow: /sign-up
Disallow: /setup
Disallow: /admin
Disallow: /api/
Disallow: /__spa_raw
`;
}

function writeSitemap() {
  const landingUrls = (pricingLandings.pages || []).map((p) => ({
    loc: `${site}/${p.slug}`,
    priority: "0.95",
    changefreq: "weekly",
  }));
  const urls = [
    { loc: `${site}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${site}/compare`, priority: "0.95", changefreq: "weekly" },
    { loc: `${site}/pricing-list`, priority: "0.9", changefreq: "daily" },
    { loc: `${site}/free-models`, priority: "0.95", changefreq: "weekly" },
    { loc: `${site}/models`, priority: "0.85", changefreq: "weekly" },
    ...landingUrls,
    { loc: `${site}/about`, priority: "0.7", changefreq: "monthly" },
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
fs.writeFileSync(path.join(outDir, "models.html"), renderModelsIndex());
fs.writeFileSync(path.join(outDir, "about.html"), renderAbout());
fs.writeFileSync(path.join(outDir, "compare.html"), renderCompare());
fs.writeFileSync(path.join(outDir, "pricing.html"), renderPricing());
fs.writeFileSync(path.join(outDir, "free-models.html"), renderFreeModels());
for (const p of pricingLandings.pages) {
  fs.writeFileSync(path.join(outDir, `${p.slug}.html`), renderPricingLanding(p));
}
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
fs.writeFileSync(
  path.join(root, "scripts/caddy-landing-handles.caddyfragment"),
  caddyLandingHandlesTemplate() + "\n"
);

console.log(
  "Generated",
  5 + pricingLandings.pages.length + pages.models.length,
  "HTML pages + robots.txt + sitemap.xml ->",
  outDir
);
