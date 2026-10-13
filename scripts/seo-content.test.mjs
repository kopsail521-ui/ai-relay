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
