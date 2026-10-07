/**
 * nano-banana-2.1 (Grsai): marketplace copy (7 locales, per-request card),
 * RULES entry, docs image-pricing table row.
 * Cost ¥0.06/张 x1.5 / 7.3 = $0.0123/request.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);

const ID = "nano-banana-2.1";
const PRICE = "$0.0123";

const D = {
  zhCN: "Nano Banana 2.1：新一代出图模型，速度快、效果好，按张计费。 计费：$0.0123/次。",
  zhTW: "Nano Banana 2.1：新一代出圖模型，速度快、效果好，按張計費。 計費：$0.0123/次。",
  en: "Next-gen image model — fast and high quality. Billed per image. Pricing: $0.0123 / request.",
  fr: "Modèle d'image nouvelle génération — rapide et de haute qualité. Facturé par image. Tarif : 0,0123 $ / requête.",
  ru: "Модель изображений нового поколения — быстро и качественно. Оплата за изображение. Тариф: $0.0123 / запрос.",
  ja: "次世代画像生成モデル — 高速・高品質。1枚ごとの課金。料金：$0.0123/ 回。",
  vi: "Mô hình tạo ảnh thế hệ mới — nhanh và chất lượng. Tính phí theo ảnh. Giá: $0.0123/ lần.",
};

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

/* ---------- marketplace copy (both) ---------- */
for (const f of [
  "config/marketplace-model-copy.json",
  "services/creem-moderation-proxy/marketplace-model-copy.json",
]) {
  const j = JSON.parse(read(f));
  j[ID] = {
    description: D.zhCN,
    descriptions: { zhCN: D.zhCN, zhTW: D.zhTW, en: D.en, fr: D.fr, ru: D.ru, ja: D.ja, vi: D.vi },
    unit: "request",
    badge: BADGE,
    suffix: SUFFIX,
    price_key: PRICE_KEY,
    description_zh: D.zhCN,
    description_en: D.en,
    badge_zh: BADGE.zhCN,
    badge_en: BADGE.en,
    suffix_zh: SUFFIX.zhCN,
    suffix_en: SUFFIX.en,
    price_key_zh: PRICE_KEY.zhCN,
    price_key_en: PRICE_KEY.en,
  };
  write(f, JSON.stringify(j, null, 2) + "\n");
  console.log("copy", f.split("/").pop(), "| has", ID, !!j[ID]);
}

/* ---------- RULES ---------- */
const rulesPath = "services/gitee-passthrough/fix-marketplace-meta.mjs";
let m = read(rulesPath);
const anchor = '  "nano-banana-2": { vendor: "Google", tag: "图片", endpoints: EP.image },';
const newRule =
  anchor +
  `\n  "nano-banana-2.1": { vendor: "Google", tag: "图片", endpoints: EP.image, icon: "Gemini.Color" },`;
if (!m.includes(anchor)) throw new Error("nano-banana-2 rule anchor not found");
if (!m.includes('"nano-banana-2.1"')) m = m.replace(anchor, newRule);
write(rulesPath, m);
console.log("RULES: nano-banana-2.1 -> 图片 / Google");

/* ---------- docs image pricing row ---------- */
const docsPath = "static/brand/keyo-docs.html";
let s = read(docsPath);
const proRow = '<tr><td class="model"><button type="button" class="model-btn" data-copy="nano-banana-pro">nano-banana-pro</button></td><td class="price">~$0.0274 <span data-i18n="perImage"></span></td></tr>';
if (!s.includes(proRow)) throw new Error("nano-banana-pro docs row not found");
const newRow = proRow + '\n<tr><td class="model"><button type="button" class="model-btn" data-copy="nano-banana-2.1">nano-banana-2.1</button></td><td class="price">' + PRICE + ' <span data-i18n="perImage"></span></td></tr>';
s = s.replace(proRow, newRow);
write(docsPath, s);
console.log("docs image table: nano-banana-2.1 row added");
console.log("DONE_GRSAI_NANO21");
