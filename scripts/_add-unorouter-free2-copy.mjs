/**
 * UnoRouter free2: add marketplace copy entries (desc-only shape, same as the
 * other :free models) to both copies, and register them on the /free-models
 * page via config/seo/free-models-extra.json.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const MODELS = [
  {
    id: "k2-horizon:free",
    zhCN: "K2 Horizon 免费额度：通用对话模型，适合日常问答与轻量任务。",
    zhTW: "K2 Horizon 免費額度：通用對話模型，適合日常問答與輕量任務。",
    en: "Free K2 Horizon: general chat for everyday Q&A and light tasks.",
    fr: "K2 Horizon gratuit : chat général pour questions courantes et tâches légères.",
    ru: "Бесплатный K2 Horizon: универсальный чат для повседневных вопросов и лёгких задач.",
    ja: "K2 Horizon 無料枠：日常の質問応答や軽いタスク向けの汎用対話モデル。",
    vi: "K2 Horizon miễn phí: chat tổng quát cho hỏi đáp hằng ngày và tác vụ nhẹ.",
  },
  {
    id: "space-bunny-alpha:free",
    zhCN: "Space Bunny Alpha 免费额度：实验性通用对话模型。",
    zhTW: "Space Bunny Alpha 免費額度：實驗性通用對話模型。",
    en: "Free Space Bunny Alpha: experimental general chat.",
    fr: "Space Bunny Alpha gratuit : chat général expérimental.",
    ru: "Бесплатный Space Bunny Alpha: экспериментальный универсальный чат.",
    ja: "Space Bunny Alpha 無料枠：実験的な汎用対話モデル。",
    vi: "Space Bunny Alpha miễn phí: chat tổng quát thử nghiệm.",
  },
];

const COPY_FILES = [
  path.join(root, "config/marketplace-model-copy.json"),
  path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json"),
];

for (const f of COPY_FILES) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const m of MODELS) {
    j[m.id] = {
      description: m.zhCN,
      description_zh: m.zhCN,
      description_en: m.en,
      descriptions: {
        zhCN: m.zhCN,
        zhTW: m.zhTW,
        en: m.en,
        fr: m.fr,
        ru: m.ru,
        ja: m.ja,
        vi: m.vi,
      },
    };
  }
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  console.log("copy", path.relative(root, f), "keys", Object.keys(j).length);
}

// /free-models page registry
const extraPath = path.join(root, "config/seo/free-models-extra.json");
const extra = JSON.parse(fs.readFileSync(extraPath, "utf8"));
const have = new Set((extra.models || []).map((m) => m.id));
for (const m of MODELS) {
  if (!have.has(m.id)) {
    extra.models.push({
      id: m.id,
      family: m.id.startsWith("k2-") ? "Moonshot" : "Other",
      note: "Fixed $0 on Keyo catalog (fair-use). Availability can change; confirm live on /pricing.",
    });
  }
}
extra.synced_at = "2026-10-05";
fs.writeFileSync(extraPath, JSON.stringify(extra, null, 2) + "\n");
console.log("free-models-extra models:", extra.models.length);
console.log("DONE_UNO_FREE2_COPY");
