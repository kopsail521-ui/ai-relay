/**
 * 给 6 个模型补：介绍、图标、售价
 * 文本：ModelRatio + CompletionRatio（输入/输出）
 * 图片：ModelPrice（按次，美元）
 *
 * New API 规则（简版）：
 * - model_ratio = 1  约等于 输入 $2 / 百万 tokens
 * - completion_ratio = 输出价 / 输入价
 * - model_price = 每张图多少美元
 * - 汇率按站内 USDExchangeRate（默认 7.3）
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
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const FX = 7.3; // 与 New API 默认一致

// 售价取自你价格后台（人民币）→ 转成 New API 需要的倍率/单价
const CATALOG = [
  // gpt-5.6-sol / gpt-5.6-terra 已下线，换上游后再加回
  {
    model_name: "gpt-image-2",
    icon: "OpenAI",
    description:
      "文生图 / 图生图。约 1K 画质，适合普通配图。按张计费。",
    kind: "image",
    sellPerCallCny: 0.05,
  },
  {
    model_name: "gpt-image-2-vip",
    icon: "OpenAI",
    description:
      "高清画图。支持 1K / 2K / 4K。按张计费。",
    kind: "image",
    sellPerCallCny: 0.2,
  },
  {
    model_name: "nano-banana-pro",
    icon: "Gemini",
    description:
      "高质量出图，支持多种比例与分辨率。按张计费。",
    kind: "image",
    sellPerCallCny: 0.2,
  },
  {
    model_name: "nano-banana-2",
    icon: "Gemini",
    description:
      "新一代出图模型，速度快、效果好。按张计费。",
    kind: "image",
    sellPerCallCny: 0.15,
  },
];

function textRatios(sellInCny, sellOutCny) {
  const sellInUsd = sellInCny / FX;
  const modelRatio = sellInUsd / 2; // ratio=1 → $2/M
  const completionRatio = sellOutCny / sellInCny;
  return {
    modelRatio: Number(modelRatio.toFixed(6)),
    completionRatio: Number(completionRatio.toFixed(6)),
    sellInUsd: Number(sellInUsd.toFixed(4)),
    sellOutUsd: Number((sellOutCny / FX).toFixed(4)),
  };
}

function imagePrice(sellPerCallCny) {
  return Number((sellPerCallCny / FX).toFixed(6));
}

async function main() {
  const env = loadEnv();
  const base = (env.NEW_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

  const login = await fetch(`${base}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: env.NEW_API_ADMIN_USER,
      password: env.NEW_API_ADMIN_PASSWORD,
    }),
  });
  const lj = await login.json();
  if (!lj.success) throw new Error("登录失败: " + lj.message);
  const token = lj.data.access_token;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1) 更新介绍 + 图标
  const list = await (
    await fetch(`${base}/api/models/?page=1&page_size=100`, { headers })
  ).json();
  const items = list.data?.items || [];
  for (const cat of CATALOG) {
    const row = items.find((m) => m.model_name === cat.model_name);
    if (!row) {
      console.log("跳过（模型列表没有）", cat.model_name);
      continue;
    }
    const body = {
      ...row,
      description: cat.description,
      icon: cat.icon,
      endpoints: "",
      status: 1,
      sync_official: 0,
    };
    const r = await fetch(`${base}/api/models/`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    const j = await r.json();
    console.log("meta", cat.model_name, j.success ? "OK" : j.message);
  }

  // 2) 读现有价格 JSON 并合并
  const opts = await (await fetch(`${base}/api/option/`, { headers })).json();
  const map = Object.fromEntries((opts.data || []).map((o) => [o.key, o.value]));
  const modelRatio = JSON.parse(map.ModelRatio || "{}");
  const completionRatio = JSON.parse(map.CompletionRatio || "{}");
  const modelPrice = JSON.parse(map.ModelPrice || "{}");

  console.log("\n定价换算（汇率", FX, "）：");
  for (const cat of CATALOG) {
    if (cat.kind === "text") {
      const t = textRatios(cat.sellInCny, cat.sellOutCny);
      modelRatio[cat.model_name] = t.modelRatio;
      completionRatio[cat.model_name] = t.completionRatio;
      delete modelPrice[cat.model_name]; // 文本不要按次价
      console.log(
        cat.model_name,
        `售 ¥${cat.sellInCny}/¥${cat.sellOutCny} per M`,
        `→ $${t.sellInUsd}/$${t.sellOutUsd}`,
        `ratio=${t.modelRatio}`,
        `comp=${t.completionRatio}`
      );
    } else {
      const p = imagePrice(cat.sellPerCallCny);
      modelPrice[cat.model_name] = p;
      // 有按次价时，避免再走倍率；从 ratio 里删掉更干净
      delete modelRatio[cat.model_name];
      delete completionRatio[cat.model_name];
      console.log(
        cat.model_name,
        `售 ¥${cat.sellPerCallCny}/张`,
        `→ $${p}/张 (model_price)`
      );
    }
  }

  async function putOption(key, value) {
    const r = await fetch(`${base}/api/option/`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ key, value }),
    });
    const j = await r.json();
    console.log("option", key, j.success ? "OK" : j.message);
  }

  await putOption("ModelRatio", JSON.stringify(modelRatio));
  await putOption("CompletionRatio", JSON.stringify(completionRatio));
  await putOption("ModelPrice", JSON.stringify(modelPrice));

  console.log("\n完成。刷新 New API「模型」页面即可看到介绍/图标；价格在「系统设置 → 模型相关」里。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
