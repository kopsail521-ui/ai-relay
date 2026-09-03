/**
 * 在 New API 创建/更新「Gitee 模力方舟」上游渠道（OpenAI 兼容 type=1）
 * 用法：node scripts/setup-gitee-channel.mjs
 * 需：.env 配置 GITEE_API_KEY、NEW_API_ADMIN_*，New API 已启动
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("缺少 .env，请复制 .env.example 并填写 GITEE_API_KEY、NEW_API_ADMIN_PASSWORD");
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
  fs.readFileSync(path.join(root, "config/gitee-selected-models.json"), "utf8")
);

const NEW_API_BASE = (env.NEW_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const GITEE_KEY = env.GITEE_API_KEY || env.GITEE_TOKEN;
// New API type=1 会再拼 /v1/...，渠道 base_url 只能写到域名，不能带 /v1
// 错误：https://ai.gitee.com/v1 → 实际请求 /v1/v1/chat/completions → 404 Resource not found
const GITEE_BASE = (env.GITEE_BASE_URL || cfg.baseUrl || "https://ai.gitee.com")
  .replace(/\/$/, "")
  .replace(/\/v1$/i, "");
const ADMIN_USER = env.NEW_API_ADMIN_USER || "root";
const ADMIN_PASS = env.NEW_API_ADMIN_PASSWORD;
const CHANNEL_NAME = "Gitee 模力方舟";
// 渠道测试默认走 chat/completions；列表第一个是 VajraV1 等 CV 模型会 404
const TEST_MODEL = "gemma-4-26B-A4B-it";

if (!GITEE_KEY || /your-?key|placeholder|changeme/i.test(GITEE_KEY)) {
  console.error("请在 .env 中设置 GITEE_API_KEY（模力方舟访问令牌）");
  process.exit(1);
}
if (!ADMIN_PASS) {
  console.error("请在 .env 中设置 NEW_API_ADMIN_PASSWORD");
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
  if (!accessToken) throw new Error("登录成功但未返回 access_token");
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
      key: GITEE_KEY,
      name: CHANNEL_NAME,
      base_url: GITEE_BASE,
      models: MODELS,
      group: "default",
      priority: 0,
      weight: 1,
      status: 1,
      auto_ban: 0,
      test_model: TEST_MODEL,
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

async function updateChannel(auth, existing) {
  const body = {
    ...existing,
    key: GITEE_KEY,
    name: CHANNEL_NAME,
    base_url: GITEE_BASE,
    models: MODELS,
    status: 1,
    test_model: TEST_MODEL,
  };
  // 有的版本更新不需要再传完整 key；若 key 为空则保留原 key
  if (!GITEE_KEY) delete body.key;
  const res = await fetch(`${NEW_API_BASE}/api/channel/`, {
    method: "PUT",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || JSON.stringify(data));
  return data;
}

async function main() {
  console.log("New API:", NEW_API_BASE);
  console.log("Gitee Base:", GITEE_BASE);
  console.log("Models (%d):", cfg.models.length, MODELS);

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
    (c) =>
      c.name === CHANNEL_NAME ||
      (c.base_url && String(c.base_url).includes("ai.gitee.com"))
  );

  if (dup) {
    console.log("已存在渠道 id=%s，更新 models/base_url ...", dup.id);
    await updateChannel(auth, dup);
    console.log("渠道更新成功");
  } else {
    const result = await addChannel(auth);
    console.log("渠道创建成功:", result.message || "OK");
  }

  console.log("\n分类摘要：");
  for (const [cat, ids] of Object.entries(cfg.categories || {})) {
    console.log(`  ${cat}: ${ids.join(", ")}`);
  }
  console.log("\n客户统一接入 Base URL:", `${NEW_API_BASE}/v1`);
  console.log("原生可走 New API 的：chat / audio/transcriptions|speech / moderations");
  console.log("自定义 CV/异步路径请走 Gitee 透传服务（见 services/gitee-passthrough）");
  console.log("接着运行: node scripts/setup-gitee-pricing.mjs");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
