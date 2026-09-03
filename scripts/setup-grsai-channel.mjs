/**
 * 在 New API 里创建 Grsai 上游渠道（OpenAI 兼容）
 * 用法：node scripts/setup-grsai-channel.mjs
 * 需先：1) New API 已启动  2) 已初始化管理员  3) .env 已配置
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("缺少 .env，请复制 .env.example 并填写 GRSAI_API_KEY、NEW_API_ADMIN_PASSWORD");
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const cfg = JSON.parse(
  fs.readFileSync(path.join(root, "config/grsai.json"), "utf8")
);

const NEW_API_BASE = (env.NEW_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const GRSAI_KEY = env.GRSAI_API_KEY;
const GRSAI_BASE = (env.GRSAI_BASE_URL || cfg.baseUrlGlobal).replace(/\/$/, "");
const ADMIN_USER = env.NEW_API_ADMIN_USER || "root";
const ADMIN_PASS = env.NEW_API_ADMIN_PASSWORD;

if (!GRSAI_KEY || GRSAI_KEY.includes("your-key")) {
  console.error("请在 .env 中设置 GRSAI_API_KEY");
  process.exit(1);
}
if (!ADMIN_PASS) {
  console.error("请在 .env 中设置 NEW_API_ADMIN_PASSWORD（New API 管理员密码）");
  process.exit(1);
}

const MODELS = cfg.models.map((m) => m.id).join(",");

async function login() {
  const res = await fetch(`${NEW_API_BASE}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`登录失败: ${data.message || JSON.stringify(data)}`);
  }
  const accessToken = data?.data?.access_token;
  if (!accessToken) {
    throw new Error("登录成功但未返回 access_token，请检查 New API 版本");
  }
  // 同时带上 refresh cookie（若有）
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { accessToken, cookieHeader };
}

function authHeaders(auth) {
  const h = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
  };
  if (auth.cookieHeader) h.Cookie = auth.cookieHeader;
  return h;
}

async function listChannels(auth) {
  const res = await fetch(`${NEW_API_BASE}/api/channel/`, {
    headers: authHeaders(auth),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "获取渠道失败");
  // 有的版本返回 { data: { items: [] } } 或数组
  const raw = data.data;
  if (Array.isArray(raw)) return raw;
  if (raw?.items && Array.isArray(raw.items)) return raw.items;
  return [];
}

async function addChannel(auth) {
  const body = {
    mode: "single",
    channel: {
      type: 1,
      key: GRSAI_KEY,
      name: "Grsai 上游",
      base_url: GRSAI_BASE,
      models: MODELS,
      group: "default",
      priority: 0,
      weight: 1,
      status: 1,
      auto_ban: 0,
    },
  };
  const res = await fetch(`${NEW_API_BASE}/api/channel/`, {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || JSON.stringify(data));
  return data;
}

async function main() {
  console.log("New API:", NEW_API_BASE);
  console.log("Grsai Base:", GRSAI_BASE);
  console.log("Models:", MODELS);

  const statusRes = await fetch(`${NEW_API_BASE}/api/status`);
  const status = await statusRes.json();
  if (status?.data?.setup === false) {
    console.error("\n请先在浏览器打开", NEW_API_BASE, "完成管理员初始化");
    process.exit(1);
  }

  const auth = await login();
  console.log("管理员登录成功");

  const existing = await listChannels(auth);
  const dup = existing.find(
    (c) => c.name === "Grsai 上游" || (c.base_url && String(c.base_url).includes("grsai"))
  );
  if (dup) {
    console.log("\n已存在 Grsai 渠道 (id=%s)，跳过创建。如需重建请先在后台删除。", dup.id);
    return;
  }

  const result = await addChannel(auth);
  console.log("\n渠道创建成功:", result.message || "OK");
  console.log("\n客户统一接入：");
  console.log("  Base URL:", `${NEW_API_BASE}/v1`);
  console.log("  文本: POST /v1/chat/completions  model=gpt-5.6-sol | gpt-5.6-terra");
  console.log("  图片: POST /v1/images/generations  model=gpt-image-2 | nano-banana-2 ...");
  console.log("\n在 New API 后台「令牌」里创建 API Key 发给客户。");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
