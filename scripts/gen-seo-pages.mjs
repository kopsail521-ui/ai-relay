/**
 * Generate static SEO pages into static/seo/
 * Source: config/seo/model-pages.json (+ official-price-refs.json)
 * Usage: node scripts/gen-seo-pages.mjs
 * Selected HTML only: node scripts/gen-seo-pages.mjs --pages=models,model/gpt-6.1-sol
 * Selected runs also refresh sitemap, robots and Caddy fragments.
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

/**
 * Hand-maintained model pages (outside config) that still need to appear in the
 * models index, pricing-list Guide rows, and sitemap. Regeneration must NOT
 * overwrite these files — the generation loop skips HAND_MAINTAINED_GUIDES.
 * Keep this metadata in sync with the live page content.
 */
const HAND_MAINTAINED_META = [
  {
    id: "eleven-v4",
    category: "speech",
    priceLabel: "$80 / 1M characters",
    endpoint: "POST /v1/audio/speech",
  },
  {
    id: "eleven-v4-turbo",
    category: "speech",
    priceLabel: "$40 / 1M characters",
    endpoint: "POST /v1/audio/speech",
  },
  {
    id: "gemini-3.8-flash-tts",
    category: "speech",
    priceLabel: "~$0.44 / $8.82 per 1M in/out",
    endpoint: "POST /v1beta/models/gemini-3.8-flash-tts:generateContent",
  },
];
pages.models = [...pages.models, ...HAND_MAINTAINED_META];
const priceRefs = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/official-price-refs.json"), "utf8")
);
const pricingLandings = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/pricing-landings.json"), "utf8")
);
const contentLandings = JSON.parse(
  fs.readFileSync(path.join(root, "config/seo/content-landings.json"), "utf8")
);
/** model ID -> landing slug (first landing page that lists the model) */
const landingByModel = new Map();
for (const p of [...pricingLandings.pages, ...contentLandings.pages]) {
  for (const r of p.rows || []) {
    if (r.model && !landingByModel.has(r.model)) landingByModel.set(r.model, p.slug);
  }
}
const selectedPages = new Set(
  process.argv.slice(2).flatMap((arg) => {
    if (!arg.startsWith("--pages=")) throw new Error(`Unknown argument: ${arg}`);
    const keys = arg.slice("--pages=".length).split(",");
    if (keys.some((key) => !key.trim())) {
      throw new Error("Page selection must contain non-empty page keys");
    }
    return keys;
  })
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

/** All gift-credit IDs for hub + pricing-list (B1: one list, no hard-coded count). */
function allFreeModels() {
  const keyo = (freeCfg.models || []).map((m) => ({
    id: m.id,
    family: m.vendor || "Keyo Gift Credit",
    twin: m.upstream || String(m.id).replace(/:free$/, ""),
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

/** Free IDs use the ":free" suffix (new-api FreeModelTwin convention). */
function isFreeId(id) {
  return String(id).endsWith(":free");
}

/** Crawlable catalog link: guide page > free hub > pricing-list. */
/** Hand-maintained model pages outside config (regeneration does not cover them). */
const HAND_MAINTAINED_GUIDES = new Set([
  "eleven-v4",
  "eleven-v4-turbo",
  "gemini-3.8-flash-tts",
  "gemini-3.1-flash-tts-preview",
  "suno_music_open",
  "deepseek-v4-pro",
  "gemini-embedding-2-preview",
]);

function catalogHref(id) {
  const guide = pages.models.find((m) => m.id === id || m.modelId === id);
  if (guide) return `/model/${encodeURIComponent(guide.id)}`;
  if (HAND_MAINTAINED_GUIDES.has(id)) return `/model/${encodeURIComponent(id)}`;
  if (isFreeId(id)) return "/free-models";
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
  const literals = [...pricingLandings.pages, ...contentLandings.pages]
    .map((p) => `/${p.slug}`)
    .concat([
      "/pricing-list",
      "/free-models",
      "/brand/keyo-api-ref.html",
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
    return `<a href="${href}">${esc(pathLabel(href))}</a>`;
  });
}

/** Natural-word anchor text for internal links (never the bare path). */
function pathLabel(href) {
  const fixed = {
    "/pricing": "the pricing page",
    "/pricing-list": "the full pricing list",
    "/models": "the model guides page",
    "/free-models": "the gift-credit models page",
    "/compare": "the model comparison page",
    "/brand/keyo-api-ref.html": "the API endpoint reference",
    "/sign-up": "the sign-up page",
    "/sign-in": "the sign-in page",
    "/about": "the about page",
  };
  if (fixed[href]) return fixed[href];
  let m = href.match(/^\/model\/([^/]+)$/);
  if (m) return `the ${m[1]} model page`;
  m = href.match(/^\/brand\/blog\/article\/[^/]+\/?$/);
  if (m) return "our blog guide";
  for (const p of pricingLandings.pages || []) {
    if (href === `/${p.slug}`) return landingPathLabel(p.slug);
  }
  const contentPage = contentLandings.pages.find((p) => href === `/${p.slug}`);
  if (contentPage) return contentPage.h1;
  return href;
}

function landingPathLabel(slug) {
  const labels = {
    "gemini-api-pricing": "the Gemini API pricing page",
    "deepseek-api-pricing": "the DeepSeek API pricing page",
    "glm-api-pricing": "the GLM API pricing page",
    "claude-api-pricing": "the Claude API pricing page",
    "openai-api-pricing": "the OpenAI API pricing page",
    "grok-api-pricing": "the Grok API pricing page",
    "remove-bg-api-alternative": "the Remove.bg alternative guide",
    "openai-api-alternative": "the OpenAI API alternative guide",
    "tts-api": "the TTS API guide",
    "voice-cloning-api": "the voice cloning API guide",
    "ai-avatar-video-generator": "the AI avatar video generator page",
  };
  return labels[slug] || `the ${slug.replace(/-/g, " ")} page`;
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
.table-scroll{overflow-x:auto;margin:16px 0}
.table-scroll table{min-width:620px}
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
    <a href="/brand/blog/">Blog</a>
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
  <a href="/brand/blog/">Blog</a>
${landingLinks}
  <a href="/brand/keyo-docs.html">Docs</a>
  <a href="/brand/faq.html">FAQ</a>
  <a href="/brand/privacy.html">Privacy</a>
  <a href="/brand/terms.html">Terms</a>
  <a href="/sign-in">Sign in</a>
  <a href="https://toolfame.com/item/keyoapi" target="_blank" rel="noopener noreferrer"><img src="https://toolfame.com/badge-light.svg" alt="Featured on ToolFame.com" width="160" height="54" loading="lazy" style="height:54px;width:auto;" /></a>
  <a href="https://yo.directory" target="_blank" rel="dofollow noopener">Featured on Yo.directory</a>
  <a href="https://www.toolpilot.ai" target="_blank" rel="dofollow noopener">Featured on ToolPilot.ai</a>
  <a href="https://dang.ai" target="_blank" rel="dofollow noopener"><img src="https://assets.dang.ai/badges/dang-verified-dark.png" alt="Verified on DANG!" width="550" height="198" loading="lazy" style="height:54px;width:auto;border:0;outline:none;text-decoration:none;" /></a>
  <a href="https://fazier.com" target="_blank" rel="dofollow noopener">Featured on Fazier</a>
  <a href="https://twelve.tools" target="_blank" rel="dofollow noopener"><img src="https://twelve.tools/badge0-white.svg" alt="Featured on Twelve Tools" width="200" height="54" loading="lazy" style="height:54px;width:auto;" /></a>
  <a href="https://deeplaunch.io" target="_blank" rel="dofollow noopener">Featured on DeepLaunch.io</a>
  <a href="https://findly.tools/keyoapi?utm_source=keyoapi" target="_blank" rel="noopener noreferrer"><img src="https://findly.tools/badges/findly-tools-badge-dark.svg" alt="Featured on Findly.tools" width="175" height="55" loading="lazy" style="height:44px;width:auto;" /></a>
  <a href="https://startupfa.me" target="_blank" rel="dofollow noopener">Featured on Startup Fame</a>
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
<script defer src="/brand/keyo-track.js"></script>
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
<p>Same model family on KeyoAPI: use <code>${esc(freeId)}</code> for <span class="ok">gift-credit</span> calls (billed at base rate with gift credits used first; fair-use, ${esc(channel)} channel), or <code>${esc(paid)}</code> for token-metered production traffic.</p>
<p>Rules: gift-credit = <code>:free</code> suffix; paid = bare ID. Fair-use rate/concurrency limits apply on gift-credit models — see <a href="/free-models">the gift-credit models page</a>.</p>
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

function contentGuideLinks(kind) {
  return `<div class="grid">${contentLandings.pages
    .filter((p) => !kind || p.kind === kind)
    .map((p) => `<a href="/${esc(p.slug)}">${esc(p.h1)}</a>`)
    .join("\n")}</div>`;
}

function renderContentSections(sections = []) {
  return sections.map((section) => `
<h2>${esc(section.heading)}</h2>
${(section.paragraphs || []).map((p) => `<p>${linkifySitePaths(p)}</p>`).join("\n")}
${section.rows ? `<div class="table-scroll"><table>
<thead><tr>${section.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${section.rows.map((row) => `<tr>${row.map((cell) => `<td>${linkifySitePaths(cell)}</td>`).join("")}</tr>`).join("\n")}</tbody>
</table></div>` : ""}
${(section.paragraphsAfter || []).map((p) => `<p>${linkifySitePaths(p)}</p>`).join("\n")}
${section.code ? `<pre><code>${esc(section.code)}</code></pre>` : ""}
`).join("\n");
}

function renderContentLanding(p) {
  const canonical = `${site}/${p.slug}`;
  return layout({
    title: p.title,
    description: p.metaDescription,
    canonical,
    h1: p.h1,
    bodyHtml: `<p class="lead">${linkifySitePaths(p.lead)}</p>
<div class="btnrow"><a class="btn btn-primary" href="/sign-up">Get API key</a><a class="btn btn-secondary" href="/pricing">Live prices</a><a class="btn btn-secondary" href="/models">Model guides</a></div>
${renderContentSections(p.sections)}
<h2>FAQ</h2><div class="faq">${p.faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${linkifySitePaths(f.a)}</p></details>`).join("\n")}</div>
<h2>Related guides</h2><div class="grid">${p.related.map((href) => `<a href="${esc(href)}">${esc(pathLabel(href))}</a>`).join("\n")}</div>`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: p.title,
      url: canonical,
      description: p.metaDescription,
    },
  });
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
${renderContentSections(m.guideSections)}
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
${m.related.length ? `<h2>Related models</h2>\n${relatedLinks(m.related)}` : ""}
<p class="meta">Guide for <strong>${esc(m.modelId || m.id)}</strong>. Catalog: <a href="/pricing">the pricing page</a> · Rates: <a href="/pricing-list">the full pricing list</a>.</p>
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
      name: `KeyoAPI ${m.modelId || m.id}`,
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
<script defer src="/brand/keyo-track.js"></script>
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
        <a class="btn btn-secondary" href="/models">Browse Models</a>
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
<p class="meta">Indicative KeyoAPI sell rates for planning. Full table on <a href="/compare">the model comparison page</a> · live list on <a href="/pricing-list">the full pricing list</a>.</p>
<table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI</th><th>Notes</th></tr></thead>
<tbody>
${headlineRows}
</tbody>
</table>
<p class="compare-jump"><a href="/compare">See the full comparison page →</a></p>
<h2>Gift-credit models — billed from your $10 welcome credit</h2>
<p class="meta">Gift-credit catalog IDs for prototyping, billed at base rate with gift credits used first (new users: $10; per invite: $3) with fair-use limits. Full list + rules: <a href="/free-models">the gift-credit models page</a>.</p>
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
# free: model=Atria-dawn-v2:free | DeepSeek-Prover-V2-7B:free (see /free-models)
# speech / vision / video: IndexTTS-2 · sam3 · RMBG-2.0 · MiniMax-H3 — see Docs</code></pre>
</div>
<footer class="foot">
  <div class="frow">
    <a href="/pricing">Model Square</a>
    <a href="/pricing-list">Pricing list</a>
    <a href="/models">All model guides</a>
    <a href="https://launchtory.com/projects/keyoapi-xyz">KeyoAPI on Launchtory</a>
    <a href="/compare">Compare</a>
    <a href="/free-models">Gift-Credit AI Models</a>
    <a href="/brand/blog/">Blog</a>
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
  <div class="frow" aria-label="Featured on">
    <a href="https://toolfame.com/item/keyoapi" target="_blank" rel="noopener noreferrer"><img src="https://toolfame.com/badge-light.svg" alt="Featured on ToolFame.com" width="160" height="54" loading="lazy" style="height:32px;width:auto;vertical-align:middle;" /></a>
    <a href="https://yo.directory" target="_blank" rel="dofollow noopener">Yo.directory</a>
    <a href="https://www.toolpilot.ai" target="_blank" rel="dofollow noopener">ToolPilot.ai</a>
    <a href="https://dang.ai" target="_blank" rel="dofollow noopener"><img src="https://assets.dang.ai/badges/dang-verified-dark.png" alt="Verified on DANG!" width="550" height="198" loading="lazy" style="height:32px;width:auto;border:0;outline:none;text-decoration:none;vertical-align:middle;" /></a>
    <a href="https://fazier.com" target="_blank" rel="dofollow noopener">Fazier</a>
    <a href="https://twelve.tools" target="_blank" rel="dofollow noopener"><img src="https://twelve.tools/badge0-white.svg" alt="Featured on Twelve Tools" width="200" height="54" loading="lazy" style="height:32px;width:auto;vertical-align:middle;" /></a>
    <a href="https://deeplaunch.io" target="_blank" rel="dofollow noopener">DeepLaunch.io</a>
    <a href="https://findly.tools/keyoapi?utm_source=keyoapi" target="_blank" rel="noopener noreferrer"><img src="https://findly.tools/badges/findly-tools-badge-dark.svg" alt="Featured on Findly.tools" width="175" height="55" loading="lazy" style="height:32px;width:auto;vertical-align:middle;" /></a>
    <a href="https://startupfa.me" target="_blank" rel="dofollow noopener">Startup Fame</a>
  </div>
</footer>
</body>
</html>
`;
}

function renderModelsIndex() {
  const seenIds = new Set(pages.models.map((m) => m.modelId || m.id));
  // Catalog-only models (video generation/processing lane) still belong in
  // this index; link each row through its landing page when one covers it.
  const catalogRows = (pricingLandings.catalogRows || [])
    .filter((r) => r.model && !seenIds.has(r.model))
    .map((r) => {
      const landing = landingByModel.get(r.model);
      const modelCell = landing
        ? `<a href="/${landing}"><code>${esc(r.model)}</code></a>`
        : `<code>${esc(r.model)}</code>`;
      const links = landing
        ? `<a href="/${landing}">Guide</a> · <a href="/pricing">Catalog</a>`
        : `<a href="/pricing">Catalog</a>`;
      return `<tr><td>${modelCell}</td><td>${esc(r.category || "")}</td><td class="ok">${esc(r.keyo)}</td><td>${links}</td></tr>`;
    });
  const rows = [
    ...pages.models.map(
      (m) =>
        `<tr><td><a href="/model/${encodeURIComponent(m.id)}"><code>${esc(m.modelId || m.id)}</code></a></td><td>${esc(m.category || "")}</td><td class="ok">${esc(m.priceLabel)}</td><td><a href="/model/${encodeURIComponent(m.id)}">Guide</a> · <a href="/pricing">Catalog</a></td></tr>`
    ),
    ...catalogRows,
  ].join("\n");
  const bodyHtml = `
<p class="lead">Index of KeyoAPI model guides — chat, speech, vision, OCR, TTS, digital humans, and video generation. For the interactive catalog use <a href="/pricing">Model Square</a>.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/pricing">Browse Models</a>
  <a class="btn btn-secondary" href="/compare">Price comparison</a>
  <a class="btn btn-secondary" href="/free-models">Free models</a>
</div>
<h2>Headline price anchors</h2>
<p class="meta">Full headline comparison (official list vs Keyo rates for every lane) lives on <a href="/compare">the model comparison page</a> — this index lists the guides themselves.</p>
<h2>Model comparisons and API workflows</h2>
${contentGuideLinks()}
<h2>All model guides</h2>
<div class="table-scroll"><table>
<thead><tr><th>Model ID</th><th>Category</th><th>Listed price</th><th>Links</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
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
  <a class="btn btn-secondary" href="/models">Browse Models</a>
</div>
<h2>What we do</h2>
<p>We aggregate many model providers behind one prepaid account. For chat (and supported image/speech paths), keep the OpenAI SDK: set <code>OPENAI_BASE_URL=https://www.keyoapi.xyz/v1</code> and swap <code>model=</code>. For OCR, matting, detection, async video and avatars, call the documented dedicated paths with the same key.</p>
<ul>
  <li><strong>OpenAI-compatible paths:</strong> <code>/v1/chat/completions</code>, <code>/v1/images/generations</code>, <code>/v1/audio/transcriptions</code>, <code>/v1/audio/speech</code>.</li>
  <li><strong>Dedicated REST:</strong> OCR, CV tools, async TTS/video, digital humans — billed per page / request / second / characters.</li>
  <li><strong>One key, one balance:</strong> no per-vendor accounts or credits to manage.</li>
  <li><strong>Gift-credit models:</strong> callable with complimentary credits (new users: $10; per invite: $3). Billed at base model rates with gift credits used first, fair-use limits — see <a href="/free-models">the gift-credit models page</a>.</li>
</ul>
<h2>Pricing philosophy</h2>
<p>We publish rates openly, model by model. Sample indicative Keyo sell rates:</p>
<table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI</th></tr></thead>
<tbody>
${priceSample}
</tbody>
</table>
<p>Full list: <a href="/compare">the model comparison page</a> · <a href="/pricing-list">the full pricing list</a> · deep dives: ${landingDeepDiveHtml()}</p>
<h2>Gift-credit models at base rates</h2>
<p>Call a gift-credit ID from the catalog — billed at the base model rate with gift credits used first (new users: $10; per invite: $3; fair-use limits). Metered twins stay available for production. Rules: <a href="/free-models">the gift-credit models page</a></p>
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
      "KeyoAPI is an AI API relay: chat, image and speech are OpenAI-compatible; OCR, vision, TTS-async and digital-human models use dedicated REST paths — same key, same prepaid balance, with gift-credit IDs (new users: $10; per invite: $3).",
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
<h2>Compare specific model pairs</h2>
${contentGuideLinks("comparison")}
<h2>Task budgets and decision routing</h2>
${contentGuideLinks("cost-guide")}
<p>For explicit classification alongside a chat workflow, see <a href="/model/cloudflare-clef">Cloudflare Clef decision API</a>. Its typed probabilities and actual-cost settlement differ from the chat token rates below.</p>
<h2>Headline LLM API pricing comparison</h2>
<div class="table-scroll"><table>
<thead><tr><th>Capability</th><th>Typical official list</th><th>KeyoAPI model</th><th>Notes</th></tr></thead>
<tbody>${compareTableRows()}</tbody>
</table></div>
<h2>Keyo LLM token rates (batch)</h2>
<div class="table-scroll"><table>
<thead><tr><th>Model</th><th>Listed Keyo price</th><th>Interactive page</th></tr></thead>
<tbody>${llmRows}</tbody>
</table></div>
<h2>How to estimate API costs (no calculator app required)</h2>
<p>For token-metered chat IDs: expected cost ≈ (input millions × input $/1M) + (output millions × output $/1M), then add retries. Pull the $/1M figures from live <a href="/pricing">the pricing page</a> or the rows on this page — do not hard-code a spreadsheet forever. Worked OpenAI-side example: <a href="/openai-api-pricing">the OpenAI API pricing page</a>. Brand hubs: <a href="/claude-api-pricing">Claude / Anthropic</a>, <a href="/grok-api-pricing">Grok</a>, <a href="/gemini-api-pricing">Gemini</a>, <a href="/deepseek-api-pricing">DeepSeek</a>.</p>
<h2>How to use this comparison</h2>
<p>One OpenAI-compatible SDK, one prepaid balance, and multimodal add-ons on one invoice. Swap <code>base_url</code> + key; keep your existing client for chat / image / speech paths.</p>
<p>Recommended rollout: start with <a href="${featuredHref("deepseek-v4.1-flash")}"><code>deepseek-v4.1-flash</code></a> on high-volume paths, <a href="${featuredHref("gpt-6-astra")}"><code>gpt-6-astra</code></a> or <a href="${featuredHref("gpt-5.6-terra")}"><code>gpt-5.6-terra</code></a> as default chat, escalate to <a href="${featuredHref("grok-4.7")}"><code>grok-4.7</code></a> or Claude-class lanes when you need denser reasoning.</p>
<p>Evaluating KeyoAPI as an OpenRouter alternative? The short version: both aggregate many model providers behind one API key and an OpenAI-compatible chat endpoint, so migration is the same two-line change (<code>base_url</code> + key). KeyoAPI is prepaid-wallet billing on one invoice with gift-credit prototyping IDs (new users: $10; per invite: $3; fair-use) on the same key; OpenRouter is credit-based with per-model free tiers where offered. Compare specific lanes above before volume decisions, and confirm live rates on <a href="/pricing">Model Square</a> either way.</p>
<h2>Related guides</h2>
<ul>
  <li><a href="/openai-api-alternative"><strong>OpenAI API alternative</strong></a> — why switch, two-line migration, price table</li>
  <li><a href="/openai-api-pricing">OpenAI / ChatGPT API pricing</a> · <a href="/claude-api-pricing">Claude API pricing</a> · <a href="/deepseek-api-pricing">DeepSeek API pricing</a></li>
  <li><a href="/free-models">Gift-Credit AI Models</a> — callable with complimentary credits (new users: $10; per invite: $3)</li>
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
  const seenIds = new Set(pages.models.map((m) => m.modelId || m.id));
  const landingExtra = [];
  // catalogRows: price-table rows that belong to no single landing page
  // (e.g. the video generation catalog) — merged into the guided table only.
  for (const r of pricingLandings.catalogRows || []) {
    const id = r.model;
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    landingExtra.push({
      id,
      category: r.category || "llm",
      priceLabel: r.keyo,
      endpoint: r.endpoint || "POST /v1/chat/completions",
      guide: false,
    });
  }
  for (const p of pricingLandings.pages || []) {
    for (const r of p.rows || []) {
      const id = r.model;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      landingExtra.push({
        id,
        category: r.category || "llm",
        priceLabel: r.keyo,
        endpoint: r.endpoint || "POST /v1/chat/completions",
        guide: false,
      });
    }
  }
  const rows = [...pages.models, ...landingExtra]
    .map((m) => {
      const hasGuide = m.guide !== false;
      const landing = landingByModel.get(m.id);
      // No /model/ guide -> link through the landing page that covers the
      // model (e.g. the video generation catalog) instead of dead "List".
      const modelCell = hasGuide
        ? `<a href="/model/${encodeURIComponent(m.id)}"><code>${esc(m.modelId || m.id)}</code></a>`
        : landing
          ? `<a href="/${landing}"><code>${esc(m.modelId || m.id)}</code></a>`
          : `<code>${esc(m.modelId || m.id)}</code>`;
      const guide = hasGuide
        ? `<a href="/model/${encodeURIComponent(m.id)}">Guide</a>`
        : landing
          ? `<a href="/${landing}">Guide</a>`
          : `List`;
      return `<tr>
  <td>${modelCell}</td>
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
<h2>Gift-credit models — billed from your $10 welcome credit</h2>
<p class="meta">Gift-credit IDs (billed at base rate, gift credits used first; new users: $10, per invite: $3; fair-use): see <a href="/free-models">the gift-credit models page</a> for the full list, paid twins and curl examples. The tables below cover the metered catalog.</p>
<h2>Task cost guides</h2>
${contentGuideLinks("cost-guide")}
<p>For typed routing probabilities, see <a href="/model/cloudflare-clef">Cloudflare Clef</a> and its dedicated <code>POST /v1/decisions</code> endpoint.</p>
<h2>Guided model price table</h2>
<div class="table-scroll"><table>
<thead><tr><th>Model ID</th><th>Category</th><th>Listed price</th><th>Endpoint</th><th>Links</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<h2>Headline vs official list</h2>
<p class="meta">The headline comparison (typical official list vs Keyo rates for every lane) lives on <a href="/compare">the model comparison page</a> — this page is the full static price list.</p>
<h2>How billing works</h2>
<p>KeyoAPI is a prepaid <strong>ai api relay</strong>: one balance covers chat, Whisper, OCR, vision, TTS, and digital humans. LLM rows are usually token-metered; many vision/speech models are per-request or async-task metered.</p>
<p>Open interactive catalog at <a href="/pricing">the pricing page</a> after login. Model explainers are at <code>/model/{modelId}</code>.</p>
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
  <td class="ok">Gift credits</td>
  <td>${esc(m.family || "—")}</td>
  <td><a href="/sign-up">Get key</a></td>
</tr>`;
    })
    .join("\n");
  const exampleFree =
    freeAll.find((m) => m.id.includes("flash") && m.id.includes("free"))?.id ||
    freeAll.find((m) => m.id.endsWith(":free"))?.id ||
    freeAll[0]?.id ||
    "glm-5.3-flash:free";
  const bodyHtml = `
<p class="lead">KeyoAPI offers <strong>gift-credit models</strong> callable with your complimentary credits. Billed at the base model rate; gift credits are used first, with any shortfall charged to your recharge balance. <strong>New users get $10</strong>, and <strong>each successful invite earns $3</strong>. Register a key and set <code>model</code> to any ID in the table below.</p>
<p class="meta">Built for prototypes, demos, CI smoke tests, and eval harnesses. For production QPS, switch to metered (paid) model IDs on the same base URL.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/sign-up">Get your API key</a>
  <a class="btn btn-secondary" href="/pricing-list">Full pricing list</a>
  <a class="btn btn-secondary" href="/brand/keyo-docs.html">Docs</a>
</div>
<h2>Gift-credit models — no credit card required</h2>
<p>Create an account, mint a key, point <code>OPENAI_BASE_URL</code> to <code>https://www.keyoapi.xyz/v1</code>, and call chat completions with a gift-credit <code>model</code> ID (ending in <code>:free</code>). New users receive <strong>$10 in gift credits</strong>; invite a friend and earn <strong>$3 more</strong>.</p>
<h2>Gift-credit catalog</h2>
<table>
<thead><tr><th>Gift-credit model ID</th><th>Base twin (if any)</th><th>Billing</th><th>Family</th><th>Links</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p>Call the gift-credit ID exactly as listed (including the <code>:free</code> suffix). Catalog membership can change — confirm live availability on <a href="/pricing">the pricing page</a>.</p>
<h2>Browse by family</h2>
<p>Browse by family in the table above (${[...new Set(freeAll.map((m) => m.family).filter(Boolean))].join(", ") || "listed vendors"}). Start with gift-credit models — no credit card required; move to metered IDs when you need higher throughput or additional models.</p>
<h2>Quick start (curl)</h2>
<pre>curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${esc(exampleFree)}",
    "messages": [{"role":"user","content":"Hello"}]
  }'</pre>
<h2>Gift-credit rules (read before you ship)</h2>
<ul>
  <li><strong>Price:</strong> gift-credit IDs are <strong>billed at the base model rate</strong>. Gift credits are used first; any shortfall is charged to your recharge balance.</li>
  <li><strong>Complimentary credits:</strong> calls draw from your <strong>gift-credit balance</strong> (new users: $10; per successful invite: $3). When it runs out, top up to keep calling.</li>
  <li><strong>Fair use:</strong> gift-credit traffic has <strong>rate / concurrency limits</strong>. Limits can tighten under abuse. Do not treat gift-credit IDs as an unlimited production SLA.</li>
  <li><strong>Availability:</strong> some <code>:free</code> IDs may be added or removed from the catalog. Check <a href="/pricing">Model Square</a> before hard-coding.</li>
  <li><strong>Catch (honest):</strong> you get real capability with gift credits; you do <em>not</em> get paid-tier priority or guaranteed throughput.</li>
</ul>
<div class="faq">
<h2>FAQ</h2>
<details open>
  <summary>Can I use gift credits without a credit card?</summary>
  <p>Yes — gift-credit IDs are callable with your complimentary credits (new users: $10; per invite: $3) with no credit card required to start. Fair-use rate limits apply.</p>
</details>
<details>
  <summary>What's the catch?</summary>
  <p>Fair-use rate limiting and lower priority. Exact RPM can change; if you need predictable limits, use metered (paid) IDs.</p>
</details>
<details>
  <summary>Gift-credit vs paid?</summary>
  <p>Gift-credit IDs use your complimentary credits first (with fair-use limits). Paid IDs are token- or request-metered with higher priority — preferred for production.</p>
</details>
<details>
  <summary>Can I use it in production?</summary>
  <p>You can. For anything user-facing or latency-sensitive, we recommend metered IDs. Gift-credit models are ideal for prototypes, demos, CI smoke tests, and eval harnesses.</p>
</details>
<details>
  <summary>Why one hub page?</summary>
  <p>One page keeps every gift-credit ID and its limits in one place — bookmark it; we update it when the catalog changes.</p>
</details>
</div>
<h2>When you outgrow gift-credit models</h2>
<p>Same key, switch <code>model=</code> only. Gift-credit IDs are chat and speech lanes — video generation has no free tier and bills per generated second:</p>
<ul>
  <li><a href="/model/CosyVoice3"><strong>CosyVoice3 API</strong></a> — hosted async TTS when you need production throughput</li>
  <li><a href="/tts-api">TTS API hub</a> · <a href="/voice-cloning-api">Voice cloning</a> · <a href="/model/IndexTTS-2">IndexTTS-2</a></li>
  <li><a href="/model/deepseek-v4-flash"><strong>DeepSeek V4 Flash pricing</strong></a> — metered Flash after gift-credit prototypes</li>
  <li><a href="/model/kimi-k3"><strong>Kimi K3 API key</strong></a> — draft on gift-credit IDs, then <code>kimi-k3</code></li>
  <li><a href="/model/Duix-Avatar"><strong>Duix Avatar API</strong></a> — talking-face after TTS · <a href="/compare">Compare rates</a></li>
  <li><a href="/seedance-2-5-api-pricing"><strong>Video generation APIs</strong></a> — per-second billing from ~$0.02/s: <a href="/seedance-2-0-api-pricing">Seedance 2.0</a> · <a href="/minimax-h3-api-pricing">MiniMax-H3</a> · <a href="/flux-3-video-api-pricing">FLUX.3</a> · <a href="/wan3-video-api-pricing">Wan 3.0</a> · <a href="/agnes-video-2-5-api-pricing">Agnes</a> · <a href="/video-enhance-pro-api-pricing">enhance</a> / <a href="/subtitle-erase-pro-api-pricing">subtitle erase</a></li>
</ul>
<p class="meta">Also see the interactive catalog on <a href="/pricing">the pricing page</a> (filter Gift-credit models) and the OpenAI-compatible docs.</p>
`;
  return layout({
    title: "Gift-Credit AI Models — No Credit Card | KeyoAPI",
    description:
      "Gift-credit AI models on KeyoAPI: callable with complimentary credits (new users: $10; per invite: $3). Billed at base model rates with gift credits used first. Get your API key and call OpenAI-compatible chat completions.",
    canonical: `${site}/free-models`,
    h1: "Gift-Credit AI Models — No Credit Card Required",
    bodyHtml,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Gift-Credit AI Models — KeyoAPI",
      url: `${site}/free-models`,
      description:
        "Gift-credit AI models on KeyoAPI: new users get $10, each invite earns $3. Billed at base rates with gift credits used first. OpenAI-compatible chat completions.",
    },
  });
}

/** Brand-aware related links — avoid one TTS boilerplate on every LLM hub. */
function landingRelatedLinks(slug) {
  const base =
    '<a href="/compare">the model comparison page</a>, <a href="/free-models">the free models page</a>, <a href="/pricing-list">the full pricing list</a>';
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
    "seedance-2-5-api-pricing":
      `${base}, and <a href="/seedance-2-0-api-pricing">Seedance 2.0 pricing</a> · <a href="/minimax-h3-api-pricing">MiniMax-H3 pricing</a> · <a href="/flux-3-video-api-pricing">FLUX.3 Video pricing</a>`,
    "seedance-2-0-api-pricing":
      `${base}, and <a href="/seedance-2-5-api-pricing">Seedance 2.5 pricing</a> · <a href="/minimax-h3-api-pricing">MiniMax-H3 pricing</a> · <a href="/agnes-video-2-5-api-pricing">Agnes Video 2.5 pricing</a>`,
    "minimax-h3-api-pricing":
      `${base}, and <a href="/seedance-2-5-api-pricing">Seedance 2.5 pricing</a> · <a href="/flux-3-video-api-pricing">FLUX.3 Video pricing</a> · <a href="/wan3-video-api-pricing">Wan 3.0 Video pricing</a>`,
    "flux-3-video-api-pricing":
      `${base}, and <a href="/seedance-2-5-api-pricing">Seedance 2.5 pricing</a> · <a href="/minimax-h3-api-pricing">MiniMax-H3 pricing</a> · <a href="/wan3-video-api-pricing">Wan 3.0 Video pricing</a>`,
    "wan3-video-api-pricing":
      `${base}, and <a href="/seedance-2-5-api-pricing">Seedance 2.5 pricing</a> · <a href="/minimax-h3-api-pricing">MiniMax-H3 pricing</a> · <a href="/flux-3-video-api-pricing">FLUX.3 Video pricing</a>`,
    "agnes-video-2-5-api-pricing":
      `${base}, and <a href="/seedance-2-5-api-pricing">Seedance 2.5 pricing</a> · <a href="/minimax-h3-api-pricing">MiniMax-H3 pricing</a> · <a href="/flux-3-video-api-pricing">FLUX.3 Video pricing</a>`,
    "video-enhance-pro-api-pricing":
      `${base}, and <a href="/subtitle-erase-pro-api-pricing">Subtitle Erase Pro pricing</a> · <a href="/agnes-video-2-5-api-pricing">Agnes Video 2.5 pricing</a> · <a href="/seedance-2-5-api-pricing">Seedance 2.5 pricing</a>`,
    "subtitle-erase-pro-api-pricing":
      `${base}, and <a href="/video-enhance-pro-api-pricing">Video Enhance Pro pricing</a> · <a href="/agnes-video-2-5-api-pricing">Agnes Video 2.5 pricing</a> · <a href="/seedance-2-5-api-pricing">Seedance 2.5 pricing</a>`,
    "nano-banana-api-pricing":
      `${base}, and <a href="/model/nano-banana-2.1">Nano Banana 2.1</a> · <a href="/model/nano-banana-2">Nano Banana 2</a> · <a href="/model/nano-banana-pro">Nano Banana Pro</a>`,
  };
  const links = bySlug[slug] || `${base}, and <a href="/tts-api">TTS API</a> · <a href="/ai-avatar-video-generator">Avatar video</a>`;
  return `<p class="meta">Also see ${links}.</p>`;
}

/** Per-landing raw HTML sections rendered right after the CTA row. */
const LANDING_EXTRA_SECTIONS = {
  "openai-api-alternative": `
<h2>OpenAI-compatible API: what works on one base URL</h2>
<p>Yes — the official OpenAI SDKs work against KeyoAPI as a drop-in for most calls. Set <code>base_url</code> to <code>https://www.keyoapi.xyz/v1</code>, send your Keyo API key as <code>Authorization: Bearer</code>, and keep <code>client.chat.completions.create()</code>. Chat, model listing, embeddings, image generation, OCR and speech-to-text all run on OpenAI-shaped paths. Text-to-speech is OpenAI-shaped for part of the catalog and asynchronous or vendor-native for the rest. Visual processing, video, digital-human, document parsing and the decision endpoint use dedicated REST paths — same key, same prepaid balance, different URL shape.</p>
<p class="meta">Endpoint status below mirrors the live contract in <a href="/brand/keyo-api-ref.html">the API endpoint reference</a>. For per-model sell rates see <a href="/pricing-list">the full pricing list</a>. Local media for video Path B and OCR goes up first via a separate multipart upload (<code>POST /v1/uploads</code>) that returns a public URL.</p>
<table>
<thead><tr><th>Path</th><th>OpenAI-shaped</th><th>What runs on it</th><th>Notes</th></tr></thead>
<tbody>
<tr>
  <td><code>POST /v1/chat/completions</code></td>
  <td class="ok">Yes</td>
  <td>Text chat across GPT-class, Claude-class, DeepSeek, Gemini chat, GLM, Grok, Kimi, Qwen, MiniMax · plus OCR (<code>Unlimited-OCR</code>) via multimodal messages · Grok video (<code>grok-video-1.5</code>)</td>
  <td>Only the <code>model=</code> string changes · <a href="/models">the model guides</a></td>
</tr>
<tr>
  <td><code>GET /v1/models</code></td>
  <td class="ok">Yes</td>
  <td>Live catalog for the key</td>
  <td>Confirm IDs before a bulk run · <a href="/free-models">the free models page</a></td>
</tr>
<tr>
  <td><code>POST /v1/images/generations</code></td>
  <td class="ok">Yes</td>
  <td>Image IDs — <code>gpt-image-2.5</code> family and <code>nano-banana-2</code>, <code>nano-banana-2.1</code>, <code>nano-banana-pro</code></td>
  <td>Same request shape as OpenAI images · <a href="/compare">the model comparison page</a></td>
</tr>
<tr>
  <td><code>POST /v1/audio/transcriptions</code></td>
  <td class="ok">Yes</td>
  <td><code>whisper-large-v3</code>, <code>whisper-large-v3-turbo</code>, <code>SenseVoiceSmall</code>, <code>GLM-ASR</code>, <code>MOSS-Audio-8B-Thinking</code></td>
  <td>Multipart upload, <code>model=</code> picks the variant · <a href="/pricing-list">the full pricing list</a></td>
</tr>
<tr>
  <td><code>POST /v1/embeddings</code></td>
  <td class="ok">Yes</td>
  <td><code>WeMM-Embedding-9B</code>, <code>WeMM-Embedding-4B</code>, <code>WeMM-Embedding-2B</code>, <code>gemini-embedding-2-preview</code></td>
  <td>OpenAI-shaped <code>model</code> + <code>input</code> body · <a href="/brand/keyo-api-ref.html">the API endpoint reference</a></td>
</tr>
<tr>
  <td><code>POST /v1/audio/speech</code></td>
  <td>Partial</td>
  <td><code>GLM-TTS</code>, <code>Step-Audio-TTS-3B</code>, <code>IndexTTS-2</code></td>
  <td><strong>Not</strong> all TTS IDs: <code>gemini-3.8-flash-tts</code> and <code>gemini-3.1-flash-tts-preview</code> call Gemini-native <code>generateContent</code> instead · <a href="/gemini-api-pricing">the Gemini pricing page</a></td>
</tr>
<tr>
  <td><code>POST /v1/async/audio/speech</code></td>
  <td>No</td>
  <td><code>Qwen3-TTS</code>, <code>CosyVoice3</code> — poll <code>GET /v1/task/{id}</code></td>
  <td>Asynchronous speech shares the key, not the OpenAI shape · <a href="/tts-api">the text to speech API page</a></td>
</tr>
<tr>
  <td><code>POST /v1/images/mattings</code> · <code>upscaling</code> · <code>unwarping</code> · <code>object-detection</code> · <code>segmentation</code> · <code>pose-detection</code></td>
  <td>No</td>
  <td>Matting, upscaling, doc unwarping, detection, segmentation, pose — all multipart</td>
  <td>Deliberately not OpenAI-shaped · <a href="/remove-bg-api-alternative">the remove.bg API alternative page</a></td>
</tr>
<tr>
  <td><code>POST /v1/videos/generations</code> · <code>/v1/async/videos/image-to-video</code> · <code>/v1/async/documents/parse</code> · <code>/v1/systemone</code></td>
  <td>No</td>
  <td>Video Path B, digital human (InfiniteTalk), MinerU parsing, System One decisions</td>
  <td>One balance across every shape · <a href="/ai-avatar-video-generator">the avatar video API page</a></td>
</tr>
<tr>
  <td><code>POST /v1/moderations</code></td>
  <td>Partial</td>
  <td>Text moderation — <code>keyo-text-moderation</code> and related filter IDs</td>
  <td>OpenAI-shaped request (<code>model</code> + <code>input</code>); response contract in <a href="/brand/keyo-api-ref.html">the API endpoint reference</a></td>
</tr>
</tbody>
</table>

<h2>Same call, two SDKs</h2>
<p>Python and Node, both on the official OpenAI SDK. Only <code>base_url</code> and the key differ from an OpenAI setup:</p>
<pre>from openai import OpenAI

client = OpenAI(
    base_url=&quot;https://www.keyoapi.xyz/v1&quot;,
    api_key=&quot;YOUR_KEYO_API_KEY&quot;,
)

r = client.chat.completions.create(
    model=&quot;gpt-6-astra&quot;,
    messages=[{&quot;role&quot;: &quot;user&quot;, &quot;content&quot;: &quot;Hello from an OpenAI-compatible endpoint&quot;}],
)
print(r.choices[0].message.content)</pre>
<pre>import OpenAI from &quot;openai&quot;;

const client = new OpenAI({
  baseURL: &quot;https://www.keyoapi.xyz/v1&quot;,
  apiKey: process.env.KEYO_API_KEY,
});

const r = await client.chat.completions.create({
  model: &quot;deepseek-v4.1-flash&quot;,
  messages: [{ role: &quot;user&quot;, content: &quot;Hello from an OpenAI-compatible endpoint&quot; }],
});
console.log(r.choices[0].message.content);</pre>
<p>Swap <code>model=</code> for any ID on <a href="/pricing-list">the full pricing list</a> — no second client, no second billing relationship. OpenAI-side unit economics are on <a href="/openai-api-pricing">the OpenAI API pricing page</a>.</p>
`,
};

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
    p.rows.find((r) => !isFreeId(r.model))?.model ||
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
${LANDING_EXTRA_SECTIONS[p.slug] || ""}
<h2>${esc(tableHeading)}</h2>
<p class="meta">Indicative figures for planning. Confirm live Keyo sell rates on interactive <a href="/pricing">Model Square</a> or the static <a href="/pricing-list">pricing list</a>.</p>
<div class="table-scroll"><table>
<thead><tr><th>Model ID</th><th>${esc(colOfficial)}</th><th>KeyoAPI</th><th>Notes</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
${p.announcedNote
  ? `<h2>${esc(p.announcedNote.title)}</h2>
${(p.announcedNote.body || [])
  .map((t) => `<p>${linkifySitePaths(t)}</p>`)
  .join("\n")}`
  : ""}
<h2>${esc(p.freeKiller.title)}</h2>
<p>${linkifySitePaths(p.freeKiller.body)}</p>
${p.cheapestNote
  ? `<h2>${esc(p.cheapestNote.title)}</h2>
${(p.cheapestNote.body || [])
  .map((t) => `<p>${linkifySitePaths(t)}</p>`)
  .join("\n")}`
  : ""}
<h2>${esc(bodyHeading)}</h2>
${bodyParas}
${renderContentSections(p.guideSections)}
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
  const landingAllows = [...pricingLandings.pages, ...contentLandings.pages]
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

  const landingUrls = [...pricingLandings.pages, ...contentLandings.pages].map((p) => ({
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
      loc: `${site}/brand/keyo-api-ref.html`,
      file: path.join(root, "static/brand/keyo-api-ref.html"),
      priority: "0.5",
      changefreq: "monthly",
    },
    {
      loc: `${site}/brand/faq.html`,
      file: path.join(root, "static/brand/faq.html"),
      priority: "0.4",
      changefreq: "monthly",
    },
    // privacy/terms/aup are noindex legal pages — kept out of the sitemap
    // so we never declare a URL the page itself refuses.
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

const renderers = new Map([
  ["index", renderHome],
  ["models", renderModelsIndex],
  ["about", renderAbout],
  ["compare", renderCompare],
  ["pricing", renderPricing],
  ["free-models", renderFreeModels],
]);
for (const p of [...pricingLandings.pages, ...contentLandings.pages]) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || renderers.has(p.slug)) {
    throw new Error(`Invalid or duplicate landing slug: ${p.slug}`);
  }
  renderers.set(p.slug, () => contentLandings.pages.includes(p)
    ? renderContentLanding(p)
    : renderPricingLanding(p));
}
for (const m of pages.models) {
  if (HAND_MAINTAINED_GUIDES.has(m.id)) continue;
  const key = `model/${m.id}`;
  if (renderers.has(key)) throw new Error(`Duplicate model ID: ${m.id}`);
  renderers.set(key, () => renderModel(m));
}
for (const key of selectedPages) {
  if (!renderers.has(key)) throw new Error(`Unknown or hand-maintained page: ${key}`);
}
fs.mkdirSync(path.join(outDir, "model"), { recursive: true });
let generatedCount = 0;
for (const [key, render] of renderers) {
  if (selectedPages.size && !selectedPages.has(key)) continue;
  fs.writeFileSync(path.join(outDir, `${key}.html`), render());
  generatedCount++;
}
fs.writeFileSync(path.join(outDir, "robots.txt"), writeRobots());
fs.writeFileSync(path.join(outDir, "sitemap.xml"), writeSitemap());
if (!selectedPages.size) {
  fs.rmSync(path.join(outDir, "sitemap-live.xml"), { force: true });
}
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
  generatedCount,
  "HTML pages + robots.txt + sitemap.xml ->",
  outDir
);
