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
const modelIds = new Set(modelPages.map((model) => model.id));
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
