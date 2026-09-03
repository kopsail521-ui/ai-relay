/**
 * Fix live KeyoAPI language: remove Chinese-only custom HTML so New API
 * built-in i18n (7 languages) drives the homepage; neutralize other stuck Chinese.
 *
 *   node scripts/fix-live-i18n.mjs
 */
import dns from "dns";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicBase = "https://www.keyoapi.xyz";

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

const aboutEn = `<div style="max-width:860px;margin:0 auto;padding:24px 16px;line-height:1.7;font-size:15px">
<h1 style="margin:0 0 8px">KeyoAPI Integration Docs</h1>
<p style="color:#666;margin:0 0 24px">One Base URL + one API Key. OpenAI-compatible — Cursor / ChatBox / official SDKs.</p>
<p style="color:#666;margin:0 0 24px">Switch the site language in the header (文A). Console UI follows your choice. Full multilingual branded docs load from <code>/brand</code> after static pages are deployed on the VPS.</p>
<h2>1. Connection</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:16px">
<tr><td><b>Base URL</b></td><td><code>https://www.keyoapi.xyz/v1</code></td></tr>
<tr><td><b>API Key</b></td><td>Sign in → Tokens → create <code>sk-...</code></td></tr>
<tr><td><b>Auth</b></td><td><code>Authorization: Bearer sk-...</code></td></tr>
</table>
<h2>2. Chat</h2>
<p><code>POST /v1/chat/completions</code></p>
<pre style="background:#0b1020;color:#e8e8e8;padding:14px;border-radius:8px;overflow:auto">curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.6-luna","messages":[{"role":"user","content":"Hello"}]}'</pre>
<h2>3. Images</h2>
<p><code>POST /v1/images/generations</code></p>
<pre style="background:#0b1020;color:#e8e8e8;padding:14px;border-radius:8px;overflow:auto">curl https://www.keyoapi.xyz/v1/images/generations \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"nano-banana-2","prompt":"a red circle","size":"1024x1024"}'</pre>
<h2>4. Sign up</h2>
<ol>
<li>Open <a href="https://www.keyoapi.xyz">https://www.keyoapi.xyz</a> and register.</li>
<li>Top up, create a token, call the API.</li>
</ol>
<p style="color:#666">Models: <code>GET /v1/models</code></p>
</div>`;

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

// Empty = New API React home (already translated for en/zhCN/zhTW/ja/fr/ru/vi)
await put(h, "HomePageContent", "");
await put(h, "Footer", "KeyoAPI · One endpoint, many models");
await put(h, "About", aboutEn);
await put(h, "general_setting.docs_link", `${publicBase}/about`);
await put(h, "UserUsableGroups", JSON.stringify({ default: "Default", vip: "VIP" }));
await put(
  h,
  "PayMethods",
  JSON.stringify([
    { icon: "SiAlipay", name: "Alipay", type: "alipay" },
    { icon: "SiWechat", name: "WeChat Pay", type: "wxpay" },
    { icon: "LuCreditCard", min_topup: "50", name: "Card / Other", type: "custom1" },
  ])
);

console.log("\nDone. Hard-refresh https://www.keyoapi.xyz and switch language (文A).");
console.log("Homepage now uses New API built-in i18n (7 languages).");
console.log("After deploying static/brand on VPS, run: node scripts/apply-site-branding.mjs");
