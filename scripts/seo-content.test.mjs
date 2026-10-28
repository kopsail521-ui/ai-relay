import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const content = JSON.parse(read("config/seo/content-landings.json"));
const pricePages = JSON.parse(read("config/seo/pricing-landings.json")).pages;
const modelPages = [
  ...JSON.parse(read("config/seo/model-pages.json")).models,
  ...JSON.parse(read("config/seo/batch2-models.json")).models,
];
const modelIds = new Set(modelPages.map((model) => model.modelId || model.id));
const seoRoot = path.join(root, "static/seo");
const staticRoutes = new Set([
  "/", "/models", "/compare", "/pricing-list", "/free-models", "/about",
  ...pricePages.map((page) => `/${page.slug}`),
  ...content.pages.map((page) => `/${page.slug}`),
]);
const dynamicRoutes = new Set(["/pricing", "/sign-up", "/sign-in", "/console"]);

function checkStaticHref(href) {
  if (!href.startsWith("/") || dynamicRoutes.has(href)) return;
  if (href.startsWith("/brand/")) {
    const file = path.join(root, "static", href, href.endsWith("/") ? "index.html" : "");
    assert.ok(fs.existsSync(file), `Missing brand target: ${href}`);
    return;
  }
  const file = href === "/" ? "index.html"
    : href === "/pricing-list" ? "pricing.html" : `${decodeURIComponent(href.slice(1))}.html`;
  assert.ok(href.startsWith("/model/") || staticRoutes.has(href), `Unknown static route: ${href}`);
  assert.ok(fs.existsSync(path.join(seoRoot, file)), `Missing static target: ${href}`);
}

function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-seo-"));
  for (const folder of ["config/seo", "scripts", "static/seo", "new-api/web/public"]) {
    fs.mkdirSync(path.join(temp, folder), { recursive: true });
  }
  fs.cpSync(path.join(root, "config/seo"), path.join(temp, "config/seo"), { recursive: true });
  for (const file of ["sensenova-free-models.json"]) {
    fs.copyFileSync(path.join(root, "config", file), path.join(temp, "config", file));
  }
  for (const file of ["gen-seo-pages.mjs", "caddy-seo-shared.mjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(temp, "scripts", file));
  }
  fs.cpSync(seoRoot, path.join(temp, "static/seo"), { recursive: true });
  fs.mkdirSync(path.join(temp, "static/brand"), { recursive: true });
  for (const file of ["keyo-docs.html", "keyo-api-ref.html", "faq.html"]) {
    fs.copyFileSync(path.join(root, "static/brand", file), path.join(temp, "static/brand", file));
  }
  return temp;
}

function htmlSnapshot(dir) {
  const result = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
    const parent = entry.parentPath || entry.path;
    const file = path.join(parent, entry.name);
    result.set(path.relative(dir, file), fs.readFileSync(file, "utf8"));
  }
  return result;
}

test("content pages publish unique canonical URLs, valid examples and working internal links", () => {
  const slugs = content.pages.map((page) => page.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const sitemap = read("static/seo/sitemap.xml");
  assert.equal(sitemap, read("new-api/web/public/sitemap.xml"));
  const caddy = read("scripts/caddy-seo-handles.caddyfragment");
  const landingCaddy = read("scripts/caddy-landing-handles.caddyfragment");
  const modelsIndex = read("static/seo/models.html");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(locations).size, locations.length);
  for (const page of content.pages) {
    const html = read(`static/seo/${page.slug}.html`);
    const canonical = `https://www.keyoapi.xyz/${page.slug}`;
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
    assert.equal(locations.filter((url) => url === canonical).length, 1);
    assert.ok(caddy.includes(`handle /${page.slug} {`));
    assert.ok(landingCaddy.includes(`handle /${page.slug} {`));
    assert.ok(modelsIndex.includes(`href="/${page.slug}"`));
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      assert.equal(JSON.parse(json).url, canonical);
    }
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) checkStaticHref(href);
    for (const section of page.sections) {
      if (section.rows) for (const row of section.rows) assert.equal(row.length, section.headers.length);
      if (!section.code) continue;
      assert.ok(section.code.startsWith("curl https://www.keyoapi.xyz/v1/chat/completions \\\n"));
      assert.ok(!section.code.includes("\\n"), "Curl must contain real line breaks");
      const payload = JSON.parse(section.code.match(/-d '([^']+)'/)[1]);
      assert.ok(modelIds.has(payload.model), `Unknown example model: ${payload.model}`);
      assert.ok(payload.model !== "gemini-4");
      assert.ok(payload.messages.length > 0);
      assert.ok(payload.max_tokens > 0);
    }
  }
  for (const model of ["gemini-4-argon", "gemini-4-barium"]) {
    assert.ok(modelsIndex.includes(`href="/model/${model}"`));
    assert.ok(locations.includes(`https://www.keyoapi.xyz/model/${model}`));
  }
});

test("Claude task budgets use exact rates and keep client compatibility qualified", () => {
  const page = content.pages.find((page) => page.slug === "claude-code-api-pricing");
  const rates = new Map(page.sections.find((section) => section.heading === "Claude model API rates on KeyoAPI").rows.map((row) => [row[0], row]));
  const expected = [
    ["claude-haiku-5-5", 7353, 36765],
    ["claude-sonnet-5", 44120, 220600],
    ["claude-sonnet-5-5", 88235, 441175],
    ["claude-opus-5", 110300, 551500],
    ["claude-opus-5-5", 176470, 882350],
    ["claude-fable-5-1", 735300, 3676500],
    ["claude-fable-5", 441175, 2205875],
  ];
  for (const [id, input, output] of expected) {
    const row = rates.get(id);
    assert.equal(Math.round(Number(row[1].slice(1)) * 100000), input);
    assert.equal(Math.round(Number(row[2].slice(1)) * 100000), output);
  }
  assert.equal(rates.size, expected.length);
  const budgets = page.sections.find((section) => section.heading.startsWith("A worked task budget")).rows;
  for (const row of budgets) {
    const [, input, output] = expected.find(([id]) => id === row[0]);
    const total = input * 10 + output;
    assert.equal(row[1], `$${(input / 1000000).toFixed(7)}`);
    assert.equal(row[2], `$${(output / 10000000).toFixed(7)}`);
    assert.equal(row[3], `$${(total / 10000000).toFixed(7)}`);
    assert.equal(Number(row[4]), Math.floor(200000000 / total));
  }
  assert.equal(budgets.length, 4);
  const html = read("static/seo/claude-code-api-pricing.html");
  assert.match(html, /Example budget: 100,000 billed input tokens/);
  assert.match(html, /Actual usage varies/);
  assert.match(html, /Count each billed occurrence/);
  assert.match(html, /A chat request alone does not establish full Claude Code support/);
  const lead = html.match(/<p class="lead">([\s\S]*?)<\/p>/)[1];
  assert.doesNotMatch(lead, /verified|validation|claim|checked|not yet/i);
  assert.doesNotMatch(html, /this page does not claim|not yet been verified|six checked IDs|This page does not quote|One successful Messages response/i);
  for (const file of ["models", "compare", "pricing", "claude-api-pricing", "ai-agent-api"]) {
    assert.ok(read(`static/seo/${file}.html`).includes('href="/claude-code-api-pricing"'), `Missing cost-guide link in ${file}`);
  }
});

test("Clef guide preserves the decision protocol, billing explanation and API ID", () => {
  const model = modelPages.find((model) => model.id === "cloudflare-clef");
  assert.equal(model.modelId, "cloudflare/clef");
  assert.equal(model.endpoint, "POST /v1/decisions");
  assert.ok(model.curlExample.startsWith("curl https://www.keyoapi.xyz/v1/decisions \\\n"));
  const payload = JSON.parse(model.curlExample.match(/-d '([^']+)'/)[1]);
  assert.deepEqual(Object.keys(payload).sort(), ["model", "questions", "state"]);
  assert.equal(payload.model, model.modelId);
  assert.equal(typeof payload.state, "string");
  for (const question of Object.values(payload.questions)) {
    assert.equal(question.type, "choice");
    assert.ok(question.instructions);
    assert.ok(Object.values(question.criteria).every((value) => value === null));
  }
  const html = read("static/seo/model/cloudflare-clef.html");
  assert.match(html, /usage\.cost is the final KeyoAPI charge in USD/);
  assert.doesNotMatch(html, /markup|x ?1\.5/);
  assert.doesNotMatch(html, /actual-cost settlement/);
  assert.match(html, /approximately the first 2000/);
  assert.match(html, /below 300KiB/);
  assert.match(html, /illustrative usage fragment, not a captured response/);
  assert.match(html, /not a guaranteed request price/);
  assert.ok(html.includes('href="/ai-agent-api"'));
  assert.ok(html.includes('href="/claude-code-api-pricing"'));
  const row = read("static/seo/pricing.html").match(/<tr>\s*<td><a href="\/model\/cloudflare-clef">[\s\S]*?<\/tr>/)[0];
  assert.ok(row.includes("<code>cloudflare/clef</code>"));
  assert.ok(row.includes("POST /v1/decisions"));
  const fragment = JSON.parse(model.guideSections.find((section) => section.heading === "Read the final charge from usage.cost").code);
  assert.equal(fragment.usage.cost, fragment.usage.input_tokens * 0.063 / 1000000);
  assert.equal(fragment.usage.output_tokens, 0);
});

test("API reference has one self canonical and appears in the sitemap", () => {
  const html = read("static/brand/keyo-api-ref.html");
  const canonical = "https://www.keyoapi.xyz/brand/keyo-api-ref.html";
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
  assert.match(html, /<title>KeyoAPI API Reference/);
  assert.equal((read("static/seo/sitemap.xml").match(new RegExp(`<loc>${canonical.replaceAll(".", "\\.")}</loc>`, "g")) || []).length, 1);
});

test("footer badge images declare intrinsic dimensions, lazy loading and noopener", () => {
  for (const file of ["openai-api-pricing", "index"]) {
    const html = read(`static/seo/${file}.html`);
    const badges = [...html.matchAll(/<img src="https:\/\/(?:toolfame\.com\/badge-light\.svg|assets\.dang\.ai\/badges\/dang-verified-dark\.png|twelve\.tools\/badge0-white\.svg)"[^>]*>/g)].map((m) => m[0]);
    assert.equal(badges.length, 3, `${file}: expected 3 badge images`);
    for (const tag of badges) {
      assert.match(tag, /width="\d+" height="\d+" loading="lazy"/, `${file}: ${tag}`);
    }
    const twelve = html.match(/<a href="https:\/\/twelve\.tools"[^>]*>/)[0];
    assert.match(twelve, /rel="dofollow noopener"/, `${file}: twelve.tools link missing rel`);
  }
});

test("selected generation preserves every other HTML file and is repeatable", () => {
  const temp = fixture();
  try {
    const dir = path.join(temp, "static/seo");
    const selected = "gpt-6-1-sol-vs-gpt-6-astra";
    const selectedFile = `${selected}.html`;
    fs.writeFileSync(path.join(dir, selectedFile), "stale selected content");
    const before = htmlSnapshot(dir);
    const generator = path.join(temp, "scripts/gen-seo-pages.mjs");
    execFileSync(process.execPath, [generator, `--pages=${selected}`]);
    const after = htmlSnapshot(dir);
    for (const [file, html] of before) {
      if (file !== selectedFile) assert.equal(after.get(file), html, `Overwrote ${file}`);
    }
    assert.ok(after.get(selectedFile).includes("$0.007354"));
    const sitemap = fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8");
    execFileSync(process.execPath, [generator, `--pages=${selected}`]);
    assert.deepEqual(htmlSnapshot(dir), after);
    assert.equal(fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8"), sitemap);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("invalid and hand-maintained page selections fail before writes", () => {
  const temp = fixture();
  try {
    const dir = path.join(temp, "static/seo");
    const before = htmlSnapshot(dir);
    const generator = path.join(temp, "scripts/gen-seo-pages.mjs");
    for (const selection of ["missing-page", "model/eleven-v4", "", "models,", " "]) {
      const result = spawnSync(process.execPath, [generator, `--pages=${selection}`], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Unknown or hand-maintained page|Page selection must contain non-empty page keys/);
      assert.deepEqual(htmlSnapshot(dir), before);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("generated SEO pages have zero natural-language phrase collisions", () => {
  const patterns = [
    { name: "double the", re: /\bthe\s+(?:<[^>]+>\s*)*the\b/i },
    { name: "live the", re: /\blive\s+(?:<[^>]+>\s*)*the\b/i },
    { name: "static the", re: /\bstatic\s+(?:<[^>]+>\s*)*the\b/i },
    { name: "page the", re: /\bpage\s+(?:<[^>]+>\s*)*the\b/i },
    { name: "paren space the", re: /\(\s+the\b/i },
    { name: "double page", re: /<a[^>]*>[^<]*\bpage<\/a>\s+(?:AI\s+API\s+price\s+comparison\s+)?page\b/i },
    { name: "lowercase sentence start", re: /(?:<p>|<p\s+[^>]*>)\s*<a[^>]*>the\s+[a-z0-9]/i },
  ];

  const files = [];
  function collectHtml(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) collectHtml(full);
      else if (full.endsWith(".html")) files.push(full);
    }
  }
  collectHtml(seoRoot);

  const errors = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const p of patterns) {
      const regex = new RegExp(p.re.source, "gi");
      let match;
      while ((match = regex.exec(content)) !== null) {
        const snippet = content.slice(Math.max(0, match.index - 30), Math.min(content.length, match.index + 70)).replace(/\n/g, " ");
        errors.push(`${path.relative(root, file)}: [${p.name}] "${match[0]}" in "...${snippet}..."`);
      }
    }
  }
  assert.equal(errors.length, 0, `Found ${errors.length} phrase collision(s):\n${errors.join("\n")}`);
});

test("all internal /model/ and /pricing/ links across static SEO pages are valid and crawlable", () => {
  const files = [];
  function collectHtml(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) collectHtml(full);
      else if (full.endsWith(".html")) files.push(full);
    }
  }
  collectHtml(seoRoot);

  const errors = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file);

    // Check broken /model/* hrefs
    const modelMatches = [...content.matchAll(/href="\/model\/([^"#?]+)"/g)];
    for (const match of modelMatches) {
      const target = decodeURIComponent(match[1]);
      const targetFile = path.join(seoRoot, "model", `${target}.html`);
      if (!fs.existsSync(targetFile)) {
        errors.push(`${rel}: broken link href="/model/${target}" (file does not exist)`);
      }
    }

    // Check blocked /pricing/* hrefs
    const pricingMatches = [...content.matchAll(/href="(\/pricing\/[^"#?]+)"/g)];
    for (const match of pricingMatches) {
      errors.push(`${rel}: blocked link href="${match[1]}" (disallowed by robots.txt; use /pricing or /pricing-list)`);
    }
  }

  assert.equal(errors.length, 0, `Found ${errors.length} crawlability / link error(s):\n${errors.join("\n")}`);
});

test("model guide pages have zero self-referential circular links", () => {
  const modelDir = path.join(seoRoot, "model");
  const errors = [];
  for (const f of fs.readdirSync(modelDir).filter((x) => x.endsWith(".html"))) {
    const id = f.slice(0, -5);
    const text = fs.readFileSync(path.join(modelDir, f), "utf8");
    const re = new RegExp(`<a\\s+[^>]*href=["'](?:https://www\\.keyoapi\\.xyz)?/model/${id}(?:/|["'#])`, "gi");
    const matches = text.match(re);
    if (matches) {
      errors.push(`${f} contains ${matches.length} self-referential link(s) to /model/${id}`);
    }
  }
  assert.equal(errors.length, 0, `Found self-referential link(s):\n${errors.join("\n")}`);
});

test("deepseek pricing math and FAQ q7 link integrity", () => {
  const dsHtml = fs.readFileSync(path.join(seoRoot, "deepseek-api-pricing.html"), "utf8");
  assert.match(dsHtml, /\$12\.60/, "deepseek-api-pricing must have accurate math for 50M/10M v4.1-flash ($12.60)");
  assert.match(dsHtml, /\$35\.20/, "deepseek-api-pricing must have accurate math for 50M/10M v4-flash ($35.20)");
  assert.match(dsHtml, /deepseek-v4-flash-0731/, "deepseek-api-pricing must acknowledge snapshot tier");

  const faqHtml = fs.readFileSync(path.join(root, "static/brand/faq.html"), "utf8");
  const a7Tag = faqHtml.match(/<p\s+data-i18n-html="a7"[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(a7Tag, "FAQ a7 element must exist");
  assert.match(a7Tag[1], /href="\/pricing-list"/, "FAQ a7 must link to /pricing-list");
  assert.doesNotMatch(a7Tag[1], /href="\/pricing"/, "FAQ a7 must not link to /pricing");
  assert.doesNotMatch(faqHtml, /a7:\s*['"][^'"]*href="\/pricing"/, "No i18n a7 translation may link to /pricing");
  assert.match(faqHtml, /per second \/ 按秒计费|video models are per second/, "FAQ must mention per-second video billing");
});

test("video tools use their singular task endpoint consistently with the contract", () => {
  for (const page of ["video-enhance-pro-api-pricing.html", "subtitle-erase-pro-api-pricing.html"]) {
    const html = fs.readFileSync(path.join(seoRoot, page), "utf8");
    assert.doesNotMatch(html, /\/v1\/tasks\/\{id\}/, `${page} must not use the video-generation task route`);
    assert.match(html, /\/v1\/task\/\{id\}/, `${page} must use the tool task route`);
  }
});

test("deepseek pricing table has no broken confirm Keyo the phrasing", () => {
  const html = fs.readFileSync(path.join(seoRoot, "deepseek-api-pricing.html"), "utf8");
  assert.doesNotMatch(html, /confirm\s+Keyo\s+the/i, "deepseek-api-pricing must not contain broken confirm Keyo the");
  assert.match(html, /confirm live rates on <a href="\/pricing-list">the full pricing list<\/a>/, "deepseek-api-pricing must cleanly link to pricing list");
});

test("model guide pages have no lead and overview first-sentence duplication", () => {
  const modelDir = path.join(seoRoot, "model");
  const errors = [];
  function firstS(text) {
    const clean = text.replace(/<[^>]+>/g, "").trim();
    const m = clean.match(/^[\s\S]+?[.!?](?=\s|$)/);
    return m ? m[0].trim() : clean.slice(0, 100).trim();
  }
  for (const f of fs.readdirSync(modelDir).filter((x) => x.endsWith(".html"))) {
    const text = fs.readFileSync(path.join(modelDir, f), "utf8");
    const leadMatch = text.match(/<p class="lead">([\s\S]*?)<\/p>/);
    const overviewMatch = text.match(/<h2>Overview<\/h2>\s*<p>([\s\S]*?)<\/p>/);
    if (leadMatch && overviewMatch) {
      const s1 = firstS(leadMatch[1]);
      const s2 = firstS(overviewMatch[1]);
      if (s1 && s2 && s1.toLowerCase() === s2.toLowerCase()) {
        errors.push(`${f}: duplicate lead and overview first sentence ("${s1}")`);
      }
    }
    if (/<details>[\s\S]*?(?:See this page|Confirm on this page)/i.test(text)) {
      errors.push(`${f}: FAQ contains vague 'See this page' or 'Confirm on this page'`);
    }
  }
  assert.equal(errors.length, 0, `Found template issues:\n${errors.join("\n")}`);
});

test("FAQ legal labels are localized across ja, fr, ru, vi", () => {
  const faqHtml = fs.readFileSync(path.join(root, "static/brand/faq.html"), "utf8");
  assert.match(faqHtml, /プライバシーポリシー/, "Japanese FAQ must localize Privacy");
  assert.match(faqHtml, /Politique de confidentialité/, "French FAQ must localize Privacy");
  assert.match(faqHtml, /Политика конфиденциальности/, "Russian FAQ must localize Privacy");
  assert.match(faqHtml, /Chính sách bảo mật/, "Vietnamese FAQ must localize Privacy");
});

test("about model categories cards, deepseek cheapest title, and modern model recommendations", () => {
  const aboutHtml = fs.readFileSync(path.join(seoRoot, "about.html"), "utf8");
  assert.match(aboutHtml, /<span class="grid-title">Video generation<\/span>/, "about.html must format category title");
  assert.match(aboutHtml, /<span class="grid-meta">seedance-2\.5 &amp; Wan<\/span>/, "about.html must format category meta");

  const dsHtml = fs.readFileSync(path.join(seoRoot, "deepseek-api-pricing.html"), "utf8");
  assert.match(dsHtml, /<h2>Cheapest current-generation DeepSeek API rate on Keyo<\/h2>/, "deepseek-api-pricing must specify current-generation");
  assert.match(dsHtml, /standard current-generation DeepSeek Flash lane/i, "deepseek-api-pricing must not call v4.1-flash the cheapest (that is -1017)");
  assert.match(dsHtml, /deepseek-v4.1-flash-1017 is the recommended default for batch/i, "deepseek-api-pricing must route batch defaults to -1017");
  assert.doesNotMatch(dsHtml, /deepseek-v4.1-flash is the recommended default/i, "deepseek-api-pricing must not route batch defaults to the 7x standard lane");
  assert.doesNotMatch(dsHtml, /lowest absolute rate snapshot tier/i, "deepseek-api-pricing must not claim 0731 is the lowest absolute tier");

  // Superlative discipline: 'cheapest/lowest … overall' claims must account
  // for the gift-credit catalog (three prior review rounds caught the same
  // class of error). The openai FAQ names both the metered floor and the
  // gift-credit floor.
  const openaiHtml = fs.readFileSync(path.join(seoRoot, "openai-api-pricing.html"), "utf8");
  assert.match(openaiHtml, /cheapest metered chat lane/i, "openai-api-pricing FAQ must scope the cheapest claim to metered lanes");
  assert.match(openaiHtml, /gift-credit catalog at ~\$0\.01 \/ \$0\.04/i, "openai-api-pricing FAQ must name the gift-credit floor");
  assert.doesNotMatch(openaiHtml, /cheapest chat lane overall/i, "openai-api-pricing must not claim an overall cheapest metered lane");
  // Fifth-recurrence guard: generational qualifier required on twin superlatives
  // (gpt-6-luna is GPT-class too and cheaper than the 5.6 family).
  assert.doesNotMatch(openaiHtml, /cheapest GPT-class twin/i, "twin superlatives must carry a generational qualifier (GPT-5-class, not GPT-class)");
  assert.match(openaiHtml, /cheapest GPT-5-class twin/i, "openai-api-pricing FAQ must scope the twin claim to GPT-5-class");
  // Bulk-routing guard (three review rounds caught "recommend the expensive
  // model for high volume"): the Routing tip must name the cheapest metered
  // DeepSeek ID for bulk lanes, never the 22x legacy v4-flash.
  assert.match(openaiHtml, /bulk classification, tagging, and draft rewrites to gpt-5\.6-luna or deepseek-v4\.1-flash-1017/i, "openai Routing tip must route bulk lanes to the cheapest metered DeepSeek ID");
  // The generator linkifies raw paths into natural-word anchors — assert on hrefs.
  assert.match(openaiHtml, /Guides: <a href="\/model\/gpt-6-astra">[^<]*<\/a>, <a href="\/model\/deepseek-v4\.1-flash">[^<]*<\/a>, <a href="\/model\/kimi-k3">/, "openai Guides list must link each named model to its own page");
  assert.doesNotMatch(openaiHtml, /Guides: <a href="\/model\/deepseek-v4-flash"/, "openai Guides list must not point the v4.1-flash row at the 22x legacy page");

  // astra page: no cross-family flagship mispriced into Adjacent, no OpenAI
  // brand-ownership claims (H1/FAQ agreement).
  const astraHtml = fs.readFileSync(path.join(seoRoot, "model/gpt-6-astra.html"), "utf8");
  assert.doesNotMatch(astraHtml, /claude-fable-5-1/i, "astra Adjacent must not pair the 4x-more-expensive cross-family fable tier");
  assert.doesNotMatch(astraHtml, /OpenAI flagship/i, "astra must not claim OpenAI brand ownership");
  assert.match(astraHtml, /Keyo-hosted GPT-class Flagship Chat/, "astra H1 must be Keyo-hosted");

  // 10x per-call price fix (console: RMBG-2.0 / VajraV1 / Real-ESRGAN / AnimeSharp are $0.006849, not $0.0685)
  const rmbgHtml = fs.readFileSync(path.join(seoRoot, "model/RMBG-2.0.html"), "utf8");
  assert.match(rmbgHtml, /\$0\.00685 \/ request/, "RMBG-2.0 must carry the console per-call price");
  assert.doesNotMatch(rmbgHtml, /0\.0685/, "RMBG-2.0 must not carry the 10x price");
  // /compare astra row: no OpenAI brand ownership
  const compareHtml = fs.readFileSync(path.join(seoRoot, "compare.html"), "utf8");
  assert.doesNotMatch(compareHtml, /OpenAI model ID on Keyo/i, "compare must not claim OpenAI brand ownership for gpt-6-astra");
  // claude bulk lane -> -1017
  const claudeHtml = fs.readFileSync(path.join(seoRoot, "claude-api-pricing.html"), "utf8");
  assert.match(claudeHtml, /drafts to gpt-6-luna or deepseek-v4.1-flash-1017/i, "claude Routing tip must route bulk lanes to -1017");

  // Price-coherence guards (console is authoritative; the 2026-10 sweep caught
  // a 10x per-call slip and two 2x token-rate slips).
  const freeModelsHtml = fs.readFileSync(path.join(seoRoot, "free-models.html"), "utf8");
  assert.match(freeModelsHtml, /3\.6× base/, "gift twin rows must show the multiplier vs the base ID");
  assert.match(freeModelsHtml, /5× base/, "glm-5.3:free must show the 5x multiplier");
  // Guides must send new users to the cheapest metered ID (7x cheaper than v4.1-flash).
  for (const g of ["openai-compatible-api-python.html", "openai-compatible-api-nodejs.html", "openai-compatible-api-cursor.html"]) {
    const html = fs.readFileSync(path.join(root, "static/brand/blog", g), "utf8");
    assert.match(html, /deepseek-v4\.1-flash-1017/, `${g} must use the cheapest metered model in its example`);
    assert.doesNotMatch(html, /model[=:]\s*"deepseek-v4\.1-flash"/, `${g} must not use the 7x standard lane in examples`);
  }
  const fable5Html = fs.readFileSync(path.join(seoRoot, "model/claude-fable-5.html"), "utf8");
  assert.doesNotMatch(fable5Html, /8\.82 \/ \$44\.12/, "fable-5 must not carry the pre-correction rate");
  assert.match(fable5Html, /4\.41 \/ \$22\.06/, "fable-5 must carry the console rate");
  const kimiHtml = fs.readFileSync(path.join(seoRoot, "model/kimi-k3.html"), "utf8");
  assert.doesNotMatch(kimiHtml, /0\.20 \/ \$1\.02/, "kimi-k3 must not carry the pre-correction rate");
  assert.match(kimiHtml, /0\.41 \/ \$2\.04/, "kimi-k3 must carry the console rate");
  // Scattered-phrasing guard: the same wrong numbers must not survive in prose
  // ("approximately $0.20 per 1M input tokens ... $1.02 per 1M output").
  assert.doesNotMatch(kimiHtml, /\$0\.20\b/, "kimi-k3 must not carry $0.20 in any phrasing");
  assert.doesNotMatch(kimiHtml, /\$1\.02\b/, "kimi-k3 must not carry $1.02 in any phrasing");
  assert.doesNotMatch(kimiHtml, /93% cost reduction/, "kimi batch claim must be scoped to the list-price baseline");
  assert.doesNotMatch(kimiHtml, /14 times/, "kimi cross-comparison must not quote the 14x list-price number");
  assert.doesNotMatch(kimiHtml, /Gateway Uptime/i, "kimi must not publish uptime from a 15-request probe");
  const ccHtml = fs.readFileSync(path.join(seoRoot, "claude-code-api-pricing.html"), "utf8");
  assert.match(ccHtml, /4\.41175/, "claude-code exact table must carry fable-5 $4.41175");
  assert.match(ccHtml, /22\.05875/, "claude-code exact table must carry fable-5 $22.05875");

  const whisperHtml = fs.readFileSync(path.join(seoRoot, "model/whisper-large-v3.html"), "utf8");
  assert.match(whisperHtml, /gpt-6-luna for cost, claude-sonnet-5-5 for denser reasoning/, "whisper-large-v3 must recommend modern models");
  assert.doesNotMatch(whisperHtml, /gpt-5\.6-luna for cost, claude-sonnet-5 for denser reasoning/, "whisper-large-v3 must not recommend legacy models");
});

test("models index generation tags, about image card coherence, and clean related models", () => {
  const modelsHtml = fs.readFileSync(path.join(seoRoot, "models.html"), "utf8");
  assert.match(modelsHtml, /<th>Generation<\/th>/, "models.html must have Generation column");
  assert.match(modelsHtml, /<span class="meta">Previous gen<\/span>/, "models.html must tag previous gen models");
  assert.match(modelsHtml, /<span>Current<\/span>/, "models.html must tag current models");

  const aboutHtml = fs.readFileSync(path.join(seoRoot, "about.html"), "utf8");
  assert.match(aboutHtml, /<span class="grid-meta">nano-banana-2\.1 &amp; Pro<\/span>/, "about.html must show nano-banana-2.1 & Pro in image card");

  const dsProHtml = fs.readFileSync(path.join(seoRoot, "model/deepseek-v4-pro-0813.html"), "utf8");
  assert.doesNotMatch(dsProHtml, /href="\/model\/gpt-5\.6-terra"/, "deepseek-v4-pro-0813 must not link to gpt-5.6-terra in related");
  assert.match(dsProHtml, /href="\/model\/gpt-6-sol"/, "deepseek-v4-pro-0813 must link to gpt-6-sol in related");

  const mineruHtml = fs.readFileSync(path.join(seoRoot, "model/MinerU2.5-Pro.html"), "utf8");
  assert.doesNotMatch(mineruHtml, /href="\/model\/claude-sonnet-5"/, "MinerU2.5-Pro must not link to claude-sonnet-5 in related");
  assert.match(mineruHtml, /href="\/model\/claude-sonnet-5-5"/, "MinerU2.5-Pro must link to claude-sonnet-5-5 in related");
});
