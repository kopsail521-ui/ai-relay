/**
 * 写入 KeyoAPI 站点品牌（多语言首页 / 关于 / 页脚）
 *
 * 用法：
 *   node scripts/apply-site-branding.mjs
 *
 * 依赖：VPS 已部署 static/brand/*.html 到 /opt/ai-relay/static/brand
 *       且 Caddy 已配置 handle_path /brand/*
 *
 * 环境变量：
 *   BRAND_MODE=url     使用 /brand 多语言页（默认，需静态文件已上线）
 *   BRAND_MODE=builtin 清空自定义首页，改用 New API 内置多语言首页
 */
import dns from "dns";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Some Windows/Node setups time out on IPv6 for this host; prefer IPv4.
dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mode = (process.env.BRAND_MODE || "url").toLowerCase();
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
  return j.success;
}

async function brandUrlReachable(url) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual" });
    return r.status >= 200 && r.status < 400;
  } catch {
    return false;
  }
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

const homeUrl = `${publicBase}/brand/keyo-home.html`;
const docsUrl = `${publicBase}/brand/keyo-docs.html`;

let useUrl = mode === "url";
if (useUrl) {
  const okHome = await brandUrlReachable(homeUrl);
  const okDocs = await brandUrlReachable(docsUrl);
  if (!okHome || !okDocs) {
    console.warn(
      "Brand static pages not reachable yet — falling back to builtin i18n home.\n" +
        `  home: ${homeUrl} => ${okHome}\n` +
        `  docs: ${docsUrl} => ${okDocs}\n` +
        "Deploy static/brand via scripts/deploy-brand-static.sh then re-run."
    );
    useUrl = false;
  }
}

await put(h, "SystemName", "KeyoAPI");
await put(h, "ServerAddress", publicBase);
await put(h, "SelfUseModeEnabled", "false");
await put(h, "RegisterEnabled", "true");
await put(h, "PasswordRegisterEnabled", "true");
await put(h, "QuotaForNewUser", "0");
await put(h, "QuotaForInviter", "0");
await put(h, "QuotaForInvitee", "0");
await put(h, "general_setting.docs_link", useUrl ? docsUrl : `${publicBase}/about`);

// Footer must stay language-neutral — custom Footer is NOT passed through i18n.
await put(h, "Footer", "KeyoAPI · One endpoint, many models");
await put(h, "UserUsableGroups", JSON.stringify({ default: "Default", vip: "VIP" }));

if (useUrl) {
  await put(h, "HomePageContent", homeUrl);
  await put(h, "About", docsUrl);
  console.log("\nMode: url (multilingual brand pages at /brand)");
} else {
  // CRITICAL: never leave Chinese-only HTML here — New API strips <script>,
  // so inline HomePageContent cannot follow the language switcher.
  // Empty = built-in React home (en / zhCN / zhTW / ja / fr / ru / vi).
  await put(h, "HomePageContent", "");
  const aboutFallback = `<div style="max-width:860px;margin:0 auto;padding:24px 16px;line-height:1.7;font-size:15px">
<h1 style="margin:0 0 8px">KeyoAPI Integration Docs</h1>
<p style="color:#666;margin:0 0 24px">One Base URL + one API Key. OpenAI-compatible — Cursor / ChatBox / official SDKs.</p>
<p style="color:#666">Switch the site language in the header for the console UI. Full multilingual docs will load from /brand after static pages are deployed.</p>
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
  await put(h, "About", aboutFallback);
  console.log("\nMode: builtin (New API i18n home; About English fallback)");
  console.log("Deploy brand pages, then re-run with BRAND_MODE=url:");
  console.log("  scp -r static/brand root@VPS:/opt/ai-relay/static/");
  console.log("  ssh root@VPS 'bash -s' < scripts/deploy-brand-static.sh");
}

await put(h, "oidc.display_name", "Google");
await put(
  h,
  "oidc.well_known",
  "https://accounts.google.com/.well-known/openid-configuration"
);
await put(h, "oidc.authorization_endpoint", "https://accounts.google.com/o/oauth2/v2/auth");
await put(h, "oidc.token_endpoint", "https://oauth2.googleapis.com/token");
await put(h, "oidc.user_info_endpoint", "https://openidconnect.googleapis.com/v1/userinfo");

console.log("\nDone. Open https://www.keyoapi.xyz — switch language in the header.");
