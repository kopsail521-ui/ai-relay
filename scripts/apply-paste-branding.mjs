/**
 * Point live HomePageContent / About / docs_link at temporary paste.rs
 * multilingual brand pages (until /brand is deployed on VPS).
 *
 *   node scripts/apply-paste-branding.mjs
 */
import dns from "dns";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicBase = "https://www.keyoapi.xyz";

// Temporary public mirrors of static/brand/*.html
const homeUrl = process.env.HOME_URL || "https://paste.rs/a35Jt";
const docsUrl = process.env.DOCS_URL || "https://paste.rs/S54zn";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function put(h, key, value) {
  const r = await fetch(`${publicBase}/api/option/`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ key, value }),
  });
  const j = await r.json();
  console.log(key, j.success ? "OK" : j.message || JSON.stringify(j));
  if (!j.success) throw new Error(`failed: ${key}`);
}

const env = loadEnv();
const loginRes = await fetch(`${publicBase}/api/user/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: env.NEW_API_ADMIN_USER,
    password: env.NEW_API_ADMIN_PASSWORD,
  }),
});
const setCookie = loginRes.headers.getSetCookie?.() || [];
const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
const lj = await loginRes.json();
if (!lj.success) throw new Error("login failed: " + JSON.stringify(lj));

const h = {
  Authorization: `Bearer ${lj.data.access_token}`,
  "Content-Type": "application/json",
};
if (cookie) h.Cookie = cookie;

for (const [name, url] of [
  ["home", homeUrl],
  ["docs", docsUrl],
]) {
  const r = await fetch(url);
  const t = await r.text();
  console.log(`probe ${name}`, r.status, "len", t.length, "has i18n", t.includes("keyo-brand-ready"));
  if (!r.ok || !t.includes("keyo-brand-ready")) {
    throw new Error(`${name} URL not usable: ${url}`);
  }
}

await put(h, "SystemName", "KeyoAPI");
await put(h, "HomePageContent", homeUrl);
await put(h, "About", docsUrl);
await put(h, "general_setting.docs_link", docsUrl);
await put(h, "Footer", "KeyoAPI · One endpoint, many models");

console.log("\nDone. Hard-refresh https://www.keyoapi.xyz");
console.log("Switch language in header — homepage + About/Docs should follow.");
console.log("Later: deploy static/brand to VPS /brand and run apply-site-branding.mjs");
