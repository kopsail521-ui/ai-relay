/**
 * 补齐 agnes-video-2.5 的分组价格表文案（对齐 MiniMax-H3 结构）。
 *   node scripts/_fix-agnes-price-table.mjs
 * 展示价（5位小数）：720p $0.02055 / 1080p $0.03493 / 2k $0.04726（每秒）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const BILL_ZH = "计费：720p $0.02055/秒；1080p $0.03493/秒；2k $0.04726/秒。";
const BILL_EN = "Billing: 720p $0.02055/sec; 1080p $0.03493/sec; 2k $0.04726/sec.";
const DESC_ZH = `Agnes Video 2.5 视频生成，文生视频 / 图生视频，支持 720p / 1080p / 2k，最长 12 秒。 ${BILL_ZH}`;
const DESC_EN = `Agnes Video 2.5 video generation: text-to-video and image-to-video at 720p / 1080p / 2k, up to 12 seconds. ${BILL_EN}`;

const entry = {
  display_names: "Agnes Video 2.5",
  description: DESC_ZH,
  descriptions: {
    zhCN: DESC_ZH,
    zhTW:
      "Agnes Video 2.5 影片生成，文生影片 / 圖生影片，支援 720p / 1080p / 2k，最長 12 秒。 計費：720p $0.02055/秒；1080p $0.03493/秒；2k $0.04726/秒。",
    en: DESC_EN,
    fr: "Agnes Video 2.5 — génération vidéo texte-vidéo / image-vidéo en 720p / 1080p / 2k, jusqu'à 12 secondes. Facturation : 720p $0.02055/s ; 1080p $0.03493/s ; 2k $0.04726/s.",
    ru: "Agnes Video 2.5 — генерация видео из текста и изображения, 720p / 1080p / 2k, до 12 секунд. Оплата: 720p $0.02055/с; 1080p $0.03493/с; 2k $0.04726/с.",
    ja: "Agnes Video 2.5。テキスト・画像から動画生成、720p / 1080p / 2k、最大12秒。課金：720p $0.02055/秒；1080p $0.03493/秒；2k $0.04726/秒。",
    vi: "Agnes Video 2.5 — tạo video từ văn bản / ảnh, 720p / 1080p / 2k, tối đa 12 giây. Tính phí: 720p $0.02055/giây; 1080p $0.03493/giây; 2k $0.04726/giây.",
  },
  unit: "second",
  badge: {
    zhCN: "按秒收费",
    zhTW: "按秒計費",
    en: "Per Second",
    fr: "À la seconde",
    ru: "За секунду",
    ja: "秒課金",
    vi: "Theo giây",
  },
  suffix: {
    zhCN: "/秒",
    zhTW: "/秒",
    en: "/ second",
    fr: "/ seconde",
    ru: "/ сек",
    ja: "/ 秒",
    vi: "/ giây",
  },
  price_key: {
    zhCN: "每秒",
    zhTW: "每秒",
    en: "Per second",
    fr: "Par seconde",
    ru: "За секунду",
    ja: "秒ごと",
    vi: "Mỗi giây",
  },
  badge_zh: "按秒收费",
  badge_en: "Per Second",
  suffix_zh: "/秒",
  suffix_en: "/ second",
  price_key_zh: "每秒",
  price_key_en: "Per second",
  description_zh: DESC_ZH,
  description_en: DESC_EN,
  price_table: {
    columns: {
      zhCN: ["分辨率", "场景", "价格 (/秒)"],
      en: ["Resolution", "Scenario", "Price (/sec)"],
    },
    rows: [
      ["720p", "标准输出", "$0.02055"],
      ["1080p", "标准输出", "$0.03493"],
      ["2k", "标准输出", "$0.04726"],
    ],
  },
};

const paths = [
  path.join(root, "config/marketplace-model-copy.json"),
  path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json"),
];
for (const p of paths) {
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  data["agnes-video-2.5"] = entry;
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}
if (!fs.readFileSync(paths[0]).equals(fs.readFileSync(paths[1]))) {
  throw new Error("copies differ");
}
const check = JSON.parse(fs.readFileSync(paths[0], "utf8"))["agnes-video-2.5"];
if (!check.price_table || check.price_table.rows.length !== 3) {
  throw new Error("price_table missing");
}
console.log(JSON.stringify({ ok: true, rows: check.price_table.rows.length }));
