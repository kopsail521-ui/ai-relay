/**
 * Marketplace copy: add free SenseVoiceSmall + Spark-TTS-0.5B (per-call $0 card),
 * remove Qwen3-VL-Embedding-8B entry. Both config and creem proxy copies.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const BADGE = {
  zhCN: "按次计费",
  zhTW: "按次計費",
  en: "Per Request",
  fr: "Par requête",
  ru: "За запрос",
  ja: "リクエスト課金",
  vi: "Theo lần gọi",
};
const SUFFIX = {
  zhCN: "/次",
  zhTW: "/次",
  en: "/ request",
  fr: "/ requête",
  ru: "/ запрос",
  ja: "/ 回",
  vi: "/ lần",
};
const PRICE_KEY = {
  zhCN: "每次请求",
  zhTW: "每次請求",
  en: "Per request",
  fr: "Par requête",
  ru: "За запрос",
  ja: "リクエストごと",
  vi: "Mỗi lần gọi",
};

const MODELS = [
  {
    id: "SenseVoiceSmall",
    zhCN:
      "SenseVoiceSmall：FunAudioLLM 轻量级语音识别模型，低延迟、高准确度，适合实时转写、会议记录与语音交互（免费）。 计费：$0/次。",
    zhTW:
      "SenseVoiceSmall：FunAudioLLM 輕量級語音辨識模型，低延遲、高準確度，適合即時轉寫、會議記錄與語音互動（免費）。 計費：$0/次。",
    en: "SenseVoiceSmall — lightweight speech recognition by FunAudioLLM: low latency, high accuracy for realtime transcription, meeting notes, and voice interaction. Free. Pricing: $0 / request.",
    fr: "SenseVoiceSmall — reconnaissance vocale légère de FunAudioLLM : faible latence, haute précision pour la transcription temps réel, notes de réunion et interaction vocale. Gratuit. Tarif : $0 / requête.",
    ru: "SenseVoiceSmall — лёгкое распознавание речи от FunAudioLLM: низкая задержка, высокая точность для транскрибации в реальном времени, заметок со встреч и голосового взаимодействия. Бесплатно. Тариф: $0 / запрос.",
    ja: "SenseVoiceSmall：FunAudioLLM 製の軽量音声認識モデル。低遅延・高精度で、リアルタイム文字起こし、議事録、音声インタラクションに最適（無料）。 料金：$0/ 回。",
    vi: "SenseVoiceSmall — nhận dạng giọng nói nhẹ của FunAudioLLM: độ trễ thấp, độ chính xác cao cho chuyển giọng thời gian thực, biên bản họp và tương tác giọng nói. Miễn phí. Giá: $0/ lần.",
  },
  {
    id: "Spark-TTS-0.5B",
    zhCN:
      "Spark-TTS 0.5B：基于 LLM 的文本转语音系统，高精度自然合成，支持多语言与音色克隆（异步接口，免费）。 计费：$0/次。",
    zhTW:
      "Spark-TTS 0.5B：基於 LLM 的文字轉語音系統，高精度自然合成，支援多語言與音色克隆（非同步介面，免費）。 計費：$0/次。",
    en: "Spark-TTS 0.5B — LLM-based text-to-speech with natural, high-fidelity voices; multilingual, with voice cloning via the async speech endpoint. Free. Pricing: $0 / request.",
    fr: "Spark-TTS 0.5B — synthèse vocale basée sur LLM, voix naturelles haute fidélité ; multilingue, avec clonage de voix via le endpoint vocal async. Gratuit. Tarif : $0 / requête.",
    ru: "Spark-TTS 0.5B — синтез речи на основе LLM: естественные голоса высокого качества; многоязычность и клонирование голоса через async-эндпоинт. Бесплатно. Тариф: $0 / запрос.",
    ja: "Spark-TTS 0.5B：LLM ベースのテキスト音声合成。高精度で自然な声、多言語対応、非同期エンドポイントでの音声クローン対応（無料）。 料金：$0/ 回。",
    vi: "Spark-TTS 0.5B — tổng hợp giọng nói dựa trên LLM: giọng tự nhiên, trung thực; đa ngôn ngữ, hỗ trợ nhân bản giọng qua endpoint speech bất đồng bộ. Miễn phí. Giá: $0/ lần.",
  },
];

const DELIST = "Qwen3-VL-Embedding-8B";

const FILES = [
  path.join(root, "config/marketplace-model-copy.json"),
  path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json"),
];

for (const f of FILES) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const m of MODELS) {
    j[m.id] = {
      description: m.zhCN,
      descriptions: {
        zhCN: m.zhCN,
        zhTW: m.zhTW,
        en: m.en,
        fr: m.fr,
        ru: m.ru,
        ja: m.ja,
        vi: m.vi,
      },
      unit: "request",
      badge: BADGE,
      suffix: SUFFIX,
      price_key: PRICE_KEY,
      description_zh: m.zhCN,
      description_en: m.en,
      badge_zh: BADGE.zhCN,
      badge_en: BADGE.en,
      suffix_zh: SUFFIX.zhCN,
      suffix_en: SUFFIX.en,
      price_key_zh: PRICE_KEY.zhCN,
      price_key_en: PRICE_KEY.en,
    };
  }
  delete j[DELIST];
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  console.log(
    "updated",
    path.relative(root, f),
    "| has SenseVoice:", !!j["SenseVoiceSmall"],
    "| has Spark:", !!j["Spark-TTS-0.5B"],
    "| qwen3vl removed:", !(DELIST in j)
  );
}
console.log("DONE_MKT_COPY_FREE2");
