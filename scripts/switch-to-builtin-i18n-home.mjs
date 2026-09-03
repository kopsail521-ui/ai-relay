/**
 * Point live site at New API built-in i18n home (no iframe), keep docs on /brand if present.
 *   node scripts/switch-to-builtin-i18n-home.mjs
 */
import dns from "dns";
import fs from "fs";
dns.setDefaultResultOrder("ipv4first");

function loadEnv() {
  const e = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    e[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return e;
}

async function put(h, key, value) {
  const r = await fetch("https://www.keyoapi.xyz/api/option/", {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ key, value }),
  });
  const j = await r.json();
  console.log(key, j.success ? "OK" : j.message || JSON.stringify(j));
  if (!j.success) throw new Error(key);
}

const env = loadEnv();
const login = await fetch("https://www.keyoapi.xyz/api/user/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: env.NEW_API_ADMIN_USER,
    password: env.NEW_API_ADMIN_PASSWORD,
  }),
});
const lj = await login.json();
if (!lj.success) throw new Error("login failed");
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
const h = {
  Authorization: `Bearer ${lj.data.access_token}`,
  "Content-Type": "application/json",
};
if (cookie) h.Cookie = cookie;

// Empty = React home with full i18n (7 languages). Custom iframe hosts block framing.
await put(h, "HomePageContent", "");
await put(h, "Footer", "KeyoAPI · One endpoint, many models");
await put(h, "SystemName", "KeyoAPI");

// Prefer same-origin /brand docs if reachable; else light English About HTML.
const docsUrl = "https://www.keyoapi.xyz/brand/keyo-docs.html";
let docsOk = false;
try {
  const r = await fetch(docsUrl);
  const t = await r.text();
  docsOk = r.ok && t.length > 3000;
} catch {}

if (docsOk) {
  await put(h, "About", docsUrl);
  await put(h, "general_setting.docs_link", docsUrl);
  console.log("Docs still on /brand (update file on VPS for full i18n)");
} else {
  const about = `<div style="max-width:860px;margin:0 auto;padding:24px 16px;line-height:1.7">
<h1>KeyoAPI Docs</h1>
<p>One Base URL + one API Key. OpenAI-compatible.</p>
<p><b>Base URL</b>: <code>https://www.keyoapi.xyz/v1</code></p>
<p>Switch language in the header for the console. Multilingual brand docs load after /brand is updated on the VPS.</p>
</div>`;
  await put(h, "About", about);
  await put(h, "general_setting.docs_link", "https://www.keyoapi.xyz/about");
}

console.log("\nDone. Hard-refresh https://www.keyoapi.xyz — hero follows 文A.");
