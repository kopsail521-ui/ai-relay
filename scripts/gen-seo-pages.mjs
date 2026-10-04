/**
 * Generate static SEO pages into static/seo/
 * Source: config/seo/model-pages.json (+ official-price-refs.json)
 * Usage: node scripts/gen-seo-pages.mjs
 *
 * User-facing copy: do not use meta-talk such as "crawlable", "for SEO",
 * "search engines", "this page targets", "search demand", "searches are",
 * "buyers usually want", "How to think about this page", "What this page is not".
 * Prefer crawlable CTAs to /model/{id} when a guide exists; free IDs without a
 * guide go to /free-models. Interactive Model Square (/pricing) stays for humans.
 * Do not globally strip the word "SEO" from use cases (e.g. "SEO rewriting").
 * Also ban in user-facing copy: "search intent", "highest-traffic",
 * "this hub is that landing", "for SEO", "search engines".
 */
import crypto from "crypto";
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
const freeExtra = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/free-models-extra.json"), "utf8")
);
const featuredCfg = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/featured-models.json"), "utf8")
);

/** All fixed-$0 free IDs for hub + pricing-list (B1: one list, no hard-coded count). */
function allFreeModels() {
  const keyo = (freeCfg.models || []).map((m) => ({
    id: m.id,
    family: m.vendor || "Keyo Free",
    twin: m.upstream || String(m.id).replace(/-free$/, ""),
    source: "keyo-free",
  }));
  const extra = (freeExtra.models || []).map((m) => ({
    id: m.id,
    family: m.family || "Other",
    twin: m.twin || null,
    source: "catalog-free",
  }));
  const seen = new Set();
  const out = [];
  for (const m of [...keyo, ...extra]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Crawlable catalog link: guide page > free hub > pricing-list. */
function catalogHref(id) {
  const guideIds = new Set(pages.models.map((m) => m.id));
  if (guideIds.has(id)) return `/model/${encodeURIComponent(id)}`;
  const s = String(id);
  if (s.endsWith(":free") || s.endsWith("-free")) return "/free-models";
  return "/pricing-list";
}

function featuredCardsHtml() {
  return (featuredCfg.models || [])
    .map((f) => {
      const href = catalogHref(f.id);
      return `<a href="${href}"><span class="grid-title">${esc(f.label || f.id)}</span><span class="grid-meta">${esc(f.blurb || "")}</span></a>`;
    })
    .join("\n");
}

function featuredHref(id) {
  return catalogHref(id);
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape then turn site paths into <a href> for crawlable internal links. */
function linkifySitePaths(raw) {
  let s = esc(raw);
  const literals = (pricingLandings.pages || [])
    .map((p) => `/${p.slug}`)
    .concat([
      "/pricing-list",
      "/free-models",
      "/sign-up",
      "/sign-in",
      "/compare",
      "/models",
      "/about",
    ])
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Do not linkify "/pricing" inside foreign paths like openai.com/api/pricing
  const re = new RegExp(
    `(\\/brand\\/blog\\/article\\/[A-Za-z0-9][A-Za-z0-9_-]*\\/?|\\/(?:pricing|model)\\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?|${literals.join("|")}|(?<![A-Za-z0-9./])\\/pricing)(?![A-Za-z0-9_/-])`,
    "g"
  );
  return s.replace(re, (m) => {
    const href = rewritePricingIdPath(m);
    return `<a href="${href}">${href}</a>`;
  });
}

/** Crawlers cannot fetch /pricing/{id} (robots Disallow: /pricing/). */
function rewritePricingIdPath(pathname) {
  const m = String(pathname).match(/^\/pricing\/(.+)$/);
  if (!m) return pathname;
  return catalogHref(decodeURIComponent(m[1]));
}

/** First sentence without breaking on decimals like RMBG-2.0 */
function firstSentence(text) {
  const t = String(text || "").trim();
  const m = t.match(/^[\s\S]+?[.!?](?=\s|$)/);
  return m ? m[0].trim() : t.slice(0, 220).trim();
}

function css() {
  return `
.wrap{max-width:880px;margin:0 auto;padding:28px 24px 48px}
.footer{display:flex;flex-wrap:wrap;gap:10px 16px;max-width:1080px;margin:0 auto;padding:24px 24px 40px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
.footer a{color:var(--ink-2);text-decoration:none}
.footer a:hover{color:var(--ink)}
h1{font-size:clamp(1.7rem,3.1vw,2.35rem);line-height:1.18;letter-spacing:-.035em;margin:0 0 14px;font-weight:600;text-wrap:balance}
h2{font-size:1.15rem;margin:28px 0 10px;letter-spacing:-.02em}
p{margin:0 0 14px;color:var(--ink)}
.lead{font-size:1.02rem;color:var(--ink-2);line-height:1.55;text-wrap:pretty}
.meta{font-size:14px;color:var(--muted);margin:0 0 18px}
.btnrow{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 28px}
.btn,.k-btn{display:inline-block;padding:10px 16px;border-radius:var(--radius);font-weight:600;font-size:14px;text-decoration:none;line-height:1.2}
.btn-primary,.k-btn-primary{background:var(--ink);color:#f6f5f1}
.btn-primary:hover,.k-btn-primary:hover{background:#000;color:#f6f5f1;text-decoration:none}
.btn-secondary,.k-btn-secondary{background:transparent;color:var(--ink);border:1px solid var(--line-strong,#c9c4b8)}
.btn-secondary:hover,.k-btn-secondary:hover{border-color:var(--ink);text-decoration:none}
.btn-link,.k-btn-link{background:transparent;color:var(--link);padding-inline:8px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin:16px 0}
pre,code{font-family:var(--mono)}
pre{background:var(--panel);color:var(--panel-ink);padding:14px 16px;border-radius:var(--radius);overflow:auto;font-size:13px}
pre code{background:transparent;padding:0;color:inherit;font-size:inherit;border-radius:0}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--surface)}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
th{background:color-mix(in srgb,var(--line) 40%,var(--surface));font-weight:600}
.ok{color:var(--ok);font-weight:600}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin:16px 0}
.grid a{display:flex;flex-direction:column;justify-content:center;gap:4px;min-height:4.5rem;padding:12px 14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);color:var(--ink);text-decoration:none;font-weight:500;line-height:1.35}
.grid a:hover{border-color:var(--ink)}
.grid a .grid-title{font-weight:600;overflow-wrap:anywhere}
.grid a .grid-meta{color:var(--muted);font-size:13px;font-weight:500}
.grid a code{font-size:12.5px;background:transparent;padding:0}
ul{margin:0 0 14px;padding-left:1.2em}
.faq details{border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;margin:0 0 10px;background:var(--surface)}
.faq summary{cursor:pointer;font-weight:600}
.surfaces{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:16px 0 8px}
.surf{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;font-size:14px}
.surf h3{font-size:15px;margin:0 0 8px}
.surf ul{margin:0;padding-left:1.15em;color:var(--muted)}
.panel{background:var(--panel);color:var(--panel-ink);border-radius:var(--radius);padding:18px;text-align:left;font-family:var(--mono);font-size:12.5px;overflow:auto;border:1px solid #2a2924}
.panel .label{color:#b9b6ab;margin-bottom:5px;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.panel .label+.label{margin-top:14px}
`.trim();
}

function nav() {
  return `<header class="k-nav">
  <a class="k-wordmark" href="/"><img src="/brand/logo.svg" alt="" width="22" height="22" />KeyoAPI</a>
  <nav aria-label="Primary">
    <a href="/pricing">Pricing</a>
    <a href="/models">Models</a>
    <a href="/compare">Compare</a>
    <a href="/brand/keyo-docs.html">Docs</a>
    <a href="/brand/faq.html">FAQ</a>
    <a href="/console">Console</a>
    <a href="/sign-in">Sign in</a>
    <a class="k-nav-cta" href="/sign-up">Get started</a>
  </nav>
</header>`;
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
  <a href="/pricing">Pricing</a>
  <a href="/pricing-list">Pricing list</a>
  <a href="/models">Model guides</a>
  <a href="/compare">Compare</a>
  <a href="/free-models">Free models</a>
${landingLinks}
  <a href="/brand/keyo-docs.html">Docs</a>
  <a href="/brand/faq.html">FAQ</a>
  <a href="/brand/privacy.html">Privacy</a>
  <a href="/brand/terms.html">Terms</a>
  <a href="/sign-in">Sign in</a>
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
<meta property="og:image" content="${site}/brand/logo.svg" />
<link rel="icon" href="/brand/logo.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/brand/keyo-theme.css" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${css()}</style>
</head>
<body>
${nav()}
<main class="wrap">
<h1>${esc(h1)}</h1>
${bodyHtml}
</main>
${footer()}
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
  <td><a href="${featuredHref(r.keyo_model)}">${esc(r.keyo_model)}</a><br/><span class="ok">${esc(r.keyo_price)}</span></td>
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
    .map((p) => `<p>${linkifySitePaths(p)}</p>`)
    .join("\n");
  const faqs = m.faqs
    .map(
      (f) =>
        `<details><summary>${esc(f.q)}</summary><p>${linkifySitePaths(f.a)}</p></details>`
    )
    .join("\n");
  const curl = m.curlExample || "";
  const bodyHtml = `
<p class="lead">${linkifySitePaths(lead)}</p>
<p class="meta">Listed price: <span class="ok">${esc(m.priceLabel)}</span> · Live catalog: <a href="/pricing">Model Square</a> · Static list: <a href="/pricing-list">pricing list</a>.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Get API key</a>
  <a class="btn btn-secondary" href="/pricing">Open Model Square</a>
  <a class="btn btn-secondary" href="/compare">Compare API prices</a>
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
<p class="meta">Guide for <strong>${esc(m.id)}</strong>. Catalog: <a href="/pricing">/pricing</a> · Rates: <a href="/pricing-list">/pricing-list</a>.</p>
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
  const title =
    "KeyoAPI — One Key for Chat, Speech, OCR & Digital Humans";
  const description =
    "One prepaid key for GPT-class chat, Whisper, TTS, OCR, vision tools, and talking-avatar / video models. Chat, image and speech paths are OpenAI-compatible; OCR, CV and digital-human use dedicated REST — same balance.";
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
  <td><a href="${featuredHref(r.keyo_model)}">${esc(r.keyo_model)}</a><br/><span class="ok">${esc(r.keyo_price)}</span></td>
  <td>${esc(r.note)}</td>
</tr>`
    )
    .join("\n");
  const featured = featuredCardsHtml();
  const freeAll = allFreeModels();
  const freeCards = freeAll
    .slice(0, 12)
    .map(
      (m) =>
        `<a href="/free-models"><span class="grid-title"><code>${esc(m.id)}</code></span><span class="grid-meta">$0</span></a>`
    )
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
<meta property="og:image" content="${site}/brand/logo.svg" />
<link rel="icon" href="/brand/logo.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/brand/keyo-theme.css" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(twitterDescription)}" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "KeyoAPI",
    url: site,
    description:
      "Prepaid AI API gateway: OpenAI-compatible chat/image/speech plus dedicated REST for OCR, vision, TTS and digital humans — one key, one balance.",
    applicationCategory: "DeveloperApplication",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  })}</script>
<style>${css()}
.hero{max-width:1080px;margin:0 auto;padding:48px 24px 8px}
.inner{display:grid;grid-template-columns:minmax(0,1.28fr) minmax(280px,.78fr);gap:36px 40px;align-items:stretch;max-width:none;width:100%}
.inner>div:first-child{display:flex;flex-direction:column;justify-content:center;min-width:0}
.hero h1{font-size:clamp(1.7rem,3.1vw,2.35rem);line-height:1.18;letter-spacing:-.035em;margin:0 0 12px;font-weight:600;text-align:left;text-wrap:balance}
.hero .sub{font-size:clamp(.95rem,1.35vw,1.02rem);color:var(--ink-2);margin:0 0 22px;max-width:none;line-height:1.55;text-align:left;text-wrap:pretty}
.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0}
.btn{border-radius:var(--radius)}
.btn-secondary{background:transparent}
.panel{font-family:var(--mono);border-radius:var(--radius);border:1px solid #2a2924;margin:0}
.surfaces{margin-top:8px}
.surfaces .surf{background:var(--surface)}
.surf code{font-family:var(--mono)}
.content{max-width:1080px;margin:0 auto;padding:36px 24px 56px}
.content > h2:first-child{margin-top:0}
.grid a{border-radius:var(--radius);background:var(--surface)}
.grid a:hover{border-color:var(--ink)}
pre{background:var(--panel);color:var(--panel-ink);border-radius:var(--radius);font-family:var(--mono)}
.foot{max-width:1080px;margin:0 auto;padding:24px 24px 40px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
.frow{display:flex;flex-wrap:wrap;gap:10px 14px;margin-bottom:12px}
.compare-jump{margin:8px 0 28px}
@media (max-width:820px){.inner{grid-template-columns:1fr;gap:28px}.hero{padding:28px 20px 8px}.content{padding:24px 20px 48px}}
</style>
</head>
<body>
${nav()}
<section class="hero">
  <div class="inner">
    <div>
      <h1>One key for chat, speech, OCR &amp; digital humans</h1>
      <p class="sub">OpenAI-compatible chat, image and speech — plus OCR, TTS and talking-avatar APIs on the same prepaid balance.</p>
      <div class="actions">
        <a class="btn btn-primary" href="/sign-up">Start free — get API key</a>
        <a class="btn btn-secondary" href="/brand/keyo-docs.html">Docs</a>
        <a class="btn btn-secondary" href="/pricing">Browse Models</a>
      </div>
    </div>
    <div class="panel">
      <div class="label">Base URL</div>
      <div>https://www.keyoapi.xyz/v1</div>
      <div class="label">Example (OpenAI-compatible chat)</div>
      <div>POST /v1/chat/completions &nbsp;·&nbsp; model=gpt-6-astra</div>
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
<p class="compare-jump"><a href="/compare">See the full comparison page →</a></p>
<h2>Free models — $0 (fair-use)</h2>
<p class="meta">Fixed $0 catalog IDs for prototyping. Full list + rules: <a href="/free-models">/free-models</a>.</p>
<div class="grid">
${freeCards}
</div>
<p class="meta"><a href="/free-models">See all free model IDs →</a></p>
<h2>Featured models</h2>
<div class="grid">
${featured}
</div>
<p class="meta">Compare in depth: ${landingDeepDiveHtml()} · <a href="/models">all model guides</a></p>
<h2>Integrate in minutes</h2>
<pre><code>export OPENAI_BASE_URL=https://www.keyoapi.xyz/v1
export OPENAI_API_KEY=sk-...
# chat (OpenAI SDK): model=gpt-6-astra | claude-fable-5-1 | deepseek-v4.1-flash
# free: model=glm-5.3-flash:free | Atria-dawn-v2 (see /free-models)
# speech / vision / video: IndexTTS-2 · sam3 · RMBG-2.0 · MiniMax-H3 — see Docs</code></pre>
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
        `<tr><td><a href="/model/${encodeURIComponent(m.id)}"><code>${esc(m.id)}</code></a></td><td>${esc(m.category || "")}</td><td class="ok">${esc(m.priceLabel)}</td><td><a href="/model/${encodeURIComponent(m.id)}">Guide</a> · <a href="/pricing">Catalog</a></td></tr>`
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
  const freeCards = allFreeModels()
    .slice(0, 12)
    .map(
      (m) =>
        `<a href="/free-models"><span class="grid-title"><code>${esc(m.id)}</code></span><span class="grid-meta">$0</span></a>`
    )
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
  <li><strong>A free tier:</strong> fixed <code>$0</code> model IDs for prototyping (fair-use limits apply — see <a href="/free-models">/free-models</a>).</li>
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
<h2>Free models at $0</h2>
<p>Call a free ID from the catalog at <strong>$0</strong> with fair-use limits. Metered twins stay available for production. Rules: <a href="/free-models">/free-models</a></p>
<div class="grid">
${freeCards}
</div>
<h2>Model categories</h2>
<div class="grid">
  <a href="/model/gpt-5.6-terra">GPT-class chat</a>
  <a href="/model/claude-sonnet-5">Claude-class reasoning</a>
  <a href="/model/deepseek-v4-pro-0813">DeepSeek open models</a>
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
    title: "About KeyoAPI — One Key for Chat, Speech, OCR & Digital Humans",
    description:
      "KeyoAPI is an AI API relay: chat, image and speech are OpenAI-compatible; OCR, vision, TTS-async and digital-human models use dedicated REST paths — same key, same prepaid balance, with fixed $0 free model IDs.",
    canonical: `${site}/about`,
    h1: "One key for chat, speech, OCR & digital humans",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About KeyoAPI",
      url: `${site}/about`,
      description:
        "About KeyoAPI — prepaid AI API gateway with OpenAI-compatible chat/image/speech and dedicated REST for OCR, vision and avatars.",
    },
  });
}

function renderCompare() {
  const llmRows = pages.models
    .filter((m) => m.category === "llm")
    .map(
      (m) =>
        `<tr><td><a href="/model/${encodeURIComponent(m.id)}">${esc(m.id)}</a></td><td>${esc(m.priceLabel)}</td><td><a href="/model/${encodeURIComponent(m.id)}">Guide</a></td></tr>`
    )
    .join("\n");
  const bodyHtml = `
<p class="lead">This <strong>LLM API pricing comparison</strong> (and broader <strong>AI API price comparison</strong>) page puts KeyoAPI sell rates next to typical official list bands for GPT-class, Claude-class, DeepSeek, Whisper, and vision APIs — useful when you want one prepaid key without juggling five vendor invoices.</p>
<p class="meta">Figures are indicative for planning. Always confirm live sell rates in <a href="/pricing">Model Square</a> or the static <a href="/pricing-list">pricing list</a> before contracting volume.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Create KeyoAPI account</a>
  <a class="btn btn-secondary" href="/pricing-list">Open pricing list</a>
  <a class="btn btn-secondary" href="/openai-api-alternative">OpenAI API alternative</a>
</div>
<h2>Headline LLM API pricing comparison</h2>
<table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI model</th><th>Notes</th></tr></thead>
<tbody>${compareTableRows()}</tbody>
</table>
<h2>Keyo LLM token rates (batch)</h2>
<table>
<thead><tr><th>Model</th><th>Listed Keyo price</th><th>Interactive page</th></tr></thead>
<tbody>${llmRows}</tbody>
</table>
<h2>How to estimate API costs (no calculator app required)</h2>
<p>For token-metered chat IDs: expected cost ≈ (input millions × input $/1M) + (output millions × output $/1M), then add retries. Pull the $/1M figures from live <a href="/pricing">/pricing</a> or the rows on this page — do not hard-code a spreadsheet forever. Worked OpenAI-side example: <a href="/openai-api-pricing">/openai-api-pricing</a>. Brand hubs: <a href="/claude-api-pricing">Claude / Anthropic</a>, <a href="/grok-api-pricing">Grok</a>, <a href="/gemini-api-pricing">Gemini</a>, <a href="/deepseek-api-pricing">DeepSeek</a>.</p>
<h2>How to use this comparison</h2>
<p>One OpenAI-compatible SDK, one prepaid balance, and multimodal add-ons on one invoice. Swap <code>base_url</code> + key; keep your existing client for chat / image / speech paths.</p>
<p>Recommended rollout: start with <a href="${featuredHref("deepseek-v4.1-flash")}"><code>deepseek-v4.1-flash</code></a> on high-volume paths, <a href="${featuredHref("gpt-6-astra")}"><code>gpt-6-astra</code></a> or <a href="/model/claude-sonnet-5">claude-sonnet-5</a> as default chat, escalate to <a href="/model/claude-fable-5-1">claude-fable-5-1</a> when you need denser reasoning.</p>
<h2>Related guides</h2>
<ul>
  <li><a href="/openai-api-alternative"><strong>OpenAI API alternative</strong></a> — why switch, two-line migration, price table</li>
  <li><a href="/openai-api-pricing">OpenAI / ChatGPT API pricing</a> · <a href="/claude-api-pricing">Claude API pricing</a> · <a href="/deepseek-api-pricing">DeepSeek API pricing</a></li>
  <li><a href="/free-models">Free AI API</a> — fixed $0 catalog IDs for prototyping</li>
  <li><a href="/model/CosyVoice3">CosyVoice3 API</a> · <a href="/tts-api">Text to Speech API</a> · <a href="/model/Duix-Avatar">Duix Avatar</a></li>
</ul>
<h2>Modality pages</h2>
${relatedLinks(["CosyVoice3", "whisper-large-v3", "Qwen3-TTS", "IndexTTS-2", "Duix-Avatar", "RMBG-2.0"])}
`;
  return layout({
    title: "LLM API Pricing Comparison | KeyoAPI",
    description:
      "LLM API pricing comparison and AI API price comparison: KeyoAPI vs typical official list rates for GPT-class, Claude, DeepSeek, and multimodal IDs on one prepaid key.",
    canonical: `${site}/compare`,
    h1: "LLM API Pricing Comparison: KeyoAPI vs Official List Rates",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "LLM API Pricing Comparison",
      url: `${site}/compare`,
      description:
        "Compare KeyoAPI LLM and multimodal API prices with typical official list rates.",
    },
  });
}

function renderPricing() {
  const freeRows = allFreeModels()
    .map(
      (m) => `<tr>
  <td><a href="/free-models"><code>${esc(m.id)}</code></a></td>
  <td>free</td>
  <td class="ok">$0</td>
  <td><code>POST /v1/chat/completions</code></td>
  <td><a href="/free-models">Free hub</a> · <a href="/sign-up">Get key</a></td>
</tr>`
    )
    .join("\n");
  const seenIds = new Set(pages.models.map((m) => m.id));
  const landingExtra = [];
  for (const p of pricingLandings.pages || []) {
    for (const r of p.rows || []) {
      const id = r.model;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      landingExtra.push({
        id,
        category: "llm",
        priceLabel: r.keyo,
        endpoint: "POST /v1/chat/completions",
        guide: false,
      });
    }
  }
  const rows = [...pages.models, ...landingExtra]
    .map((m) => {
      const guide = m.guide === false
        ? `<a href="/pricing-list">List</a>`
        : `<a href="/model/${encodeURIComponent(m.id)}">Guide</a>`;
      const modelHref = catalogHref(m.id);
      return `<tr>
  <td><a href="${modelHref}"><code>${esc(m.id)}</code></a></td>
  <td>${esc(m.category)}</td>
  <td class="ok">${esc(m.priceLabel)}</td>
  <td><code>${esc(m.endpoint)}</code></td>
  <td>${guide} · <a href="/pricing">Catalog</a></td>
</tr>`;
    })
    .join("\n");
  const bodyHtml = `
<p class="lead">Static <strong>AI API pricing</strong> list for KeyoAPI — model IDs, indicative USD rates, and real endpoints. Use this page to compare rates; open Model Square when you are ready to generate keys.</p>
<p class="meta">Rates below are catalog snapshots for planning. Wallet top-up and live sell prices are confirmed in the console after <a href="/sign-up">sign-up</a>.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Create account</a>
  <a class="btn btn-secondary" href="/pricing">Open Model Square</a>
  <a class="btn btn-secondary" href="/compare">AI API price comparison</a>
  <a class="btn btn-secondary" href="/brand/keyo-docs.html">Docs</a>
</div>
<h2>Free models ($0, fair-use)</h2>
<p class="meta">Fixed $0 catalog IDs. Rules and curl examples: <a href="/free-models">/free-models</a>.</p>
<table>
<thead><tr><th>Model ID</th><th>Category</th><th>Listed price</th><th>Endpoint</th><th>Links</th></tr></thead>
<tbody>${freeRows}</tbody>
</table>
<h2>Guided model price table</h2>
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
<p>Open interactive catalog at <a href="/pricing">/pricing</a> after login. Model explainers are at <code>/model/{modelId}</code>.</p>
`;
  return layout({
    title: "AI API Pricing List - KeyoAPI Models & Rates",
    description:
      "KeyoAPI pricing list: free $0 models plus GPT-class, Claude-class, Whisper, OCR, vision, TTS model IDs with indicative USD rates.",
    canonical: `${site}/pricing-list`,
    h1: "AI API Pricing List: Models, Rates & Endpoints",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "KeyoAPI Pricing List",
      url: `${site}/pricing-list`,
      description:
        "Static pricing table for KeyoAPI multimodal and chat models on one prepaid key.",
    },
  });
}

function renderFreeModels() {
  const freeAll = allFreeModels();
  const rows = freeAll
    .map((m) => {
      const twinCell = m.twin
        ? `<a href="${featuredHref(m.twin)}"><code>${esc(m.twin)}</code></a>`
        : "—";
      return `<tr>
  <td><code>${esc(m.id)}</code></td>
  <td>${twinCell}</td>
  <td class="ok">$0</td>
  <td>${esc(m.family || "—")}</td>
  <td><a href="/sign-up">Get key</a></td>
</tr>`;
    })
    .join("\n");
  const exampleFree =
    freeAll.find((m) => m.id.includes("flash") && m.id.includes("free"))?.id ||
    freeAll.find((m) => m.id.endsWith("-free"))?.id ||
    freeAll[0]?.id ||
    "glm-5.3-flash:free";
  const bodyHtml = `
<p class="lead">KeyoAPI publishes a <strong>free AI API</strong> catalog: fixed <strong>$0</strong> model IDs, no credit card to start, fair-use limits. Register a key and set <code>model</code> to any ID in the table below.</p>
<p class="meta">Built for prototypes, demos, CI smoke tests, and eval harnesses. For production QPS, switch to metered (paid) model IDs on the same base URL.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Get a free API key</a>
  <a class="btn btn-secondary" href="/pricing-list">Full pricing list</a>
  <a class="btn btn-secondary" href="/brand/keyo-docs.html">Docs</a>
</div>
<h2>A free API key, no credit card</h2>
<p>Create an account, mint a key, point <code>OPENAI_BASE_URL</code> to <code>https://www.keyoapi.xyz/v1</code>, and call chat completions with a free <code>model</code> ID. That is the whole free API key path.</p>
<h2>Free models ($0)</h2>
<table>
<thead><tr><th>Free model ID</th><th>Paid twin (if any)</th><th>Price</th><th>Family</th><th>Links</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p>Call the free ID exactly as listed (including <code>-free</code> or <code>:free</code> suffixes). Free catalog membership can change — confirm live availability on <a href="/pricing">/pricing</a>.</p>
<h2>Free by family</h2>
<p>Browse by family in the table above (${[...new Set(freeAll.map((m) => m.family).filter(Boolean))].join(", ") || "listed vendors"}). Start with a free API key and a fixed $0 model ID; move to metered IDs when you outgrow fair-use limits.</p>
<h2>Quick start (curl)</h2>
<pre>curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${esc(exampleFree)}",
    "messages": [{"role":"user","content":"Hello"}]
  }'</pre>
<h2>Free rules (read before you ship)</h2>
<ul>
  <li><strong>Price:</strong> listed free IDs use fixed <strong>$0</strong> ModelPrice — not a timed coupon that flips to paid overnight.</li>
  <li><strong>Fair use:</strong> free traffic has <strong>rate / concurrency limits</strong>. Limits can tighten under abuse. Do not treat free IDs as an unlimited production SLA.</li>
  <li><strong>Availability:</strong> some <code>:free</code> IDs may be added or removed from the free catalog. Check <a href="/pricing">Model Square</a> before hard-coding.</li>
  <li><strong>Catch (honest):</strong> you get real capability at $0; you do <em>not</em> get paid-tier priority or guaranteed throughput.</li>
</ul>
<div class="faq">
<h2>FAQ</h2>
<details open>
  <summary>Is it really free?</summary>
  <p>Yes for the <code>$0</code> IDs listed above: no credit card required to start. Create an account, mint an API key, and set <code>model</code> to a free ID.</p>
</details>
<details>
  <summary>What's the catch?</summary>
  <p>Fair-use rate limiting and lower priority. Exact RPM can change; if you need predictable limits, use metered (paid) IDs.</p>
</details>
<details>
  <summary>Free vs paid?</summary>
  <p>Free IDs are $0 with fair-use limits. Paid IDs are token- or request-metered with higher priority — preferred for production.</p>
</details>
<details>
  <summary>Can I use it in production?</summary>
  <p>You can. For anything user-facing or latency-sensitive, we recommend metered IDs. Free is ideal for prototypes, demos, CI smoke tests, and eval harnesses.</p>
</details>
<details>
  <summary>Why one hub page?</summary>
  <p>One page keeps every free ID and its limits in one place — bookmark it; we update it when the free catalog changes.</p>
</details>
</div>
<h2>When you outgrow free IDs</h2>
<p>Same key, switch <code>model=</code> only:</p>
<ul>
  <li><a href="/model/CosyVoice3"><strong>CosyVoice3 API</strong></a> — hosted async TTS when scripts leave the free chat tier</li>
  <li><a href="/tts-api">TTS API hub</a> · <a href="/voice-cloning-api">Voice cloning</a> · <a href="/model/IndexTTS-2">IndexTTS-2</a></li>
  <li><a href="/model/deepseek-v4-flash"><strong>DeepSeek V4 Flash free / pricing</strong></a> — metered Flash after $0 prototypes</li>
  <li><a href="/model/kimi-k3"><strong>Kimi K3 API key (free path)</strong></a> — draft on free IDs, then <code>kimi-k3</code></li>
  <li><a href="/model/Duix-Avatar"><strong>Duix Avatar API</strong></a> — talking-face after TTS · <a href="/compare">Compare rates</a></li>
</ul>
<p class="meta">Also see the interactive catalog on <a href="/pricing">/pricing</a> (filter Free) and the OpenAI-compatible docs.</p>
`;
  return layout({
    title: "Free AI API — $0 Models, No Credit Card | KeyoAPI",
    description:
      "Free AI API / free LLM API on KeyoAPI: fixed $0 model IDs, no credit card. Fair-use limits. Get a free API key and call OpenAI-compatible chat completions.",
    canonical: `${site}/free-models`,
    h1: "Free AI API — $0 Models, No Credit Card",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Free AI API — KeyoAPI",
      url: `${site}/free-models`,
      description:
        "Fixed $0 free LLM API models on KeyoAPI with OpenAI-compatible chat completions.",
    },
  });
}

/** Brand-aware related links — avoid one TTS boilerplate on every LLM hub. */
function landingRelatedLinks(slug) {
  const base =
    '<a href="/compare">/compare</a>, <a href="/free-models">/free-models</a>, <a href="/pricing-list">/pricing-list</a>';
  const bySlug = {
    "tts-api":
      `${base}, and <a href="/model/CosyVoice3">CosyVoice3 API</a> · <a href="/voice-cloning-api">Voice cloning</a> · <a href="/model/IndexTTS-2">IndexTTS-2</a>`,
    "voice-cloning-api":
      `${base}, and <a href="/tts-api">Text to Speech</a> · <a href="/model/CosyVoice3">CosyVoice3</a> · <a href="/model/Qwen3-TTS">Qwen3-TTS</a>`,
    "ai-avatar-video-generator":
      `${base}, and <a href="/model/Duix-Avatar">Duix Avatar</a> · <a href="/model/InfiniteTalk">InfiniteTalk</a> · <a href="/tts-api">Text to Speech</a>`,
    "remove-bg-api-alternative":
      `${base}, and <a href="/model/RMBG-2.0">RMBG-2.0</a> · <a href="/model/sam3">sam3</a>`,
    "gemini-api-pricing":
      `${base}, and <a href="/model/gemini-3.8-flash">gemini-3.8-flash</a> · <a href="/model/gemini-3.7-flash">gemini-3.7-flash</a>`,
    "grok-api-pricing":
      `${base}, and <a href="/model/grok-4.7">grok-4.7</a> · <a href="/model/grok-4.6">grok-4.6</a>`,
    "deepseek-api-pricing":
      `${base}, and <a href="/model/deepseek-v4.1-flash">deepseek-v4.1-flash</a> · <a href="/model/deepseek-v4-pro-0813">deepseek-v4-pro-0813</a>`,
    "claude-api-pricing":
      `${base}, and <a href="/model/claude-sonnet-5">claude-sonnet-5</a> · <a href="/model/claude-opus-5">claude-opus-5</a>`,
    "openai-api-pricing":
      `${base}, and <a href="/model/gpt-6-astra">gpt-6-astra</a> · <a href="/model/gpt-5.6-luna">gpt-5.6-luna</a> · <a href="/openai-api-alternative">OpenAI API alternative</a>`,
    "openai-api-alternative":
      `${base}, and <a href="/openai-api-pricing">OpenAI API pricing</a> · <a href="/model/gpt-6-astra">gpt-6-astra</a> · <a href="/model/deepseek-v4.1-flash">deepseek-v4.1-flash</a>`,
  };
  const links = bySlug[slug] || `${base}, and <a href="/tts-api">TTS API</a> · <a href="/ai-avatar-video-generator">Avatar video</a>`;
  return `<p class="meta">Also see ${links}.</p>`;
}

function renderPricingLanding(p) {
  const canonical = `${site}/${p.slug}`;
  const tableHeading = p.tableHeading || "Price comparison table";
  const colOfficial = p.colOfficial || "Typical official / context";
  const bodyHeading = p.bodyHeading || "Rates and how to call";
  const rows = p.rows
    .map(
      (r) => `<tr>
  <td><a href="${catalogHref(r.model)}"><code>${esc(r.model)}</code></a></td>
  <td>${linkifySitePaths(r.official)}</td>
  <td class="ok">${esc(r.keyo)}</td>
  <td>${linkifySitePaths(r.note)}</td>
</tr>`
    )
    .join("\n");
  const bodyParas = p.body
    .map((t) => `<p>${linkifySitePaths(t)}</p>`)
    .join("\n");
  const faqs = p.faqs
    .map(
      (f) =>
        `<details><summary>${esc(f.q)}</summary><p>${linkifySitePaths(f.a)}</p></details>`
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
<p class="lead">${linkifySitePaths(p.lead)}</p>
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
<p>${linkifySitePaths(p.freeKiller.body)}</p>
<h2>${esc(bodyHeading)}</h2>
${bodyParas}
${curlBlock}
<h2>FAQ</h2>
<div class="faq">${faqs}</div>
${landingRelatedLinks(p.slug)}
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
Sitemap: ${site}/brand/blog/sitemap.txt

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
# SPA i18n shells (en/zh/ja/…): not translated landing pages — do not index.
Disallow: /en
Disallow: /zh
Disallow: /zh-CN
Disallow: /zh-TW
Disallow: /ja
Disallow: /ko
Disallow: /fr
Disallow: /ru
Disallow: /vi
`;
}

function fileLastmod(absPath) {
  try {
    return fs.statSync(absPath).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function contentHash(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex").slice(0, 16);
}

/** Keep lastmod stable across regenerations unless page content hash changes. */
function stableLastmod(cache, loc, filePath) {
  const today = new Date().toISOString().slice(0, 10);
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    raw = loc;
  }
  const hash = contentHash(raw);
  const prev = cache.entries[loc];
  if (prev && prev.hash === hash && prev.lastmod) {
    return prev.lastmod;
  }
  const lastmod =
    prev?.hash && prev.hash !== hash
      ? today
      : prev?.lastmod || fileLastmod(filePath) || today;
  cache.entries[loc] = { hash, lastmod };
  return lastmod;
}

function writeSitemap() {
  const cachePath = path.join(root, "config/seo/sitemap-lastmod.json");
  let cache = { _note: "lastmod bumps only when page content hash changes.", entries: {} };
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (!cache.entries || typeof cache.entries !== "object") cache.entries = {};
  } catch {
    /* first run */
  }

  const landingUrls = (pricingLandings.pages || []).map((p) => ({
    loc: `${site}/${p.slug}`,
    file: path.join(outDir, `${p.slug}.html`),
    priority: "0.95",
    changefreq: "weekly",
  }));
  const urls = [
    {
      loc: `${site}/`,
      file: path.join(outDir, "index.html"),
      priority: "1.0",
      changefreq: "weekly",
    },
    {
      loc: `${site}/compare`,
      file: path.join(outDir, "compare.html"),
      priority: "0.95",
      changefreq: "weekly",
    },
    {
      loc: `${site}/pricing-list`,
      file: path.join(outDir, "pricing.html"),
      priority: "0.9",
      changefreq: "daily",
    },
    {
      loc: `${site}/free-models`,
      file: path.join(outDir, "free-models.html"),
      priority: "0.95",
      changefreq: "weekly",
    },
    {
      loc: `${site}/models`,
      file: path.join(outDir, "models.html"),
      priority: "0.85",
      changefreq: "weekly",
    },
    ...landingUrls,
    {
      loc: `${site}/about`,
      file: path.join(outDir, "about.html"),
      priority: "0.7",
      changefreq: "monthly",
    },
    ...pages.models.map((m) => ({
      loc: `${site}/model/${encodeURIComponent(m.id)}`,
      file: path.join(outDir, "model", `${m.id}.html`),
      priority: "0.9",
      changefreq: "weekly",
    })),
    {
      loc: `${site}/brand/keyo-docs.html`,
      file: path.join(root, "static/brand/keyo-docs.html"),
      priority: "0.5",
      changefreq: "monthly",
    },
    {
      loc: `${site}/brand/faq.html`,
      file: path.join(root, "static/brand/faq.html"),
      priority: "0.4",
      changefreq: "monthly",
    },
    {
      loc: `${site}/brand/privacy.html`,
      file: path.join(root, "static/brand/privacy.html"),
      priority: "0.2",
      changefreq: "yearly",
    },
    {
      loc: `${site}/brand/terms.html`,
      file: path.join(root, "static/brand/terms.html"),
      priority: "0.2",
      changefreq: "yearly",
    },
  ];
  const body = urls
    .map((u) => {
      const lastmod = stableLastmod(cache, u.loc, u.file);
      return `  <url><loc>${u.loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`;
    })
    .join("\n");
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
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
