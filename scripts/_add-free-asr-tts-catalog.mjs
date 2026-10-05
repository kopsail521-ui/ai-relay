/**
 * Add free SenseVoiceSmall (ASR) + Spark-TTS-0.5B (async TTS); delist Qwen3-VL-Embedding-8B.
 * String surgery on config/gitee-selected-models.json to preserve hand formatting.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const f = path.join(root, "config/gitee-selected-models.json");
let s = fs.readFileSync(f, "utf8");

// 1) categories: asr += SenseVoiceSmall, tts += Spark-TTS-0.5B, rag -= Qwen3-VL-Embedding-8B
const catBefore = s;
s = s.replace(
  `"asr": [
      "MOSS-Audio-8B-Thinking",
      "Fun-ASR-Nano-2512",
      "GLM-ASR",
      "whisper-large-v3",
      "whisper-large-v3-turbo"
    ],`,
  `"asr": [
      "MOSS-Audio-8B-Thinking",
      "Fun-ASR-Nano-2512",
      "GLM-ASR",
      "whisper-large-v3",
      "whisper-large-v3-turbo",
      "SenseVoiceSmall"
    ],`
);
s = s.replace(
  `"tts": [
      "Qwen3-TTS",
      "CosyVoice3",
      "GLM-TTS",
      "IndexTTS-2",
      "Step-Audio-TTS-3B"
    ],`,
  `"tts": [
      "Qwen3-TTS",
      "CosyVoice3",
      "GLM-TTS",
      "IndexTTS-2",
      "Step-Audio-TTS-3B",
      "Spark-TTS-0.5B"
    ],`
);
s = s.replace(
  `"rag": [
      "WeMM-Embedding-9B",
      "WeMM-Embedding-4B",
      "WeMM-Embedding-2B",
      "Qwen3-VL-Reranker-2B",
      "Qwen3-VL-Reranker-8B",
      "Qwen3-VL-Embedding-8B"
    ],`,
  `"rag": [
      "WeMM-Embedding-9B",
      "WeMM-Embedding-4B",
      "WeMM-Embedding-2B",
      "Qwen3-VL-Reranker-2B",
      "Qwen3-VL-Reranker-8B"
    ],`
);
if (s === catBefore) throw new Error("categories replace failed");

// 2) remove Qwen3-VL-Embedding-8B model entry (object ends right before Bespoke entry)
const qid = s.indexOf(`    {
      "id": "Qwen3-VL-Embedding-8B"`);
if (qid < 0) throw new Error("Qwen3-VL-Embedding-8B entry not found");
const qEnd = s.indexOf(`
    },
`, qid);
if (qEnd < 0) throw new Error("Qwen3-VL-Embedding-8B end not found");
// cut through the closing "    },\n" line (7-char needle starts at qEnd)
s = s.slice(0, qid) + s.slice(qEnd + 1 + 6);

// 3) insert SenseVoiceSmall right AFTER whisper-large-v3-turbo's closing line
const wId = s.indexOf(`"id": "whisper-large-v3-turbo"`);
if (wId < 0) throw new Error("whisper-turbo not found");
const wEnd = s.indexOf(`
    },
`, wId);
if (wEnd < 0) throw new Error("whisper-turbo end not found");
const wIns = wEnd + 1 + 6; // just past "    },\n"
const senseVoice = `    {
      "id": "SenseVoiceSmall",
      "upstream": "SenseVoiceSmall",
      "category": "asr",
      "category_zh": "语音识别 ASR",
      "description": "SenseVoiceSmall：FunAudioLLM 轻量级语音识别模型，低延迟、高准确度，适合实时转写、会议记录与语音交互（免费）。计费：$0/次。",
      "cover": "https://gitee-ai.su.bcebos.com/v1/uploads/img/news_cover_2-avatar-funaudiollm.png",
      "paths": [
        "v1/audio/transcriptions"
      ],
      "operations": [
        {
          "name": "语音识别",
          "type": "speech2text",
          "path": "v1/audio/transcriptions",
          "price_cny": 0,
          "unit_tag": 0,
          "in_m": 0,
          "out_m": 0
        }
      ],
      "billing": {
        "mode": "unit",
        "unit": "per_call",
        "unit_label": "次",
        "unit_note": "免费",
        "unit_tag": 0,
        "cost_cny": 0,
        "sell_cny": 0,
        "model_price_usd": 0,
        "free_upstream": true
      },
      "relay": "newapi_native",
      "markup": 5,
      "description_en": "SenseVoiceSmall — lightweight speech recognition by FunAudioLLM: low latency, high accuracy for realtime transcription, meeting notes, and voice interaction. Free."
    },`;
s = s.slice(0, wIns) + senseVoice + s.slice(wIns);

// 4) insert Spark-TTS-0.5B right AFTER Step-Audio-TTS-3B's closing line
const stId = s.indexOf(`"id": "Step-Audio-TTS-3B"`);
if (stId < 0) throw new Error("Step-Audio-TTS-3B not found");
const stEnd = s.indexOf(`
    },
`, stId);
if (stEnd < 0) throw new Error("Step-Audio-TTS-3B end not found");
const stIns = stEnd + 1 + 6; // just past "    },\n"
const spark = `    {
      "id": "Spark-TTS-0.5B",
      "upstream": "Spark-TTS-0.5B",
      "category": "tts",
      "category_zh": "语音合成 TTS",
      "description": "Spark-TTS 0.5B：基于 LLM 的文本转语音系统，高精度自然合成，支持多语言与音色克隆（异步接口，免费）。计费：$0/次。",
      "cover": "https://gitee-ai.su.bcebos.com/v1/uploads/img/id-uyn4fzvdq-avatar-sparktts.png",
      "paths": [
        "v1/async/audio/speech"
      ],
      "operations": [
        {
          "name": "语音生成",
          "type": "text2speech",
          "path": "v1/async/audio/speech",
          "price_cny": 0,
          "unit_tag": 0,
          "in_m": 0,
          "out_m": 0
        },
        {
          "name": "音色克隆",
          "type": "text2speech",
          "path": "v1/async/audio/speech",
          "price_cny": 0,
          "unit_tag": 0,
          "in_m": 0,
          "out_m": 0
        }
      ],
      "billing": {
        "mode": "unit",
        "unit": "per_call",
        "unit_label": "次",
        "unit_note": "免费",
        "unit_tag": 0,
        "cost_cny": 0,
        "sell_cny": 0,
        "model_price_usd": 0,
        "free_upstream": true
      },
      "relay": "gitee_passthrough",
      "markup": 5,
      "description_en": "Spark-TTS 0.5B — LLM-based text-to-speech with natural, high-fidelity voices; multilingual, with voice cloning via the async speech endpoint. Free."
    },`;
s = s.slice(0, stIns) + spark + s.slice(stIns);

const j = JSON.parse(s); // throws if broken
const ids = j.models.map((m) => m.id);
for (const want of ["SenseVoiceSmall", "Spark-TTS-0.5B"]) {
  if (!ids.includes(want)) throw new Error("missing " + want);
}
if (ids.includes("Qwen3-VL-Embedding-8B")) throw new Error("delist target still present");
fs.writeFileSync(f, s);
console.log("OK models:", ids.length, "| asr/tts/rag updated, qwen3vl-embedding-8b removed");
