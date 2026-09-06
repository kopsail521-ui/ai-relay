/**
 * Patch marketplace-model-copy.json: __vendors__ + expanded __tags__
 * Brand names stay brand-safe (no machine-translation junk).
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

const TAGS = {
  大语言模型: LANG("大语言模型", "大型語言模型", "LLM", "LLM", "LLM", "大規模言語モデル", "LLM"),
  内容风控: LANG("内容风控", "內容風控", "Moderation", "Modération", "Модерация", "コンテンツ審査", "Kiểm duyệt"),
  数字人: LANG("数字人", "數位人", "Digital Human", "Humain digital", "Цифровой человек", "デジタルヒューマン", "Người số"),
  图片: LANG("图片", "圖片", "Image", "Image", "Изображение", "画像", "Ảnh"),
  图像处理: LANG(
    "图像处理",
    "影像處理",
    "Image Processing",
    "Traitement d’image",
    "Обработка изображений",
    "画像処理",
    "Xử lý ảnh"
  ),
  语音合成: LANG("语音合成", "語音合成", "TTS", "Synthèse vocale", "Синтез речи", "音声合成", "Tổng hợp giọng"),
  语音识别: LANG(
    "语音识别",
    "語音辨識",
    "ASR",
    "Reconnaissance vocale",
    "Распознавание речи",
    "音声認識",
    "Nhận dạng giọng"
  ),
  OCR: LANG("OCR", "OCR", "OCR", "OCR", "OCR", "OCR", "OCR"),
  视频: LANG("视频", "影片", "Video", "Vidéo", "Видео", "動画", "Video"),
  "视频·按秒": LANG("视频·按秒", "影片·按秒", "Video · per second", "Vidéo · /s", "Видео · /с", "動画·秒課金", "Video · /giây"),
  "视频·按次": LANG("视频·按次", "影片·按次", "Video · per request", "Vidéo · /req", "Видео · /запрос", "動画·回課金", "Video · /lần"),
  免费: LANG("免费", "免費", "Free", "Gratuit", "Бесплатно", "無料", "Miễn phí"),
  Free: LANG("免费", "免費", "Free", "Gratuit", "Бесплатно", "無料", "Miễn phí"),
  // aliases seen on English sidebar when DB tags leaked as English fragments
  asr: LANG("语音识别", "語音辨識", "ASR", "ASR", "ASR", "音声認識", "ASR"),
  llm: LANG("大语言模型", "大型語言模型", "LLM", "LLM", "LLM", "大規模言語モデル", "LLM"),
  image: LANG("图片", "圖片", "Image", "Image", "Image", "画像", "Ảnh"),
  digital: LANG("数字人", "數位人", "Digital Human", "Digital Human", "Digital Human", "デジタルヒューマン", "Digital Human"),
  human: LANG("数字人", "數位人", "Digital Human", "Digital Human", "Digital Human", "デジタルヒューマン", "Digital Human"),
  tts: LANG("语音合成", "語音合成", "TTS", "TTS", "TTS", "音声合成", "TTS"),
  video: LANG("视频", "影片", "Video", "Video", "Video", "動画", "Video"),
};

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  j.__vendors__ = VENDORS;
  j.__tags__ = { ...(j.__tags__ || {}), ...TAGS };
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  console.log("patched", f);
}
