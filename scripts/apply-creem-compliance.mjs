/**
 * Creem 合规：隐私政策 / 服务条款(+AUP) / 页脚客服邮箱 / 公告 / 品牌首页
 *
 *   node scripts/apply-creem-compliance.mjs
 */
import dns from "dns";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicBase = "https://www.keyoapi.xyz";
const supportEmail = process.env.KEYO_SUPPORT_EMAIL || "kopsail521@gmail.com";

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

async function reachable(url) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual" });
    return r.status >= 200 && r.status < 400;
  } catch {
    return false;
  }
}

const privacy = fs.readFileSync(path.join(root, "static/legal/privacy-policy.md"), "utf8");
const terms = fs.readFileSync(path.join(root, "static/legal/terms-of-service.md"), "utf8");
const aup = fs.readFileSync(path.join(root, "static/legal/acceptable-use-policy.md"), "utf8");
const termsWithAup = `${terms.trim()}\n\n---\n\n${aup.trim()}\n`;

const footerHtml = [
  `<div style="line-height:1.7">`,
  `<strong>KeyoAPI</strong> · OpenAI-compatible API gateway`,
  `<br/>`,
  `<a href="${publicBase}/privacy-policy">Privacy Policy</a>`,
  ` · `,
  `<a href="${publicBase}/user-agreement">Terms of Service</a>`,
  ` · `,
  `<a href="${publicBase}/user-agreement">Acceptable Use</a>`,
  ` · `,
  `Support: <a href="mailto:${supportEmail}">${supportEmail}</a>`,
  `</div>`,
].join("");

const notice = [
  `## Welcome to KeyoAPI`,
  ``,
  `OpenAI-compatible API for **chat** and **image** models. Prepaid credits. One Base URL, one API Key.`,
  ``,
  `- **Product:** Independent API gateway / reseller — not affiliated with OpenAI, Anthropic, Google, or other model vendors.`,
  `- **Pricing:** [Pricing](/pricing) · top up in [Wallet](/console/topup) via Creem`,
  `- **Docs:** [About / Docs](/about)`,
  `- **Support:** [${supportEmail}](mailto:${supportEmail})`,
  `- **Legal:** [Privacy Policy](/privacy-policy) · [Terms of Service](/user-agreement) · [Acceptable Use](/user-agreement)`,
  ``,
  `Sign up → top up → create a token → call \`https://www.keyoapi.xyz/v1\`.`,
].join("\n");

const aboutHtml = `<div style="max-width:860px;margin:0 auto;padding:24px 16px;line-height:1.7;font-size:15px">
<h1 style="margin:0 0 8px">KeyoAPI</h1>
<p style="color:#666;margin:0 0 8px">Prepaid OpenAI-compatible API credits for chat and image models (GPT / Claude / Gemini / DeepSeek and more).</p>
<p style="color:#666;margin:0 0 24px">Independent gateway — <strong>not affiliated</strong> with OpenAI, Anthropic, Google, or other model vendors.</p>
<p><strong>Support:</strong> <a href="mailto:${supportEmail}">${supportEmail}</a> ·
<a href="/privacy-policy">Privacy Policy</a> ·
<a href="/user-agreement">Terms &amp; Acceptable Use</a> ·
<a href="/pricing">Pricing</a></p>
<h2>1. Connection</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:16px">
<tr><td><b>Base URL</b></td><td><code>https://www.keyoapi.xyz/v1</code></td></tr>
<tr><td><b>API Key</b></td><td>Sign in → Tokens → create <code>sk-...</code></td></tr>
<tr><td><b>Auth</b></td><td><code>Authorization: Bearer sk-...</code></td></tr>
</table>
<h2>2. Chat</h2>
<pre style="background:#0b1020;color:#e8e8e8;padding:14px;border-radius:8px;overflow:auto">curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.6-luna","messages":[{"role":"user","content":"Hello"}]}'</pre>
<h2>3. Images</h2>
<p>Image prompts are screened against our Acceptable Use Policy (no NSFW / deepfakes).</p>
<pre style="background:#0b1020;color:#e8e8e8;padding:14px;border-radius:8px;overflow:auto">curl https://www.keyoapi.xyz/v1/images/generations \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"nano-banana-2","prompt":"a red circle","size":"1024x1024"}'</pre>
<h2>4. Get started</h2>
<ol>
<li>Register at <a href="https://www.keyoapi.xyz">https://www.keyoapi.xyz</a></li>
<li>Top up in Wallet (Creem)</li>
<li>Create a token and call the API</li>
</ol>
<p style="color:#666">Models: <code>GET /v1/models</code> · Pricing: <a href="/pricing">/pricing</a></p>
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

await put(h, "legal.privacy_policy", privacy);
await put(h, "legal.user_agreement", termsWithAup);
await put(h, "Footer", footerHtml);
await put(h, "Notice", notice);
await put(h, "SystemName", "KeyoAPI");
await put(h, "ServerAddress", publicBase);

const homeUrl = `${publicBase}/brand/keyo-home.html`;
const docsUrl = `${publicBase}/brand/keyo-docs.html`;
if (await reachable(homeUrl)) {
  await put(h, "HomePageContent", homeUrl);
  console.log("HomePageContent → brand home");
} else {
  await put(h, "HomePageContent", "");
  console.log("HomePageContent → builtin (brand home not reachable)");
}
if (await reachable(docsUrl)) {
  await put(h, "About", docsUrl);
  await put(h, "general_setting.docs_link", docsUrl);
} else {
  await put(h, "About", aboutHtml);
  await put(h, "general_setting.docs_link", `${publicBase}/about`);
}

console.log("\nPublic legal URLs:");
console.log(`  ${publicBase}/privacy-policy`);
console.log(`  ${publicBase}/user-agreement`);
console.log(`  Support: ${supportEmail}`);
