/**

 * 为 Gitee 选型模型写入 New API：介绍 + ModelRatio/CompletionRatio/ModelPrice（×5 售价）

 * 用法：node scripts/setup-gitee-pricing.mjs

 *

 * 对外简介不写上游名、不加价倍率，只保留类目 + 能力 + 售价。

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



const cfg = JSON.parse(

  fs.readFileSync(path.join(root, "config/gitee-selected-models.json"), "utf8")

);



const ICON_BY_CAT = {

  chat_vlm: "Google",

  vision_cv: "Custom",

  image_process: "Custom",

  document_ocr: "Custom",

  digital_human: "Custom",

  asr: "OpenAI",

  tts: "Custom",

  moderation: "OpenAI",

};



function publicDescription(m) {
  const FX = cfg.fx || 7.3;
  const bill = m.billing || {};
  const unitEn = {
    per_call: "request",
    per_second: "second",
    per_page: "page",
    per_char: "character",
    per_10k_chars: "10K characters",
  };
  const base = String(m.description || "").replace(/\s+/g, " ").trim();
  if (bill.mode === "token") {
    const inUsd = ((bill.sell_in_cny_per_m || 0) / FX).toFixed(4);
    const outUsd = ((bill.sell_out_cny_per_m || bill.sell_in_cny_per_m || 0) / FX).toFixed(4);
    return `${base} Pricing: $${Number(inUsd)} input / $${Number(outUsd)} output per 1M tokens.`;
  }
  const p = bill.model_price_usd ?? (bill.sell_cny || 0) / FX;
  const u = unitEn[bill.unit] || "request";
  return `${base} Pricing: $${Number(Number(p).toFixed(6))} / ${u}.`;
}



async function main() {

  const env = loadEnv();

  const base = (env.NEW_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");



  async function api(pathname, { method = "GET", body, token } = {}) {

    const headers = {

      "Content-Type": "application/json",

      Accept: "application/json",

      "Accept-Encoding": "identity",

    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${base}${pathname}`, {

      method,

      headers,

      body: body ? JSON.stringify(body) : undefined,

    });

    const text = await res.text();

    let json;

    try {

      json = JSON.parse(text);

    } catch {

      throw new Error(`${method} ${pathname} HTTP ${res.status}: ${text.slice(0, 200)}`);

    }

    return json;

  }



  const lj = await api("/api/user/login", {

    method: "POST",

    body: {

      username: env.NEW_API_ADMIN_USER,

      password: env.NEW_API_ADMIN_PASSWORD,

    },

  });

  if (!lj.success) throw new Error("登录失败: " + lj.message);

  const token = lj.data.access_token;



  let items = [];

  for (let page = 1; page <= 20; page++) {

    const list = await api(`/api/models/?page=${page}&page_size=100`, { token });

    const batch = list.data?.items || [];

    items = items.concat(batch);

    if (batch.length < 100) break;

  }



  console.log("New API 已有模型 meta 条数:", items.length);



  for (const m of cfg.models) {

    const row = items.find((x) => x.model_name === m.id);

    const desc = publicDescription(m);



    if (!row) {

      const j = await api("/api/models/", {

        method: "POST",

        token,

        body: {

          model_name: m.id,

          description: desc,

          icon: ICON_BY_CAT[m.category] || "Custom",

          endpoints: "",

          status: 1,

          sync_official: 0,

        },

      });

      console.log("meta create", m.id, j.success ? "OK" : j.message || JSON.stringify(j));

      continue;

    }



    const j = await api("/api/models/", {

      method: "PUT",

      token,

      body: {

        ...row,

        description: desc,

        icon: ICON_BY_CAT[m.category] || row.icon || "Custom",

        endpoints: "",

        status: 1,

        sync_official: 0,

      },

    });

    console.log("meta", m.id, j.success ? "OK" : j.message);

  }



  const opts = await api("/api/option/", { token });

  const map = Object.fromEntries((opts.data || []).map((o) => [o.key, o.value]));

  const modelRatio = JSON.parse(map.ModelRatio || "{}");

  const completionRatio = JSON.parse(map.CompletionRatio || "{}");

  const modelPrice = JSON.parse(map.ModelPrice || "{}");



  console.log("\n定价（汇率", cfg.fx, "，倍率 ×" + cfg.markup + "）：");

  for (const m of cfg.models) {

    if (m.billing.mode === "token") {

      modelRatio[m.id] = m.billing.model_ratio;

      completionRatio[m.id] = m.billing.completion_ratio;

      delete modelPrice[m.id];

      console.log(

        m.id,

        `token 售¥${m.billing.sell_in_cny_per_m}/¥${m.billing.sell_out_cny_per_m}/M`,

        `ratio=${m.billing.model_ratio}`,

        `comp=${m.billing.completion_ratio}`

      );

    } else {

      modelPrice[m.id] = m.billing.model_price_usd;

      delete modelRatio[m.id];

      delete completionRatio[m.id];

      console.log(

        m.id,

        `售¥${m.billing.sell_cny}/${m.billing.unit_label}`,

        `→ $${m.billing.model_price_usd} (model_price)` +

          (m.billing.free_upstream ? " [free→floor]" : "")

      );

    }

  }



  async function putOption(key, value) {

    const j = await api("/api/option/", {

      method: "PUT",

      token,

      body: { key, value },

    });

    console.log("option", key, j.success ? "OK" : j.message);

  }



  await putOption("ModelRatio", JSON.stringify(modelRatio));

  await putOption("CompletionRatio", JSON.stringify(completionRatio));

  await putOption("ModelPrice", JSON.stringify(modelPrice));



  console.log("\n完成。刷新 New API「模型」与「系统设置 → 模型相关」。");

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});

