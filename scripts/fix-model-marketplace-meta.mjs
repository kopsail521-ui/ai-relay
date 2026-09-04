/**
 * 修正模型广场：供应商 / 标签 / 端点
 *
 * 规则（用户定制）：
 * - 供应商按模型原本厂商，不知道 →「其他」（不写模力方舟）
 * - 每个模型只挂 1 个标签
 * - 大语言模型 / OCR / 语音识别 / 语音合成 / 内容风控 / 图像处理 / 数字人 / 图片
 * - 数字人不算 Video 端点
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
  // 环境变量优先（VPS 一键脚本注入）
  for (const k of ["NEW_API_BASE", "NEW_API_ADMIN_USER", "NEW_API_ADMIN_PASSWORD"]) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}

const EP = {
  chat: { openai: "/v1/chat/completions" },
  image: { "image-generation": "/v1/images/generations" },
  imageProcess: {
    "image-generation": { path: "/v1/images/upscaling", method: "POST" },
  },
  visionCv: {
    "image-generation": { path: "/v1/images/object-detection", method: "POST" },
  },
  asr: { openai: { path: "/v1/audio/transcriptions", method: "POST" } },
  tts: { openai: { path: "/v1/audio/speech", method: "POST" } },
  moderation: { openai: { path: "/v1/moderations", method: "POST" } },
  docAsync: { openai: { path: "/v1/async/documents/parse", method: "POST" } },
  // 数字人：走 openai 端点类型（不进 Video 筛选），路径写真实 API
  duixAvatar: {
    openai: { path: "/v1/async/videos/audio-video-to-video", method: "POST" },
  },
  infiniteTalk: {
    openai: { path: "/v1/async/videos/image-to-video", method: "POST" },
  },
  openaiVideo: { "openai-video": "/v1/videos" },
  apimartVideo: { "openai-video": "/v1/videos/generations" },
};

/** 单标签 + 原厂供应商 + 端点（logo 用 @lobehub/icons 里有的；没有就「其他」） */
const FIXES = {
  // —— 视觉/图像 ——
  VajraV1: { vendorName: "其他", icon: "Custom", tag: "图像处理", endpoints: EP.visionCv }, // VayuAI，无现成 logo
  sam3: { vendorName: "Meta", icon: "Meta.Color", tag: "图像处理", endpoints: EP.visionCv },
  AnimeSharp: { vendorName: "其他", icon: "Custom", tag: "图像处理", endpoints: EP.imageProcess }, // Kim2091 个人，无公司 logo
  "Real-ESRGAN": { vendorName: "腾讯", icon: "Tencent.Color", tag: "图像处理", endpoints: EP.imageProcess },
  UVDoc: { vendorName: "其他", icon: "Custom", tag: "图像处理", endpoints: EP.imageProcess }, // ETH Zurich 学术项目
  "RMBG-2.0": { vendorName: "BRIA AI", icon: "BriaAI.Color", tag: "图像处理", endpoints: EP.imageProcess },

  // —— OCR ——
  "MinerU2.5-Pro": { vendorName: "其他", icon: "Custom", tag: "OCR", endpoints: EP.docAsync }, // OpenDataLab，无现成 logo
  "Unlimited-OCR": { vendorName: "百度", icon: "Baidu.Color", tag: "OCR", endpoints: EP.chat },

  // —— 数字人（不进 Video）——
  "Duix-Avatar": { vendorName: "其他", icon: "Custom", tag: "数字人", endpoints: EP.duixAvatar }, // Duix.com，无现成 logo
  InfiniteTalk: { vendorName: "其他", icon: "Custom", tag: "数字人", endpoints: EP.infiniteTalk }, // MeiGen-AI，无现成 logo

  // —— ASR ——
  "MOSS-Audio-8B-Thinking": { vendorName: "其他", icon: "Custom", tag: "语音识别", endpoints: EP.asr }, // OpenMOSS，无现成 logo
  "Fun-ASR-Nano-2512": { vendorName: "阿里巴巴", icon: "Qwen.Color", tag: "语音识别", endpoints: EP.asr },
  "GLM-ASR": { vendorName: "智谱", icon: "Zhipu.Color", tag: "语音识别", endpoints: EP.asr },
  "whisper-large-v3": { vendorName: "OpenAI", icon: "OpenAI", tag: "语音识别", endpoints: EP.asr },
  "whisper-large-v3-turbo": { vendorName: "OpenAI", icon: "OpenAI", tag: "语音识别", endpoints: EP.asr },

  // —— TTS ——
  "Qwen3-TTS": { vendorName: "阿里巴巴", icon: "Qwen.Color", tag: "语音合成", endpoints: EP.tts },
  CosyVoice3: { vendorName: "阿里巴巴", icon: "Qwen.Color", tag: "语音合成", endpoints: EP.tts },
  "GLM-TTS": { vendorName: "智谱", icon: "Zhipu.Color", tag: "语音合成", endpoints: EP.tts },
  "IndexTTS-2": { vendorName: "哔哩哔哩", icon: "Bilibili.Color", tag: "语音合成", endpoints: EP.tts },
  "Step-Audio-TTS-3B": { vendorName: "阶跃星辰", icon: "Stepfun.Color", tag: "语音合成", endpoints: EP.tts },

  // —— 内容风控 ——
  "nonescape-v0": { vendorName: "其他", icon: "Custom", tag: "内容风控", endpoints: EP.moderation }, // e3ntity，无公司 logo
  "moark-text-moderation": { vendorName: "其他", icon: "Custom", tag: "内容风控", endpoints: EP.moderation }, // 不挂上游平台名
  "Security-semantic-filtering": { vendorName: "其他", icon: "Custom", tag: "内容风控", endpoints: EP.moderation },
  "nsfw-classifier": { vendorName: "其他", icon: "Custom", tag: "内容风控", endpoints: EP.moderation }, // 无法唯一归属

  // —— 大语言模型 ——
  "gemma-4-26B-A4B-it": { vendorName: "Google", icon: "Gemini.Color", tag: "大语言模型", endpoints: EP.chat },

  // —— Grsai 出图 ——
  "gpt-image-2": { vendorName: "OpenAI", icon: "OpenAI", tag: "图片", endpoints: EP.image },
  "gpt-image-2-vip": { vendorName: "OpenAI", icon: "OpenAI", tag: "图片", endpoints: EP.image },
  "nano-banana-pro": { vendorName: "Google", icon: "Gemini.Color", tag: "图片", endpoints: EP.image },
  "nano-banana-2": { vendorName: "Google", icon: "Gemini.Color", tag: "图片", endpoints: EP.image },

  // —— OpenLux 等大语言模型 ——
  "gpt-5.6-sol": { vendorName: "OpenAI", icon: "OpenAI", tag: "大语言模型", endpoints: EP.chat },
  "gpt-5.6-terra": { vendorName: "OpenAI", icon: "OpenAI", tag: "大语言模型", endpoints: EP.chat },
  "gpt-5.6-luna": { vendorName: "OpenAI", icon: "OpenAI", tag: "大语言模型", endpoints: EP.chat },
  "claude-opus-5": { vendorName: "Anthropic", icon: "Claude.Color", tag: "大语言模型", endpoints: EP.chat },
  "claude-sonnet-5": { vendorName: "Anthropic", icon: "Claude.Color", tag: "大语言模型", endpoints: EP.chat },
  "claude-fable-5": { vendorName: "Anthropic", icon: "Claude.Color", tag: "大语言模型", endpoints: EP.chat },
  "claude-fable-5-1": { vendorName: "Anthropic", icon: "Claude.Color", tag: "大语言模型", endpoints: EP.chat },
  "gemini-3.7-flash": { vendorName: "Google", icon: "Gemini.Color", tag: "大语言模型", endpoints: EP.chat },
  "gemini-3.8-flash": { vendorName: "Google", icon: "Gemini.Color", tag: "大语言模型", endpoints: EP.chat },
  "deepseek-v4-pro-0813": { vendorName: "DeepSeek", icon: "DeepSeek.Color", tag: "大语言模型", endpoints: EP.chat },
  "deepseek-v4-flash": { vendorName: "DeepSeek", icon: "DeepSeek.Color", tag: "大语言模型", endpoints: EP.chat },
  "grok-4.6": { vendorName: "xAI", icon: "XAI", tag: "大语言模型", endpoints: EP.chat },
  "kimi-k3": { vendorName: "Moonshot", icon: "Moonshot", tag: "大语言模型", endpoints: EP.chat },
  "MiniMax-M3": { vendorName: "MiniMax", icon: "Minimax.Color", tag: "大语言模型", endpoints: EP.chat },
  "glm-5.3": { vendorName: "智谱", icon: "Zhipu.Color", tag: "大语言模型", endpoints: EP.chat },
  "qwen3.8-max-0902": { vendorName: "阿里巴巴", icon: "Qwen.Color", tag: "大语言模型", endpoints: EP.chat },

  // —— OpenLux 视频 ——
  "grok-imagine-video-1.5-preview": { vendorName: "xAI", icon: "XAI", tag: "视频", endpoints: EP.apimartVideo },
  "grok-1.5-video": { vendorName: "xAI", icon: "XAI", tag: "视频", endpoints: EP.openaiVideo },
  "veo_3_1-components": { vendorName: "Google", icon: "Gemini.Color", tag: "视频", endpoints: EP.openaiVideo },

  // —— APIMart 视频 ——
  "gemini-omni-1.1-flash": { vendorName: "Google", icon: "Gemini.Color", tag: "视频", endpoints: EP.apimartVideo },
  "gemini-omni-1.1-flash-ext": { vendorName: "Google", icon: "Gemini.Color", tag: "视频", endpoints: EP.apimartVideo },
  "seedance-2.5": { vendorName: "其他", icon: "Custom", tag: "视频", endpoints: EP.apimartVideo },
  "seedance-2.0": { vendorName: "其他", icon: "Custom", tag: "视频", endpoints: EP.apimartVideo },
  "flux-3-video": { vendorName: "其他", icon: "Custom", tag: "视频", endpoints: EP.apimartVideo },
  "MiniMax-H3": { vendorName: "MiniMax", icon: "Minimax.Color", tag: "视频", endpoints: EP.apimartVideo },
  "wan3.0-video": { vendorName: "阿里巴巴", icon: "Qwen.Color", tag: "视频", endpoints: EP.apimartVideo },
};

/** 未在 FIXES 里、但明显是聊天模型的，自动打「大语言模型」 */
function inferLlmVendor(modelName) {
  const n = modelName.toLowerCase();
  if (/^gpt-|^chatgpt|^o[134]/.test(n)) return { vendorName: "OpenAI", icon: "OpenAI" };
  if (/claude/.test(n)) return { vendorName: "Anthropic", icon: "Claude.Color" };
  if (/gemini|^gemma/.test(n)) return { vendorName: "Google", icon: "Gemini.Color" };
  if (/deepseek/.test(n)) return { vendorName: "DeepSeek", icon: "DeepSeek.Color" };
  if (/grok/.test(n)) return { vendorName: "xAI", icon: "XAI" };
  if (/kimi|moonshot/.test(n)) return { vendorName: "Moonshot", icon: "Moonshot" };
  if (/glm|zhipu/.test(n)) return { vendorName: "智谱", icon: "Zhipu.Color" };
  if (/minimax/.test(n)) return { vendorName: "MiniMax", icon: "Minimax.Color" };
  if (/qwen/.test(n)) return { vendorName: "阿里巴巴", icon: "Qwen.Color" };
  return { vendorName: "其他", icon: "Custom" };
}

async function ensureVendor(headers, base, byName, name, icon = "Custom") {
  if (byName[name]) return byName[name];
  const r = await fetch(`${base}/api/vendors/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, icon, description: "", status: 1 }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`创建供应商「${name}」失败: ${j.message}`);
  byName[name] = j.data;
  console.log("created vendor", name, "id=", j.data?.id);
  return j.data;
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
  if (!lj.success) throw new Error("登录失败: " + (lj.message || JSON.stringify(lj)));
  const headers = {
    Authorization: `Bearer ${lj.data.access_token}`,
    "Content-Type": "application/json",
  };

  const vendorsRes = await (
    await fetch(`${base}/api/vendors/?page=1&page_size=100`, { headers })
  ).json();
  const byName = Object.fromEntries((vendorsRes.data?.items || []).map((v) => [v.name, v]));
  await ensureVendor(headers, base, byName, "其他", "Custom");

  let items = [];
  for (let page = 1; page <= 20; page++) {
    const list = await (
      await fetch(`${base}/api/models/?page=${page}&page_size=100`, { headers })
    ).json();
    const batch = list.data?.items || [];
    items = items.concat(batch);
    if (batch.length < 100) break;
  }
  console.log("models loaded", items.length);

  let ok = 0;
  const tagUsage = {};

  for (const row of items) {
    const name = row.model_name;
    let fix = FIXES[name];

    if (!fix) {
      // 兜底：纯聊天模型 → 大语言模型
      const isLikelyLlm =
        !name.includes("image") &&
        !name.includes("banana") &&
        !name.includes("whisper") &&
        !name.includes("TTS") &&
        !name.includes("ASR") &&
        !name.includes("OCR") &&
        !name.includes("Avatar") &&
        !name.includes("Talk") &&
        !/classifier|moderation|ESRGAN|Sharp|RMBG|UVDoc|sam3|Vajra|MinerU|CosyVoice|IndexTTS|nonescape|nsfw|MOSS-Audio|Fun-ASR|Step-Audio|Security-semantic|moark-text|Duix|Infinite|Unlimited|Real-/.test(
          name
        );
      if (isLikelyLlm) {
        const inf = inferLlmVendor(name);
        fix = {
          vendorName: inf.vendorName,
          icon: inf.icon,
          tag: "大语言模型",
          endpoints: EP.chat,
        };
      } else {
        console.log("SKIP (no rule)", name);
        continue;
      }
    }

    const vendor = byName[fix.vendorName] || (await ensureVendor(headers, base, byName, fix.vendorName, fix.icon));
    const body = {
      ...row,
      icon: fix.icon || row.icon,
      tags: fix.tag,
      vendor_id: vendor.id,
      endpoints: JSON.stringify(fix.endpoints),
      status: 1,
      sync_official: 0,
    };
    const r = await fetch(`${base}/api/models/`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.success) {
      ok++;
      tagUsage[fix.tag] = (tagUsage[fix.tag] || 0) + 1;
      console.log("OK", name, "→", fix.vendorName, "|", fix.tag);
    } else {
      console.log("FAIL", name, j.message);
    }
  }

  const pricing = await (await fetch(`${base}/api/pricing`, { headers })).json();
  const tagSet = new Set();
  const tagDupCheck = {};
  const vendorCounts = {};
  const endpointCounts = {};
  for (const m of pricing.data || []) {
    const tags = (m.tags || "")
      .split(/[,;|\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 1) tagDupCheck[m.model_name] = tags;
    if (tags[0]) tagSet.add(tags[0]);
    for (const e of m.supported_endpoint_types || []) {
      endpointCounts[e] = (endpointCounts[e] || 0) + 1;
    }
    const v = (pricing.vendors || []).find((x) => x.id === m.vendor_id);
    vendorCounts[v?.name || "(无)"] = (vendorCounts[v?.name || "(无)"] || 0) + 1;
  }

  console.log("\n--- 校验 ---");
  console.log("updated", ok);
  console.log("tags", [...tagSet].sort().join(", "));
  console.log("tag counts", tagUsage);
  console.log("multi-tag models", Object.keys(tagDupCheck).length ? tagDupCheck : "none");
  console.log("vendors", vendorCounts);
  console.log("endpoints", endpointCounts);
  const dh = (pricing.data || []).filter((m) => /Duix|InfiniteTalk/.test(m.model_name));
  for (const m of dh) {
    console.log("数字人", m.model_name, "ep=", m.supported_endpoint_types, "tag=", m.tags);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
