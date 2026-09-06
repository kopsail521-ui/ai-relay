/**
 * Patch marketplace-model-copy.json: __vendors__ + expanded __tags__
 * Brand names stay brand-safe (no machine-translation junk).
 *
 * IMPORTANT: New API sidebar splits tags on spaces / 「·」.
 * Every localized tag label MUST be a single token (no spaces, no middle-dot).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const files = [
  path.join(root, "config/marketplace-model-copy.json"),
  path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json"),
];

const LANG = (zhCN, zhTW, en, fr, ru, ja, vi) => ({
  zhCN,
  zhTW,
  en,
  fr,
  ru,
  ja,
  vi,
});

/** Canonical vendor key → display per locale. Brands keep Latin form in all langs. */
const VENDORS = {
  OpenAI: LANG("OpenAI", "OpenAI", "OpenAI", "OpenAI", "OpenAI", "OpenAI", "OpenAI"),
  Anthropic: LANG("Anthropic", "Anthropic", "Anthropic", "Anthropic", "Anthropic", "Anthropic", "Anthropic"),
  Google: LANG("Google", "Google", "Google", "Google", "Google", "Google", "Google"),
  DeepSeek: LANG("DeepSeek", "DeepSeek", "DeepSeek", "DeepSeek", "DeepSeek", "DeepSeek", "DeepSeek"),
  xAI: LANG("xAI", "xAI", "xAI", "xAI", "xAI", "xAI", "xAI"),
  Grok: LANG("xAI", "xAI", "xAI", "xAI", "xAI", "xAI", "xAI"),
  Moonshot: LANG("Moonshot", "Moonshot", "Moonshot", "Moonshot", "Moonshot", "Moonshot", "Moonshot"),
  MiniMax: LANG("MiniMax", "MiniMax", "MiniMax", "MiniMax", "MiniMax", "MiniMax", "MiniMax"),
  Minimax: LANG("MiniMax", "MiniMax", "MiniMax", "MiniMax", "MiniMax", "MiniMax", "MiniMax"),
  Meta: LANG("Meta", "Meta", "Meta", "Meta", "Meta", "Meta", "Meta"),
  "BRIA AI": LANG("BRIA AI", "BRIA AI", "BRIA AI", "BRIA AI", "BRIA AI", "BRIA AI", "BRIA AI"),
  "Black Forest Labs": LANG(
    "Black Forest Labs",
    "Black Forest Labs",
    "Black Forest Labs",
    "Black Forest Labs",
    "Black Forest Labs",
    "Black Forest Labs",
    "Black Forest Labs"
  ),
  ByteDance: LANG("ByteDance", "ByteDance", "ByteDance", "ByteDance", "ByteDance", "ByteDance", "ByteDance"),
  字节跳动: LANG("ByteDance", "ByteDance", "ByteDance", "ByteDance", "ByteDance", "ByteDance", "ByteDance"),
  阿里巴巴: LANG("阿里巴巴", "阿里巴巴", "Alibaba", "Alibaba", "Alibaba", "Alibaba", "Alibaba"),
  Alibaba: LANG("阿里巴巴", "阿里巴巴", "Alibaba", "Alibaba", "Alibaba", "Alibaba", "Alibaba"),
  Qwen: LANG("阿里巴巴", "阿里巴巴", "Alibaba", "Alibaba", "Alibaba", "Alibaba", "Alibaba"),
  智谱: LANG("智谱", "智譜", "Zhipu", "Zhipu", "Zhipu", "Zhipu", "Zhipu"),
  ChatGLM: LANG("智谱", "智譜", "Zhipu", "Zhipu", "Zhipu", "Zhipu", "Zhipu"),
  百度: LANG("百度", "百度", "Baidu", "Baidu", "Baidu", "Baidu", "Baidu"),
  腾讯: LANG("腾讯", "騰訊", "Tencent", "Tencent", "Tencent", "Tencent", "Tencent"),
  哔哩哔哩: LANG("哔哩哔哩", "嗶哩嗶哩", "Bilibili", "Bilibili", "Bilibili", "Bilibili", "Bilibili"),
  阶跃星辰: LANG("阶跃星辰", "階躍星辰", "StepFun", "StepFun", "StepFun", "StepFun", "StepFun"),
  其他: LANG("其他", "其他", "Other", "Autre", "Другое", "その他", "Khác"),
  Other: LANG("其他", "其他", "Other", "Autre", "Другое", "その他", "Khác"),
};

/** Single-token labels only — New API sidebar splits on spaces / · */
const TAG_LLM = LANG("大语言模型", "大型語言模型", "LLM", "LLM", "LLM", "大規模言語モデル", "LLM");
const TAG_MOD = LANG("内容风控", "內容風控", "Moderation", "Moderation", "Moderation", "コンテンツ審査", "Moderation");
const TAG_HUMAN = LANG("数字人", "數位人", "DigitalHuman", "DigitalHuman", "DigitalHuman", "デジタルヒューマン", "DigitalHuman");
const TAG_IMAGE = LANG("图片", "圖片", "Image", "Image", "Image", "画像", "Image");
const TAG_IMGPROC = LANG("图像处理", "影像處理", "ImageProc", "ImageProc", "ImageProc", "画像処理", "ImageProc");
const TAG_TTS = LANG("语音合成", "語音合成", "TTS", "TTS", "TTS", "音声合成", "TTS");
const TAG_ASR = LANG("语音识别", "語音辨識", "ASR", "ASR", "ASR", "音声認識", "ASR");
const TAG_OCR = LANG("OCR", "OCR", "OCR", "OCR", "OCR", "OCR", "OCR");
const TAG_VIDEO = LANG("视频", "影片", "Video", "Video", "Video", "動画", "Video");
const TAG_VIDEO_SEC = LANG("视频按秒", "影片按秒", "VideoSec", "VideoSec", "VideoSec", "動画秒課金", "VideoSec");
const TAG_VIDEO_REQ = LANG("视频按次", "影片按次", "VideoReq", "VideoReq", "VideoReq", "動画回課金", "VideoReq");
const TAG_FREE = LANG("免费", "免費", "Free", "Free", "Free", "無料", "Free");

const TAGS = {
  大语言模型: TAG_LLM,
  内容风控: TAG_MOD,
  数字人: TAG_HUMAN,
  图片: TAG_IMAGE,
  图像处理: TAG_IMGPROC,
  语音合成: TAG_TTS,
  语音识别: TAG_ASR,
  OCR: TAG_OCR,
  视频: TAG_VIDEO,
  // canonical (no middle-dot)
  视频按秒: TAG_VIDEO_SEC,
  视频按次: TAG_VIDEO_REQ,
  // legacy DB keys with ·
  "视频·按秒": TAG_VIDEO_SEC,
  "视频·按次": TAG_VIDEO_REQ,
  免费: TAG_FREE,
  Free: TAG_FREE,
  // fragment aliases from broken English sidebar splits
  asr: TAG_ASR,
  llm: TAG_LLM,
  image: TAG_IMAGE,
  digital: TAG_HUMAN,
  human: TAG_HUMAN,
  tts: TAG_TTS,
  video: TAG_VIDEO,
  free: TAG_FREE,
  moderation: TAG_MOD,
  ocr: TAG_OCR,
  processing: TAG_IMGPROC,
  per: TAG_VIDEO_SEC,
  second: TAG_VIDEO_SEC,
  request: TAG_VIDEO_REQ,
  VideoSec: TAG_VIDEO_SEC,
  VideoReq: TAG_VIDEO_REQ,
  DigitalHuman: TAG_HUMAN,
  ImageProc: TAG_IMGPROC,
};

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  j.__vendors__ = VENDORS;
  j.__tags__ = { ...(j.__tags__ || {}), ...TAGS };
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  console.log("patched", f);
}
