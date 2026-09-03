import fs from "fs";
import { DatabaseSync } from "node:sqlite";

const EP = {
  c: JSON.stringify({ openai: "/v1/chat/completions" }),
  i: JSON.stringify({ "image-generation": "/v1/images/generations" }),
  p: JSON.stringify({
    "image-generation": { path: "/v1/images/upscaling", method: "POST" },
  }),
  v: JSON.stringify({
    "image-generation": { path: "/v1/images/object-detection", method: "POST" },
  }),
  a: JSON.stringify({
    openai: { path: "/v1/audio/transcriptions", method: "POST" },
  }),
  t: JSON.stringify({ openai: { path: "/v1/audio/speech", method: "POST" } }),
  m: JSON.stringify({ openai: { path: "/v1/moderations", method: "POST" } }),
  d: JSON.stringify({
    openai: { path: "/v1/async/documents/parse", method: "POST" },
  }),
  x: JSON.stringify({
    openai: { path: "/v1/async/videos/audio-video-to-video", method: "POST" },
  }),
  n: JSON.stringify({
    openai: { path: "/v1/async/videos/image-to-video", method: "POST" },
  }),
};

const RULES = {
  VajraV1: ["其他", "图像处理", EP.v],
  sam3: ["其他", "图像处理", EP.v],
  AnimeSharp: ["其他", "图像处理", EP.p],
  "Real-ESRGAN": ["其他", "图像处理", EP.p],
  UVDoc: ["其他", "图像处理", EP.p],
  "RMBG-2.0": ["其他", "图像处理", EP.p],
  "MinerU2.5-Pro": ["其他", "OCR", EP.d],
  "Unlimited-OCR": ["其他", "OCR", EP.c],
  "DeepSeek-OCR-2": ["DeepSeek", "OCR", EP.c],
  "Duix-Avatar": ["其他", "数字人", EP.x],
  InfiniteTalk: ["其他", "数字人", EP.n],
  "MOSS-Audio-8B-Thinking": ["其他", "语音识别", EP.a],
  "Fun-ASR-Nano-2512": ["阿里巴巴", "语音识别", EP.a],
  "GLM-ASR": ["智谱", "语音识别", EP.a],
  "whisper-large-v3": ["OpenAI", "语音识别", EP.a],
  "whisper-large-v3-turbo": ["OpenAI", "语音识别", EP.a],
  "Qwen3-TTS": ["阿里巴巴", "语音合成", EP.t],
  CosyVoice3: ["阿里巴巴", "语音合成", EP.t],
  "GLM-TTS": ["智谱", "语音合成", EP.t],
  "IndexTTS-2": ["其他", "语音合成", EP.t],
  "Step-Audio-TTS-3B": ["其他", "语音合成", EP.t],
  "nonescape-v0": ["其他", "内容风控", EP.m],
  "moark-text-moderation": ["其他", "内容风控", EP.m],
  "Security-semantic-filtering": ["其他", "内容风控", EP.m],
  "nsfw-classifier": ["其他", "内容风控", EP.m],
  "gemma-4-26B-A4B-it": ["Google", "大语言模型", EP.c],
  "gpt-image-2": ["OpenAI", "图片", EP.i],
  "gpt-image-2-vip": ["OpenAI", "图片", EP.i],
  "nano-banana-pro": ["Google", "图片", EP.i],
  "nano-banana-2": ["Google", "图片", EP.i],
  "gpt-5.6-sol": ["OpenAI", "大语言模型", EP.c],
  "gpt-5.6-terra": ["OpenAI", "大语言模型", EP.c],
  "gpt-5.6-luna": ["OpenAI", "大语言模型", EP.c],
  "claude-opus-5": ["Anthropic", "大语言模型", EP.c],
  "claude-sonnet-5": ["Anthropic", "大语言模型", EP.c],
  "claude-fable-5": ["Anthropic", "大语言模型", EP.c],
  "claude-fable-5-1": ["Anthropic", "大语言模型", EP.c],
  "gemini-3.7-flash": ["Google", "大语言模型", EP.c],
  "gemini-3.8-flash": ["Google", "大语言模型", EP.c],
  "deepseek-v4-pro-0813": ["DeepSeek", "大语言模型", EP.c],
  "deepseek-v4-flash": ["DeepSeek", "大语言模型", EP.c],
  "grok-4.6": ["xAI", "大语言模型", EP.c],
  "kimi-k3": ["Moonshot", "大语言模型", EP.c],
  "MiniMax-M3": ["MiniMax", "大语言模型", EP.c],
  "glm-5.3": ["智谱", "大语言模型", EP.c],
};

function infer(name) {
  const s = name.toLowerCase();
  if (/^gpt-|^chatgpt|^o[134]/.test(s)) return ["OpenAI", "大语言模型", EP.c];
  if (/claude/.test(s)) return ["Anthropic", "大语言模型", EP.c];
  if (/gemini|^gemma/.test(s)) return ["Google", "大语言模型", EP.c];
  if (/deepseek/.test(s)) return ["DeepSeek", "大语言模型", EP.c];
  if (/grok/.test(s)) return ["xAI", "大语言模型", EP.c];
  if (/kimi|moonshot/.test(s)) return ["Moonshot", "大语言模型", EP.c];
  if (/glm|zhipu/.test(s)) return ["智谱", "大语言模型", EP.c];
  if (/minimax/.test(s)) return ["MiniMax", "大语言模型", EP.c];
  if (/qwen/.test(s)) return ["阿里巴巴", "大语言模型", EP.c];
  return null;
}

const dbPath = process.argv[2] || "/data/one-api.db";
if (!fs.existsSync(dbPath)) throw new Error("DB not found: " + dbPath);
const db = new DatabaseSync(dbPath);
const now = Math.floor(Date.now() / 1000);
const other = db.prepare("SELECT id FROM vendors WHERE name='其他'").get();
if (other == null) {
  db.prepare(
    "INSERT INTO vendors(name,icon,description,status,created_time,updated_time) VALUES('其他','Custom','',1,?,?)"
  ).run(now, now);
}
const V = Object.fromEntries(
  db.prepare("SELECT id,name FROM vendors").all().map((x) => [x.name, x.id])
);
const rows = db
  .prepare("SELECT id,model_name FROM models WHERE deleted_at IS NULL")
  .all();
const u = db.prepare(
  "UPDATE models SET tags=?,vendor_id=?,endpoints=?,sync_official=0,updated_time=? WHERE id=?"
);
const tagCounts = {};
let updated = 0;
const skipped = [];
for (const r of rows) {
  const rule = RULES[r.model_name] || infer(r.model_name);
  if (rule == null) {
    skipped.push(r.model_name);
    continue;
  }
  const vid = V[rule[0]];
  if (vid == null) {
    skipped.push(r.model_name + "(no vendor " + rule[0] + ")");
    continue;
  }
  u.run(rule[1], vid, rule[2], now, r.id);
  tagCounts[rule[1]] = (tagCounts[rule[1]] || 0) + 1;
  updated += 1;
}
const multiTag = db
  .prepare(
    "SELECT model_name FROM models WHERE deleted_at IS NULL AND tags LIKE '%,%'"
  )
  .all()
  .map((x) => x.model_name);
db.close();
console.log(JSON.stringify({ updated, tagCounts, multiTag, skipped }, null, 2));
