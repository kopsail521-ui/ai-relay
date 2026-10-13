/**
 * agnes-video-2.5 接入：catalog + apimart-selected-models + marketplace 文案 + video-capabilities。
 *   node scripts/_add-agnes-video-25.mjs
 * 上游（grsai）按秒计价：720p ¥0.10/s · 1080p ¥0.17/s · 2k ¥0.23/s；FX=7.3；markup 1.5。
 * sell/秒 = cny/7.3×1.5 → 720p $0.020548 · 1080p $0.034932 · 2k $0.047260。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const FX = 7.3;
const MARKUP = 1.5;
const COST_CNY = { "720p": 0.1, "1080p": 0.17, "2k": 0.23 };
const round6 = (x) => Number(x.toFixed(6));
const sell = Object.fromEntries(
  Object.entries(COST_CNY).map(([k, v]) => [k, round6((v / FX) * MARKUP)])
);

// 1) 直通服务 catalog
const catPath = path.join(root, "services/apimart-passthrough/catalog.json");
const cat = JSON.parse(fs.readFileSync(catPath, "utf8"));
if (!cat.models.some((m) => m.id === "agnes-video-2.5")) {
  cat.models.push({
    id: "agnes-video-2.5",
    vendor: "Agnes AI",
    icon: "Custom",
    tag: "视频",
    upstream: "grsai",
    upstream_model: "agnes-video-2.5",
    markup: MARKUP,
    billing: "settle_cost",
    display_unit: "second",
    estimate: {
      mode: "per_second_resolution_cny",
      default_seconds: 5,
      default_resolution: "720p",
      allowed_resolutions: ["720p", "1080p", "2k"],
      max_seconds: 12,
      cost_cny_per_second: {
        "720p": 0.1,
        "720P": 0.1,
        "1080p": 0.17,
        "1080P": 0.17,
        "2k": 0.23,
        "2K": 0.23,
      },
      sell_usd_per_second: sell,
    },
    desc_zh:
      "Agnes Video 2.5 视频生成，文生视频/图生视频，支持 720p / 1080p / 2k，最长 12 秒，按秒计费。",
  });
}
fs.writeFileSync(catPath, JSON.stringify(cat, null, 2) + "\n", "utf8");

// 2) apimart-selected-models（new-api 目录展示用 ModelPrice = 默认档每秒售价）
const selPath = path.join(root, "config/apimart-selected-models.json");
const sel = JSON.parse(fs.readFileSync(selPath, "utf8"));
if (!sel.models.some((m) => m.id === "agnes-video-2.5")) {
  sel.models.push({
    id: "agnes-video-2.5",
    vendor: "Agnes AI",
    icon: "Custom",
    tag: "视频按秒",
    billing: "settle_cost",
    model_price_usd: sell["720p"],
    sell_usd_per_second: sell,
    desc_zh:
      "Agnes Video 2.5：文生视频/图生视频，720p/1080p/2k，最长 12 秒，按秒计费（720p $0.020548/秒、1080p $0.034932/秒、2k $0.047260/秒）。",
  });
}
fs.writeFileSync(selPath, JSON.stringify(sel, null, 2) + "\n", "utf8");

// 3) marketplace 文案（config + services 逐字节一致）
const priceLine = `计费：按秒，720p $${sell["720p"]}/秒、1080p $${sell["1080p"]}/秒、2k $${sell["2k"]}/秒（最长 12 秒）。`;
const entry = {
  display_names: "Agnes Video 2.5",
  description: `Agnes Video 2.5 视频生成：文生视频、图生视频，支持 720p / 1080p / 2k。 ${priceLine}`,
  description_zh: `Agnes Video 2.5 视频生成：文生视频、图生视频，支持 720p / 1080p / 2k。 ${priceLine}`,
  description_en: `Agnes Video 2.5 video generation: text-to-video and image-to-video at 720p / 1080p / 2k. Billing: per second, 720p $${sell["720p"]}/s, 1080p $${sell["1080p"]}/s, 2k $${sell["2k"]}/s (up to 12s).`,
  descriptions: {
    zhCN: `Agnes Video 2.5 视频生成：文生视频、图生视频，支持 720p / 1080p / 2k。 ${priceLine}`,
    zhTW: `Agnes Video 2.5 影片生成：文生影片、圖生影片，支援 720p / 1080p / 2k。 計費：按秒，720p $${sell["720p"]}/秒、1080p $${sell["1080p"]}/秒、2k $${sell["2k"]}/秒（最長 12 秒）。`,
    en: `Agnes Video 2.5 video generation: text-to-video and image-to-video at 720p / 1080p / 2k. Billing: per second, 720p $${sell["720p"]}/s, 1080p $${sell["1080p"]}/s, 2k $${sell["2k"]}/s (up to 12s).`,
    fr: `Agnes Video 2.5 — génération vidéo texte-vidéo et image-vidéo en 720p / 1080p / 2k. Facturation à la seconde : 720p $${sell["720p"]}/s, 1080p $${sell["1080p"]}/s, 2k $${sell["2k"]}/s (max 12s).`,
    ru: `Agnes Video 2.5 — генерация видео из текста и изображения, 720p / 1080p / 2k. Оплата посекундно: 720p $${sell["720p"]}/с, 1080p $${sell["1080p"]}/с, 2k $${sell["2k"]}/с (до 12 с).`,
    ja: `Agnes Video 2.5。テキスト・画像から動画を生成、720p / 1080p / 2k 対応。課金：秒ごと（720p $${sell["720p"]}/秒、1080p $${sell["1080p"]}/秒、2k $${sell["2k"]}/秒、最大12秒）。`,
    vi: `Agnes Video 2.5 — tạo video từ văn bản và ảnh, 720p / 1080p / 2k. Tính phí theo giây: 720p $${sell["720p"]}/s, 1080p $${sell["1080p"]}/s, 2k $${sell["2k"]}/s (tối đa 12s).`,
  },
  unit: "second",
  badge: {
    zhCN: "按秒计费",
    zhTW: "按秒計費",
    en: "Per-second",
    fr: "À la seconde",
    ru: "Посекундно",
    ja: "秒課金",
    vi: "Theo giây",
  },
  suffix: {
    zhCN: "",
    zhTW: "",
    en: "",
    fr: "",
    ru: "",
    ja: "",
    vi: "",
  },
  price_key: {
    zhCN: "",
    zhTW: "",
    en: "",
    fr: "",
    ru: "",
    ja: "",
    vi: "",
  },
};
const copyPaths = [
  path.join(root, "config/marketplace-model-copy.json"),
  path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json"),
];
for (const p of copyPaths) {
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  data["agnes-video-2.5"] = entry;
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}
if (!fs.readFileSync(copyPaths[0]).equals(fs.readFileSync(copyPaths[1]))) {
  throw new Error("copies differ");
}

// 4) video-capabilities.json 合同
const capPath = path.join(root, "static/brand/video-capabilities.json");
const cap = JSON.parse(fs.readFileSync(capPath, "utf8"));
if (!Object.prototype.hasOwnProperty.call(cap.models, "agnes-video-2.5")) {
  cap.models["agnes-video-2.5"] = {
    required: ["model", "prompt"],
    enums: {
      aspectRatio: ["landscape", "portrait"],
      aspectRatio_aliases: ["16:9→landscape", "9:16→portrait"],
      resolution: ["720p", "1080p", "2k"],
      duration: "1–12 seconds (default 5)",
    },
    optional: ["duration", "resolution", "aspectRatio", "images (≤9)", "audios (≤3)", "seed"],
    examples: {
      basic: {
        body: {
          model: "agnes-video-2.5",
          prompt: "A drone shot over neon city rain, cinematic",
          duration: 5,
          resolution: "720p",
          aspectRatio: "landscape",
        },
      },
      i2v: {
        body: {
          model: "agnes-video-2.5",
          prompt: "Animate this scene with gentle parallax",
          duration: 8,
          resolution: "1080p",
          images: ["https://example.com/frame.jpg"],
        },
      },
    },
    forbidden: ["duration > 12", "resolution outside 720p/1080p/2k (falls back to 720p)"],
    billing: `per second × resolution: 720p $${sell["720p"]}, 1080p $${sell["1080p"]}, 2k $${sell["2k"]}; final charge settles on actual upstream duration (failed tasks refund)`,
  };
}
fs.writeFileSync(capPath, JSON.stringify(cap, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify({ ok: true, sell_per_second: sell, display_model_price: sell["720p"] })
);
