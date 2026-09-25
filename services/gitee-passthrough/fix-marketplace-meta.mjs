/**
 * 模型广场：单标签 + 原厂供应商（共享逻辑）
 */
import fs from "fs";
import { DatabaseSync } from "node:sqlite";

export const EP = {
  chat: JSON.stringify({ openai: "/v1/chat/completions" }),
  image: JSON.stringify({ "image-generation": "/v1/images/generations" }),
  embed: JSON.stringify({ openai: "/v1/embeddings" }),
  rerank: JSON.stringify({ openai: "/v1/rerank" }),
  imageProcess: JSON.stringify({
    "image-generation": { path: "/v1/images/upscaling", method: "POST" },
  }),
  visionCv: JSON.stringify({
    "image-generation": { path: "/v1/images/object-detection", method: "POST" },
  }),
  asr: JSON.stringify({
    openai: { path: "/v1/audio/transcriptions", method: "POST" },
  }),
  tts: JSON.stringify({
    openai: { path: "/v1/audio/speech", method: "POST" },
  }),
  moderation: JSON.stringify({
    openai: { path: "/v1/moderations", method: "POST" },
  }),
  docAsync: JSON.stringify({
    openai: { path: "/v1/async/documents/parse", method: "POST" },
  }),
  duixAvatar: JSON.stringify({
    openai: { path: "/v1/async/videos/audio-video-to-video", method: "POST" },
  }),
  infiniteTalk: JSON.stringify({
    openai: { path: "/v1/async/videos/image-to-video", method: "POST" },
  }),
  videoGen: JSON.stringify({ "openai-video": "/v1/videos/generations" }),
  systemone: JSON.stringify({
    openai: { path: "/v1/systemone", method: "POST" },
  }),
};

export const RULES = {
  VajraV1: { vendor: "其他", tag: "图像处理", endpoints: EP.visionCv, icon: "Custom" },
  sam3: { vendor: "Meta", tag: "图像处理", endpoints: EP.visionCv, icon: "Meta.Color" },
  AnimeSharp: { vendor: "其他", tag: "图像处理", endpoints: EP.imageProcess, icon: "Custom" },
  "Real-ESRGAN": {
    vendor: "腾讯",
    tag: "图像处理",
    endpoints: EP.imageProcess,
    icon: "Tencent.Color",
  },
  UVDoc: { vendor: "其他", tag: "图像处理", endpoints: EP.imageProcess, icon: "Custom" },
  "RMBG-2.0": {
    vendor: "腾讯",
    tag: "图像处理",
    endpoints: EP.imageProcess,
    icon: "Tencent.Color",
  },
  "MinerU2.5-Pro": { vendor: "其他", tag: "OCR", endpoints: EP.docAsync, icon: "Custom" },
  "Unlimited-OCR": {
    vendor: "百度",
    tag: "OCR",
    endpoints: EP.chat,
    icon: "Wenxin.Color",
  },
  "Duix-Avatar": { vendor: "其他", tag: "数字人", endpoints: EP.duixAvatar, icon: "Custom" },
  InfiniteTalk: { vendor: "其他", tag: "数字人", endpoints: EP.infiniteTalk, icon: "Custom" },
  "MOSS-Audio-8B-Thinking": {
    vendor: "其他",
    tag: "语音识别",
    endpoints: EP.asr,
    icon: "Custom",
  },
  "Fun-ASR-Nano-2512": {
    vendor: "阿里巴巴",
    tag: "语音识别",
    endpoints: EP.asr,
    icon: "Qwen.Color",
  },
  "GLM-ASR": { vendor: "智谱", tag: "语音识别", endpoints: EP.asr, icon: "Zhipu.Color" },
  "whisper-large-v3": { vendor: "OpenAI", tag: "语音识别", endpoints: EP.asr, icon: "OpenAI" },
  "whisper-large-v3-turbo": {
    vendor: "OpenAI",
    tag: "语音识别",
    endpoints: EP.asr,
    icon: "OpenAI",
  },
  "Qwen3-TTS": { vendor: "阿里巴巴", tag: "语音合成", endpoints: EP.tts, icon: "Qwen.Color" },
  CosyVoice3: { vendor: "阿里巴巴", tag: "语音合成", endpoints: EP.tts, icon: "Qwen.Color" },
  "GLM-TTS": { vendor: "智谱", tag: "语音合成", endpoints: EP.tts, icon: "Zhipu.Color" },
  "IndexTTS-2": {
    vendor: "哔哩哔哩",
    tag: "语音合成",
    endpoints: EP.tts,
    icon: "Bilibili.Color",
  },
  "Step-Audio-TTS-3B": {
    vendor: "阶跃星辰",
    tag: "语音合成",
    endpoints: EP.tts,
    icon: "Stepfun.Color",
  },
  "nonescape-v0": { vendor: "其他", tag: "内容风控", endpoints: EP.moderation, icon: "Custom" },
  "moark-text-moderation": {
    vendor: "其他",
    tag: "内容风控",
    endpoints: EP.moderation,
    icon: "Custom",
  },
  "keyo-text-moderation": {
    vendor: "其他",
    tag: "内容风控",
    endpoints: EP.moderation,
    icon: "Custom",
  },
  "Security-semantic-filtering": {
    vendor: "其他",
    tag: "内容风控",
    endpoints: EP.moderation,
    icon: "Custom",
  },
  "nsfw-classifier": {
    vendor: "其他",
    tag: "内容风控",
    endpoints: EP.moderation,
    icon: "Custom",
  },
  "gemma-4-26B-A4B-it": {
    vendor: "Google",
    tag: "大语言模型",
    endpoints: EP.chat,
    icon: "Gemini.Color",
  },
  "Atria-dawn-v2": {
    vendor: "其他",
    tag: "大语言模型,免费",
    endpoints: EP.chat,
    icon: "Custom",
  },
  "DeepSeek-Prover-V2-7B": {
    vendor: "DeepSeek",
    tag: "大语言模型,免费",
    endpoints: EP.chat,
    icon: "DeepSeek",
  },
  // SenseNova free twins — must keep「免费」or sidebar count collapses
  "deepseek-v4-pro-free": {
    vendor: "DeepSeek",
    tag: "大语言模型,免费",
    endpoints: EP.chat,
    icon: "DeepSeek",
  },
  "deepseek-v4-flash-free": {
    vendor: "DeepSeek",
    tag: "大语言模型,免费",
    endpoints: EP.chat,
    icon: "DeepSeek",
  },
  "glm-5.2-free": {
    vendor: "智谱",
    tag: "大语言模型,免费",
    endpoints: EP.chat,
    icon: "ChatGLM.Color",
  },
  "kimi-k3-free": {
    vendor: "Moonshot",
    tag: "大语言模型,免费",
    endpoints: EP.chat,
    icon: "Moonshot",
  },
  "WeMM-Embedding-9B": {
    vendor: "腾讯",
    tag: "rag",
    endpoints: EP.embed,
    icon: "Tencent.Color",
  },
  "WeMM-Embedding-4B": {
    vendor: "腾讯",
    tag: "rag",
    endpoints: EP.embed,
    icon: "Tencent.Color",
  },
  "WeMM-Embedding-2B": {
    vendor: "腾讯",
    tag: "rag",
    endpoints: EP.embed,
    icon: "Tencent.Color",
  },
  "Qwen3-VL-Reranker-2B": {
    vendor: "阿里巴巴",
    tag: "rag",
    endpoints: EP.rerank,
    icon: "Qwen.Color",
  },
  "Qwen3-VL-Reranker-8B": {
    vendor: "阿里巴巴",
    tag: "rag",
    endpoints: EP.rerank,
    icon: "Qwen.Color",
  },
  "Qwen3-VL-Embedding-8B": {
    vendor: "阿里巴巴",
    tag: "rag",
    endpoints: EP.embed,
    icon: "Qwen.Color",
  },
  "Bespoke-Nimble-9B": {
    vendor: "阿里巴巴",
    tag: "系统一模型",
    endpoints: EP.systemone,
    icon: "Qwen.Color",
  },
  "jev-1.13.0": {
    vendor: "其他",
    tag: "系统一模型",
    endpoints: EP.systemone,
    icon: "Custom",
  },
  "gpt-image-2": { vendor: "OpenAI", tag: "图片", endpoints: EP.image },
  "gpt-image-2-vip": { vendor: "OpenAI", tag: "图片", endpoints: EP.image },
  "nano-banana-pro": { vendor: "Google", tag: "图片", endpoints: EP.image },
  "nano-banana-2": { vendor: "Google", tag: "图片", endpoints: EP.image },
  "gpt-5.6-sol": { vendor: "OpenAI", tag: "大语言模型", endpoints: EP.chat },
  "gpt-5.6-terra": { vendor: "OpenAI", tag: "大语言模型", endpoints: EP.chat },
  "gpt-5.6-luna": { vendor: "OpenAI", tag: "大语言模型", endpoints: EP.chat },
  "claude-opus-5": { vendor: "Anthropic", tag: "大语言模型", endpoints: EP.chat },
  "claude-sonnet-5": { vendor: "Anthropic", tag: "大语言模型", endpoints: EP.chat },
  "claude-fable-5": { vendor: "Anthropic", tag: "大语言模型", endpoints: EP.chat },
  "claude-fable-5-1": { vendor: "Anthropic", tag: "大语言模型", endpoints: EP.chat },
  "gemini-3.7-flash": { vendor: "Google", tag: "大语言模型", endpoints: EP.chat },
  "gemini-3.8-flash": { vendor: "Google", tag: "大语言模型", endpoints: EP.chat },
  "deepseek-v4-pro-0813": { vendor: "DeepSeek", tag: "大语言模型", endpoints: EP.chat },
  "deepseek-v4-flash": { vendor: "DeepSeek", tag: "大语言模型", endpoints: EP.chat },
  "deepseek-v4.1-flash": { vendor: "DeepSeek", tag: "大语言模型", endpoints: EP.chat },
  "grok-4.6": { vendor: "xAI", tag: "大语言模型", endpoints: EP.chat },
  "kimi-k3": { vendor: "Moonshot", tag: "大语言模型", endpoints: EP.chat },
  "MiniMax-M3": { vendor: "MiniMax", tag: "大语言模型", endpoints: EP.chat },
  "glm-5.3": { vendor: "智谱", tag: "大语言模型", endpoints: EP.chat },
  // Path B video (must stay in RULES or heal skips them → missing from sidebar)
  "MiniMax-H3": {
    vendor: "MiniMax",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Minimax.Color",
  },
  "wan3.0-video": {
    vendor: "阿里巴巴",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Qwen.Color",
  },
  "flux-3-video": {
    vendor: "Black Forest Labs",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Flux",
  },
  "gemini-omni-1.1-flash": {
    vendor: "Google",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Gemini.Color",
  },
  "gemini-omni-1.1-flash-ext": {
    vendor: "Google",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Gemini.Color",
  },
  "grok-imagine-video-1.5-preview": {
    vendor: "xAI",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "XAI",
  },
  "seedance-2.0-1080p": {
    vendor: "字节跳动",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Doubao.Color",
  },
  "seedance-2.0-1080p-fast": {
    vendor: "字节跳动",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Doubao.Color",
  },
  "seedance-2.0-1080p-mini": {
    vendor: "字节跳动",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Doubao.Color",
  },
  "seedance-2.5-1080p": {
    vendor: "字节跳动",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Doubao.Color",
  },
  "seedance-2.0-720p": {
    vendor: "字节跳动",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Doubao.Color",
  },
  "seedance-2.0-720p-fast": {
    vendor: "字节跳动",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Doubao.Color",
  },
  "seedance-2.0-720p-mini": {
    vendor: "字节跳动",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Doubao.Color",
  },
  "seedance-2.5-720p": {
    vendor: "字节跳动",
    tag: "视频按秒",
    endpoints: EP.videoGen,
    icon: "Doubao.Color",
  },
};

const VENDOR_ICON = {
  OpenAI: "OpenAI",
  Anthropic: "Claude.Color",
  Google: "Gemini.Color",
  DeepSeek: "DeepSeek.Color",
  Moonshot: "Moonshot",
  xAI: "XAI",
  MiniMax: "Minimax.Color",
  智谱: "Zhipu.Color",
  阿里巴巴: "Qwen.Color",
  Meta: "Meta.Color",
  NVIDIA: "Nvidia.Color",
  Mistral: "Mistral.Color",
  Poolside: "Custom",
  InclusionAI: "Custom",
  Dots: "Custom",
  百度: "Wenxin.Color",
  腾讯: "Tencent.Color",
  哔哩哔哩: "Bilibili.Color",
  阶跃星辰: "Stepfun.Color",
  字节跳动: "Doubao.Color",
  "Black Forest Labs": "Flux",
  其他: "Custom",
};

function withFreeTag(rule, name) {
  if (!rule) return null;
  if (!/[:-]free$/i.test(String(name || ""))) return rule;
  const tags = String(rule.tag || "")
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tags.includes("免费")) tags.push("免费");
  return { ...rule, tag: tags.join(",") };
}

function inferLlm(name) {
  const n = name.toLowerCase();
  let rule = null;
  if (/^gpt-|^chatgpt|^o[134]/.test(n))
    rule = { vendor: "OpenAI", tag: "大语言模型", endpoints: EP.chat, icon: "OpenAI" };
  else if (/claude/.test(n))
    rule = { vendor: "Anthropic", tag: "大语言模型", endpoints: EP.chat, icon: "Claude.Color" };
  else if (/gemini|^gemma/.test(n))
    rule = { vendor: "Google", tag: "大语言模型", endpoints: EP.chat, icon: "Gemini.Color" };
  else if (/deepseek/.test(n))
    rule = { vendor: "DeepSeek", tag: "大语言模型", endpoints: EP.chat, icon: "DeepSeek.Color" };
  else if (/grok/.test(n))
    rule = { vendor: "xAI", tag: "大语言模型", endpoints: EP.chat, icon: "XAI" };
  else if (/kimi|moonshot/.test(n))
    rule = { vendor: "Moonshot", tag: "大语言模型", endpoints: EP.chat, icon: "Moonshot" };
  else if (/glm|zhipu/.test(n))
    rule = { vendor: "智谱", tag: "大语言模型", endpoints: EP.chat, icon: "Zhipu.Color" };
  else if (/minimax/.test(n))
    rule = { vendor: "MiniMax", tag: "大语言模型", endpoints: EP.chat, icon: "Minimax.Color" };
  else if (/qwen/.test(n))
    rule = { vendor: "阿里巴巴", tag: "大语言模型", endpoints: EP.chat, icon: "Qwen.Color" };
  else if (/nemotron|nvidia/.test(n))
    rule = { vendor: "NVIDIA", tag: "大语言模型", endpoints: EP.chat, icon: "Nvidia.Color" };
  else if (/mistral/.test(n))
    rule = { vendor: "Mistral", tag: "大语言模型", endpoints: EP.chat, icon: "Mistral.Color" };
  else if (/^step-/.test(n))
    rule = { vendor: "阶跃星辰", tag: "大语言模型", endpoints: EP.chat, icon: "Stepfun.Color" };
  else if (/^muse-/.test(n))
    rule = { vendor: "Meta", tag: "大语言模型", endpoints: EP.chat, icon: "Meta.Color" };
  else if (/laguna/.test(n))
    rule = { vendor: "Poolside", tag: "大语言模型", endpoints: EP.chat, icon: "Custom" };
  else if (/^ling-/.test(n))
    rule = { vendor: "InclusionAI", tag: "大语言模型", endpoints: EP.chat, icon: "Custom" };
  else if (/^dots-/.test(n))
    rule = { vendor: "Dots", tag: "大语言模型", endpoints: EP.chat, icon: "Custom" };
  return withFreeTag(rule, name);
}

function ensureVendor(db, name, icon, now) {
  let row = db.prepare(`SELECT id FROM vendors WHERE name = ? LIMIT 1`).get(name);
  if (row) return row.id;
  db.prepare(
    `INSERT INTO vendors (name, icon, description, status, created_time, updated_time) VALUES (?, ?, '', 1, ?, ?)`
  ).run(name, icon || "Custom", now, now);
  row = db.prepare(`SELECT id FROM vendors WHERE name = ? LIMIT 1`).get(name);
  return row?.id;
}

/** @returns {{ updated: number, tagCounts: Record<string,number>, multiTag: string[], skipped: string[] }} */
export function fixMarketplaceMeta(dbPath) {
  if (!fs.existsSync(dbPath)) throw new Error("DB not found: " + dbPath);
  const db = new DatabaseSync(dbPath);
  const now = Math.floor(Date.now() / 1000);

  for (const [name, icon] of Object.entries(VENDOR_ICON)) {
    ensureVendor(db, name, icon, now);
  }

  const vendorByName = Object.fromEntries(
    db.prepare(`SELECT id, name FROM vendors`).all().map((v) => [v.name, v.id])
  );

  const models = db
    .prepare(`SELECT id, model_name FROM models WHERE deleted_at IS NULL`)
    .all();

  const upd = db.prepare(`
    UPDATE models SET tags = ?, vendor_id = ?, endpoints = ?, icon = ?, sync_official = 0, updated_time = ? WHERE id = ?
  `);

  let updated = 0;
  const tagCounts = {};
  const skipped = [];

  for (const row of models) {
    let rule = RULES[row.model_name] || inferLlm(row.model_name);
    rule = withFreeTag(rule, row.model_name);
    if (!rule) {
      skipped.push(row.model_name);
      continue;
    }
    let vid = vendorByName[rule.vendor];
    if (!vid) {
      vid = ensureVendor(
        db,
        rule.vendor,
        rule.icon || VENDOR_ICON[rule.vendor] || "Custom",
        now
      );
      vendorByName[rule.vendor] = vid;
    }
    if (!vid) {
      skipped.push(row.model_name + "(no vendor " + rule.vendor + ")");
      continue;
    }
    const icon = rule.icon || VENDOR_ICON[rule.vendor] || "Custom";
    upd.run(rule.tag, vid, rule.endpoints, icon, now, row.id);
    tagCounts[rule.tag] = (tagCounts[rule.tag] || 0) + 1;
    updated++;
  }

  const multiTag = db
    .prepare(
      `SELECT model_name, tags FROM models WHERE deleted_at IS NULL AND (tags LIKE '%,%' OR tags LIKE '%;%' OR instr(tags,' ') > 0)`
    )
    .all()
    .map((r) => r.model_name);

  db.close();
  return { updated, tagCounts, multiTag, skipped };
}

const cliDb =
  process.argv[2] || process.env.NEW_API_DB || "/data/one-api.db";
if (process.argv[1]?.endsWith("fix-marketplace-meta.mjs")) {
  console.log(JSON.stringify(fixMarketplaceMeta(cliDb), null, 2));
}
