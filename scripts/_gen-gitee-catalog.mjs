/**
 * Generate config/gitee-selected-models.json from _tmp_gitee_prices.json
 * Markup ×5, categorized for deploy.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const prices = JSON.parse(
  fs.readFileSync(path.join(root, "_tmp_gitee_prices.json"), "utf8")
);

const FX = 7.3;
const MARKUP = 5;
const FREE_FLOOR_CNY = 0.01;

const UNIT = {
  0: { id: "per_call", label: "次", note: "按次计费" },
  1203: {
    id: "per_page",
    label: "页",
    note: "文档解析按页（上游 unit_tag=1203）",
  },
  1212: {
    id: "per_char",
    label: "字符",
    note: "文本审核按字符（上游 unit_tag=1212）",
  },
  1261: {
    id: "per_10k_chars",
    label: "万字符",
    note: "TTS 按万字符（上游 unit_tag=1261）",
  },
  1264: {
    id: "per_second",
    label: "秒",
    note: "数字人按秒（上游 unit_tag=1264）",
  },
};

const META = {
  VajraV1: {
    category: "vision_cv",
    category_zh: "视觉检测/分割",
    description: "YOLO 系实时视觉：目标检测 / 分割 / 人体关键点",
  },
  sam3: {
    category: "vision_cv",
    category_zh: "视觉检测/分割",
    description: "SAM3 物体检测与图片切割",
  },
  AnimeSharp: {
    category: "image_process",
    category_zh: "图像处理",
    description: "动漫风格图片超分高清",
  },
  "Real-ESRGAN": {
    category: "image_process",
    category_zh: "图像处理",
    description: "通用图片超分高清",
  },
  UVDoc: {
    category: "image_process",
    category_zh: "图像处理",
    description: "文档图片矫正（去弯曲）",
  },
  "RMBG-2.0": {
    category: "image_process",
    category_zh: "图像处理",
    description: "智能抠图去背景",
  },
  "MinerU2.5-Pro": {
    category: "document_ocr",
    category_zh: "文档/OCR",
    description: "MinerU 文档解析（异步）",
  },
  "Unlimited-OCR": {
    category: "document_ocr",
    category_zh: "文档/OCR",
    description: "OCR/文档解析；支持 chat 与异步解析",
  },
  "DeepSeek-OCR-2": {
    category: "document_ocr",
    category_zh: "文档/OCR",
    description: "DeepSeek OCR，chat/completions 调用",
  },
  "Duix-Avatar": {
    category: "digital_human",
    category_zh: "数字人/视频",
    description: "音频+视频驱动数字人（异步）",
  },
  InfiniteTalk: {
    category: "digital_human",
    category_zh: "数字人/视频",
    description: "图生说话视频 InfiniteTalk（异步）",
  },
  "MOSS-Audio-8B-Thinking": {
    category: "asr",
    category_zh: "语音识别 ASR",
    description: "MOSS 音频理解/转写",
  },
  "Fun-ASR-Nano-2512": {
    category: "asr",
    category_zh: "语音识别 ASR",
    description: "轻量 ASR Nano",
  },
  "GLM-ASR": {
    category: "asr",
    category_zh: "语音识别 ASR",
    description: "智谱 GLM 语音识别",
  },
  "whisper-large-v3": {
    category: "asr",
    category_zh: "语音识别 ASR",
    description: "OpenAI Whisper Large V3",
  },
  "whisper-large-v3-turbo": {
    category: "asr",
    category_zh: "语音识别 ASR",
    description: "Whisper Large V3 Turbo",
  },
  "Qwen3-TTS": {
    category: "tts",
    category_zh: "语音合成 TTS",
    description: "通义 Qwen3 TTS（异步）",
  },
  CosyVoice3: {
    category: "tts",
    category_zh: "语音合成 TTS",
    description: "CosyVoice3 语音合成（异步）",
  },
  "GLM-TTS": {
    category: "tts",
    category_zh: "语音合成 TTS",
    description: "智谱 GLM-TTS 同步语音合成",
  },
  "IndexTTS-2": {
    category: "tts",
    category_zh: "语音合成 TTS",
    description: "IndexTTS-2 音色/语气可控 TTS",
  },
  "Step-Audio-TTS-3B": {
    category: "tts",
    category_zh: "语音合成 TTS",
    description: "Step-Audio TTS 3B 同步语音合成",
  },
  "nonescape-v0": {
    category: "moderation",
    category_zh: "内容风控",
    description: "AI 生成图片检测",
  },
  "moark-text-moderation": {
    category: "moderation",
    category_zh: "内容风控",
    description: "文本内容审核",
  },
  "Security-semantic-filtering": {
    category: "moderation",
    category_zh: "内容风控",
    description: "安全语义过滤",
  },
  "nsfw-classifier": {
    category: "moderation",
    category_zh: "内容风控",
    description: "色情图片识别",
  },
  "gemma-4-26B-A4B-it": {
    category: "chat_vlm",
    category_zh: "多模态对话",
    description: "Gemma 4 26B 视觉语言模型，OpenAI chat 兼容",
  },
};

const OPENAI_NATIVE = new Set([
  "v1/chat/completions",
  "v1/audio/transcriptions",
  "v1/audio/speech",
  "v1/moderations",
]);

function uniqOps(ops) {
  const seen = new Set();
  const out = [];
  for (const op of ops) {
    const k = `${op.path}|${op.name}|${op.price}|${op.unit_tag}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(op);
  }
  return out;
}

const models = [];
for (const [id, arr] of Object.entries(prices)) {
  const svc = arr[0].service;
  const ops = uniqOps(arr[0].operations || []);
  const meta = META[id] || {
    category: "other",
    category_zh: "其他",
    description: svc.remark || id,
  };
  const chatOp = ops.find((o) => o.path === "v1/chat/completions");
  const primary = chatOp || ops[0];
  const unitTag = primary?.unit_tag ?? 0;
  const unit = UNIT[unitTag] || UNIT[0];
  let cost = Number(primary?.price ?? 0);
  const inM = Number(primary?.input_million_tokens_price || 0);
  const outM = Number(primary?.output_million_tokens_price || 0);
  const isToken =
    (inM > 0 || outM > 0) &&
    (primary?.path === "v1/chat/completions" ||
      id === "gemma-4-26B-A4B-it" ||
      id === "DeepSeek-OCR-2");

  let billing;
  if (isToken) {
    const costIn = inM || cost;
    const costOut = outM || inM || cost;
    const sellIn = costIn * MARKUP;
    const sellOut = costOut * MARKUP;
    billing = {
      mode: "token",
      cost_in_cny_per_m: costIn,
      cost_out_cny_per_m: costOut,
      sell_in_cny_per_m: sellIn,
      sell_out_cny_per_m: sellOut,
      model_ratio: Number((sellIn / FX / 2).toFixed(6)),
      completion_ratio: Number((sellOut / sellIn).toFixed(6)),
    };
  } else {
    const freeUpstream = cost === 0;
    if (freeUpstream) cost = FREE_FLOOR_CNY;
    const sell = cost * MARKUP;
    billing = {
      mode: "unit",
      unit: unit.id,
      unit_label: unit.label,
      unit_note: unit.note,
      unit_tag: unitTag,
      cost_cny: cost,
      sell_cny: sell,
      model_price_usd: Number((sell / FX).toFixed(6)),
      free_upstream: freeUpstream,
    };
  }

  const paths = [...new Set(ops.map((o) => o.path))];
  const nativeCount = paths.filter((p) => OPENAI_NATIVE.has(p)).length;
  const relay =
    nativeCount === paths.length
      ? "newapi_native"
      : nativeCount > 0
        ? "mixed"
        : "gitee_passthrough";

  models.push({
    id,
    upstream: id,
    category: meta.category,
    category_zh: meta.category_zh,
    description: meta.description,
    cover: svc.cover || "",
    paths,
    operations: ops.map((o) => ({
      name: o.name,
      type: o.type,
      path: o.path,
      price_cny: o.price,
      unit_tag: o.unit_tag,
      in_m: o.input_million_tokens_price,
      out_m: o.output_million_tokens_price,
    })),
    billing,
    relay,
    markup: MARKUP,
  });
}

const byCat = {};
for (const m of models) {
  (byCat[m.category] ||= []).push(m.id);
}

const cfg = {
  provider: "gitee",
  name: "模力方舟 Serverless",
  baseUrl: "https://ai.gitee.com/v1",
  docs: "https://ai.gitee.com/docs/openapi/v1",
  catalog: "https://ai.gitee.com/serverless-api",
  markup: MARKUP,
  fx: FX,
  note: "售价 = 上游成本 ×5；免费上游按成本底价 ¥0.01×5=¥0.05（按次类）。token 模型按百万 tokens。usage 单位类在 New API 按 ModelPrice（单位售价）按次近似扣费。",
  categories: byCat,
  models,
};

const out = path.join(root, "config", "gitee-selected-models.json");
fs.writeFileSync(out, JSON.stringify(cfg, null, 2));
console.log("wrote", out, models.length, "models");
for (const [c, ids] of Object.entries(byCat)) {
  console.log(`  ${c}: ${ids.length} — ${ids.join(", ")}`);
}
