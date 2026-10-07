/**
 * Restore the 4 SenseNova free twins to config/sensenova-free-models.json
 * (relisted 2026-10, ":free" suffix). Tags follow the new convention: 大语言模型
 * only — the price-based 免费 pricing filter catches them (ModelPrice=0). The
 * ":free" suffix is what new-api FreeModelTwin strips to find the paid twin.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const f = path.join(root, "config/sensenova-free-models.json");
const j = JSON.parse(fs.readFileSync(f, "utf8"));

j.note =
  "免费线对外 ID 用 :free 后缀（new-api 孪生剥离只认 :free，见 new-api/model/gift_models.go FreeModelTwin）；渠道 model_mapping 映射到上游裸名。对外勿写 SenseNova。2026-10-06 重新上架 4 个免费孪生（此前 2026-09-23 下架）；2026-10-08 由 -free 改为 :free 以接入赠送金孪生计费；标签按新约定只挂大语言模型，免费走价格筛选。";
j.base_url = "https://token.sensenova.cn";
j.channel_name = "Keyo Free";
j.models = [
  {
    id: "glm-5.2:free",
    upstream: "glm-5.2",
    vendor: "GLM",
    icon: "ChatGLM.Color",
    tags: "大语言模型",
    desc_zh: "GLM 5.2 免费额度（与收费版 glm-5.2 区分）。",
    desc_en: "GLM 5.2 free tier (distinct from paid glm-5.2).",
  },
  {
    id: "kimi-k3:free",
    upstream: "kimi-k3",
    vendor: "Moonshot",
    icon: "Moonshot",
    tags: "大语言模型",
    desc_zh: "Kimi K3 免费额度（与收费版 kimi-k3 区分）。",
    desc_en: "Kimi K3 free tier (distinct from paid kimi-k3).",
  },
  {
    id: "deepseek-v4-pro:free",
    upstream: "deepseek-v4-pro",
    vendor: "DeepSeek",
    icon: "DeepSeek",
    tags: "大语言模型",
    desc_zh: "DeepSeek V4 Pro 免费额度（与收费版 deepseek-v4-pro 区分）。",
    desc_en: "DeepSeek V4 Pro free tier (distinct from paid deepseek-v4-pro).",
  },
  {
    id: "deepseek-v4-flash:free",
    upstream: "deepseek-v4-flash",
    vendor: "DeepSeek",
    icon: "DeepSeek",
    tags: "大语言模型",
    desc_zh: "DeepSeek V4 Flash 免费额度（与收费版 deepseek-v4-flash 区分）。",
    desc_en: "DeepSeek V4 Flash free tier (distinct from paid deepseek-v4-flash).",
  },
];

fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
console.log(
  "restored:",
  j.models.map((m) => m.id).join(", ")
);
