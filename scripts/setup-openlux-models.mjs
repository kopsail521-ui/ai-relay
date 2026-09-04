/**
 * 将 OpenLux 选型模型同步到 New API：渠道 models + ModelRatio/CompletionRatio + 模型广场 meta
 * 用法：node scripts/setup-openlux-models.mjs
 * 也可只加一个：node scripts/setup-openlux-models.mjs claude-fable-5-1
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
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
  fs.readFileSync(path.join(root, "config/openlux-selected-models.json"), "utf8")
);

const NEW_API_BASE = (env.NEW_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const OPENLUX_KEY = env.OPENLUX_API_KEY;
const OPENLUX_BASE = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const ADMIN_USER = env.NEW_API_ADMIN_USER || "root";
const ADMIN_PASS = env.NEW_API_ADMIN_PASSWORD;
const CHANNEL_NAME = env.OPENLUX_CHANNEL_NAME || "OpenLux 上游";
const only = process.argv[2] || "";

if (!OPENLUX_KEY || /your|changeme|placeholder/i.test(OPENLUX_KEY)) {
  console.error("请在 .env 设置 OPENLUX_API_KEY");
  process.exit(1);
}
if (!ADMIN_PASS) {
  console.error("请在 .env 设置 NEW_API_ADMIN_PASSWORD");
  process.exit(1);
}

const models = only
  ? cfg.models.filter((m) => m.model === only)
  : cfg.models;
if (!models.length) {
  console.error("未找到模型", only || "(empty)");
  process.exit(1);
}

const EP_CHAT = JSON.stringify({ openai: "/v1/chat/completions" });
const EP_VIDEO = JSON.stringify({ "openai-video": "/v1/videos" });

function isVideoModel(m) {
  return m.billing === "model_price" || m.our_model_price != null;
}
async function login() {
  const res = await fetch(`${NEW_API_BASE}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`登录失败: ${data.message || JSON.stringify(data)}`);
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

async function api(auth, method, pathName, body) {
  const res = await fetch(`${NEW_API_BASE}${pathName}`, {
    method,
    headers: authHeaders(auth),
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    throw new Error(`${method} ${pathName}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

async function listChannels(auth) {
  const data = await api(auth, "GET", "/api/channel/");
  const raw = data.data;
  if (Array.isArray(raw)) return raw;
  if (raw?.items && Array.isArray(raw.items)) return raw.items;
  return [];
}

function vendorFor(name) {
  const s = name.toLowerCase();
  if (s.includes("claude")) return { vendor: "Anthropic", icon: "Claude.Color" };
  if (s.startsWith("gpt-") || s.includes("chatgpt")) return { vendor: "OpenAI", icon: "OpenAI" };
  if (s.includes("gemini") || s.startsWith("gemma")) return { vendor: "Google", icon: "Gemini.Color" };
  if (s.includes("deepseek")) return { vendor: "DeepSeek", icon: "DeepSeek.Color" };
  if (s.includes("grok")) return { vendor: "xAI", icon: "XAI" };
  if (s.includes("kimi") || s.includes("moonshot")) return { vendor: "Moonshot", icon: "Moonshot" };
  if (s.includes("glm") || s.includes("zhipu")) return { vendor: "智谱", icon: "Zhipu.Color" };
  if (s.includes("minimax")) return { vendor: "MiniMax", icon: "Minimax.Color" };
  if (s.includes("qwen")) return { vendor: "阿里巴巴", icon: "Qwen.Color" };
  return { vendor: "其他", icon: "Custom" };
}

async function ensureChannel(auth) {
  const channels = await listChannels(auth);
  const allIds = [...new Set(cfg.models.map((m) => m.model))];
  const existing =
    channels.find((c) => c.name === CHANNEL_NAME) ||
    channels.find((c) => String(c.base_url || "").includes("openlux.ai"));

  if (!existing) {
    console.log("创建渠道", CHANNEL_NAME);
    await api(auth, "POST", "/api/channel/", {
      mode: "single",
      channel: {
        type: 1,
        key: OPENLUX_KEY,
        name: CHANNEL_NAME,
        base_url: OPENLUX_BASE,
        models: allIds.join(","),
        group: "default",
        priority: 0,
        weight: 1,
        status: 1,
        auto_ban: 0,
        test_model: allIds.includes("claude-fable-5-1")
          ? "claude-fable-5-1"
          : allIds[0],
      },
    });
    return;
  }

  const have = new Set(
    String(existing.models || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  for (const id of allIds) have.add(id);
  const merged = [...have].join(",");
  console.log("更新渠道", existing.id, existing.name, "models→", merged.split(",").length);
  const body = {
    ...existing,
    key: OPENLUX_KEY,
    name: CHANNEL_NAME,
    base_url: OPENLUX_BASE.replace(/\/v1\/?$/, ""),
    models: merged,
    status: 1,
  };
  await api(auth, "PUT", "/api/channel/", body);
}

async function putOption(auth, key, value) {
  await api(auth, "PUT", "/api/option/", { key, value });
}

async function ensurePricing(auth) {
  const opts = await api(auth, "GET", "/api/option/");
  const map = Object.fromEntries((opts.data || []).map((o) => [o.key, o.value]));
  const modelRatio = JSON.parse(map.ModelRatio || "{}");
  const completionRatio = JSON.parse(map.CompletionRatio || "{}");
  const modelPrice = JSON.parse(map.ModelPrice || "{}");

  for (const m of models) {
    if (isVideoModel(m)) {
      modelPrice[m.model] = m.our_model_price;
      delete modelRatio[m.model];
      delete completionRatio[m.model];
      console.log(
        "定价",
        m.model,
        `ModelPrice $${m.our_model_price}`,
        `(OpenLux $${m.cost_usd || m.openlux_model_price} × ${m.markup || 2.5})`
      );
      continue;
    }
    modelRatio[m.model] = m.our_model_ratio;
    completionRatio[m.model] = m.our_completion_ratio;
    delete modelPrice[m.model];
    console.log(
      "定价",
      m.model,
      `in/out $${m.sell_in_usd}/$${m.sell_out_usd}`,
      `ratio=${m.our_model_ratio}`,
      `comp=${m.our_completion_ratio}`
    );
  }

  await putOption(auth, "ModelRatio", JSON.stringify(modelRatio));
  await putOption(auth, "CompletionRatio", JSON.stringify(completionRatio));
  await putOption(auth, "ModelPrice", JSON.stringify(modelPrice));
}

async function ensureMarketplace(auth) {
  // 拉取已有模型
  let list = [];
  try {
    const data = await api(auth, "GET", "/api/models/?p=0&page_size=500");
    list = data.data?.items || data.data || [];
    if (!Array.isArray(list)) list = [];
  } catch (e) {
    console.warn("拉取 models 列表失败，尝试其它路径:", e.message);
    try {
      const data = await api(auth, "GET", "/api/models/");
      list = data.data?.items || data.data || [];
      if (!Array.isArray(list)) list = [];
    } catch (e2) {
      console.warn("跳过模型广场写入:", e2.message);
      return;
    }
  }

  // vendors
  let vendors = [];
  try {
    const v = await api(auth, "GET", "/api/vendors/?p=0&page_size=200");
    vendors = v.data?.items || v.data || [];
    if (!Array.isArray(vendors)) vendors = [];
  } catch {
    vendors = [];
  }
  const vendorId = Object.fromEntries(vendors.map((x) => [x.name, x.id]));

  for (const m of models) {
    const meta = vendorFor(m.model);
    let vid = vendorId[meta.vendor];
    if (!vid) {
      console.warn("缺少供应商", meta.vendor, "— 仅写 tags/endpoints 若模型已存在");
    }
    const existing = list.find((x) => x.model_name === m.model);
    const video = isVideoModel(m);
    const descMap = {
      "claude-fable-5-1": "Claude 旗舰 5.1 · 长周期 Agent / 复杂编码 / 重度知识分析",
      "gemini-3.8-flash": "Gemini 3.8 Flash · 更快更强的多模态轻量模型",
      "grok-imagine-video-1.5-preview": "Grok Imagine Video 1.5 Preview · 按秒 $0.08825(480p)/$0.1545(720p)",
      "grok-1.5-video": "Grok 1.5 Video · 按次 $0.60675/次（上游 $0.2427×2.5）",
      "veo_3_1-components": "Google Veo 3.1 Components：约 8 秒 · $0.14125/次",
    };
    const payload = {
      model_name: m.model,
      description: descMap[m.model] || existing?.description || "",
      icon: meta.icon,
      tags: video ? "视频" : "大语言模型",
      vendor_id: vid || existing?.vendor_id || 0,
      endpoints: video ? EP_VIDEO : EP_CHAT,
      status: 1,
      sync_official: 0,
    };
    if (existing?.id) {
      await api(auth, "PUT", "/api/models/", { ...existing, ...payload, id: existing.id });
      console.log("meta update", m.model);
    } else {
      try {
        await api(auth, "POST", "/api/models/", payload);
        console.log("meta create", m.model);
      } catch (e) {
        console.warn("meta create failed", m.model, e.message);
      }
    }
  }
}

async function main() {
  console.log("New API:", NEW_API_BASE);
  console.log("OpenLux:", OPENLUX_BASE);
  console.log(
    "Models:",
    models.map((m) => m.model).join(", ")
  );
  const auth = await login();
  console.log("登录成功");
  await ensureChannel(auth);
  await ensurePricing(auth);
  await ensureMarketplace(auth);
  console.log("DONE_OPENLUX_MODELS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
