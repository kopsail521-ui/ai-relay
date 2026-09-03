/**
 * 模型广场：单标签 + 原厂供应商（共享逻辑）
 */
import fs from "fs";
import { DatabaseSync } from "node:sqlite";

export const EP = {
  chat: JSON.stringify({ openai: "/v1/chat/completions" }),
  image: JSON.stringify({ "image-generation": "/v1/images/generations" }),
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
};

export const RULES = {
  VajraV1: { vendor: "其他", tag: "图像处理", endpoints: EP.visionCv },
  sam3: { vendor: "其他", tag: "图像处理", endpoints: EP.visionCv },
  AnimeSharp: { vendor: "其他", tag: "图像处理", endpoints: EP.imageProcess },
  "Real-ESRGAN": { vendor: "其他", tag: "图像处理", endpoints: EP.imageProcess },
  UVDoc: { vendor: "其他", tag: "图像处理", endpoints: EP.imageProcess },
  "RMBG-2.0": { vendor: "其他", tag: "图像处理", endpoints: EP.imageProcess },
  "MinerU2.5-Pro": { vendor: "其他", tag: "OCR", endpoints: EP.docAsync },
  "Unlimited-OCR": { vendor: "其他", tag: "OCR", endpoints: EP.chat },
  "DeepSeek-OCR-2": { vendor: "DeepSeek", tag: "OCR", endpoints: EP.chat },
  "Duix-Avatar": { vendor: "其他", tag: "数字人", endpoints: EP.duixAvatar },
  InfiniteTalk: { vendor: "其他", tag: "数字人", endpoints: EP.infiniteTalk },
  "MOSS-Audio-8B-Thinking": { vendor: "其他", tag: "语音识别", endpoints: EP.asr },
  "Fun-ASR-Nano-2512": { vendor: "阿里巴巴", tag: "语音识别", endpoints: EP.asr },
  "GLM-ASR": { vendor: "智谱", tag: "语音识别", endpoints: EP.asr },
  "whisper-large-v3": { vendor: "OpenAI", tag: "语音识别", endpoints: EP.asr },
  "whisper-large-v3-turbo": { vendor: "OpenAI", tag: "语音识别", endpoints: EP.asr },
  "Qwen3-TTS": { vendor: "阿里巴巴", tag: "语音合成", endpoints: EP.tts },
  CosyVoice3: { vendor: "阿里巴巴", tag: "语音合成", endpoints: EP.tts },
  "GLM-TTS": { vendor: "智谱", tag: "语音合成", endpoints: EP.tts },
  "IndexTTS-2": { vendor: "其他", tag: "语音合成", endpoints: EP.tts },
  "Step-Audio-TTS-3B": { vendor: "其他", tag: "语音合成", endpoints: EP.tts },
  "nonescape-v0": { vendor: "其他", tag: "内容风控", endpoints: EP.moderation },
  "moark-text-moderation": { vendor: "其他", tag: "内容风控", endpoints: EP.moderation },
  "Security-semantic-filtering": { vendor: "其他", tag: "内容风控", endpoints: EP.moderation },
  "nsfw-classifier": { vendor: "其他", tag: "内容风控", endpoints: EP.moderation },
  "gemma-4-26B-A4B-it": {
    vendor: "Google",
    tag: "大语言模型",
    endpoints: EP.chat,
    icon: "Gemini.Color",
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
  "grok-4.6": { vendor: "xAI", tag: "大语言模型", endpoints: EP.chat },
  "kimi-k3": { vendor: "Moonshot", tag: "大语言模型", endpoints: EP.chat },
  "MiniMax-M3": { vendor: "MiniMax", tag: "大语言模型", endpoints: EP.chat },
  "glm-5.3": { vendor: "智谱", tag: "大语言模型", endpoints: EP.chat },
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
  其他: "Custom",
};

function inferLlm(name) {
  const n = name.toLowerCase();
  if (/^gpt-|^chatgpt|^o[134]/.test(n))
    return { vendor: "OpenAI", tag: "大语言模型", endpoints: EP.chat, icon: "OpenAI" };
  if (/claude/.test(n))
    return { vendor: "Anthropic", tag: "大语言模型", endpoints: EP.chat, icon: "Claude.Color" };
  if (/gemini|^gemma/.test(n))
    return { vendor: "Google", tag: "大语言模型", endpoints: EP.chat, icon: "Gemini.Color" };
  if (/deepseek/.test(n))
    return { vendor: "DeepSeek", tag: "大语言模型", endpoints: EP.chat, icon: "DeepSeek.Color" };
  if (/grok/.test(n))
    return { vendor: "xAI", tag: "大语言模型", endpoints: EP.chat, icon: "XAI" };
  if (/kimi|moonshot/.test(n))
    return { vendor: "Moonshot", tag: "大语言模型", endpoints: EP.chat, icon: "Moonshot" };
  if (/glm|zhipu/.test(n))
    return { vendor: "智谱", tag: "大语言模型", endpoints: EP.chat, icon: "Zhipu.Color" };
  if (/minimax/.test(n))
    return { vendor: "MiniMax", tag: "大语言模型", endpoints: EP.chat, icon: "Minimax.Color" };
  if (/qwen/.test(n))
    return { vendor: "阿里巴巴", tag: "大语言模型", endpoints: EP.chat, icon: "Qwen.Color" };
  return null;
}

/** @returns {{ updated: number, tagCounts: Record<string,number>, multiTag: string[], skipped: string[] }} */
export function fixMarketplaceMeta(dbPath) {
  if (!fs.existsSync(dbPath)) throw new Error("DB not found: " + dbPath);
  const db = new DatabaseSync(dbPath);
  const now = Math.floor(Date.now() / 1000);

  let other = db.prepare(`SELECT id FROM vendors WHERE name = '其他' LIMIT 1`).get();
  if (!other) {
    db.prepare(
      `INSERT INTO vendors (name, icon, description, status, created_time, updated_time) VALUES ('其他', 'Custom', '', 1, ?, ?)`
    ).run(now, now);
  }

  const vendorByName = Object.fromEntries(
    db.prepare(`SELECT id, name FROM vendors`).all().map((v) => [v.name, v.id])
  );

  const models = db
    .prepare(`SELECT id, model_name FROM models WHERE deleted_at IS NULL`)
    .all();

  const upd = db.prepare(`
    UPDATE models SET tags = ?, vendor_id = ?, endpoints = ?, icon = COALESCE(?, icon), sync_official = 0, updated_time = ? WHERE id = ?
  `);

  let updated = 0;
  const tagCounts = {};
  const skipped = [];

  for (const row of models) {
    let rule = RULES[row.model_name] || inferLlm(row.model_name);
    if (!rule) {
      skipped.push(row.model_name);
      continue;
    }
    const vid = vendorByName[rule.vendor];
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
