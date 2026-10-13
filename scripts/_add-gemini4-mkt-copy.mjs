/**
 * 为 gemini-4-argon / gemini-4-barium 追加 marketplace 文案（config 与 services 逐字节一致）。
 *   node scripts/_add-gemini4-mkt-copy.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const COPY = {
  "gemini-4-argon": {
    description:
      "Gemini 4 Argon 对话模型：强编码、推理与多模态能力，适合长时间多步骤的企业工作流与智能体任务。",
    description_zh:
      "Gemini 4 Argon 对话模型：强编码、推理与多模态能力，适合长时间多步骤的企业工作流与智能体任务。",
    description_en:
      "Gemini 4 Argon chat model with strong coding, reasoning and multimodal skills for long multi-step enterprise workflows and agents.",
    descriptions: {
      zhCN:
        "Gemini 4 Argon 对话模型：强编码、推理与多模态能力，适合长时间多步骤的企业工作流与智能体任务。",
      zhTW:
        "Gemini 4 Argon 對話模型：強編碼、推理與多模態能力，適合長時間多步驟的企業工作流程與智能體任務。",
      en:
        "Gemini 4 Argon chat model with strong coding, reasoning and multimodal skills for long multi-step enterprise workflows and agents.",
      fr:
        "Gemini 4 Argon — modèle de chat robuste en code, raisonnement et multimodal pour les workflows d'entreprise multi-étapes et les agents.",
      ru:
        "Gemini 4 Argon — диалоговая модель с сильным кодингом, рассуждениями и мультимодальностью для многошаговых корпоративных процессов и агентов.",
      ja:
        "Gemini 4 Argon。コーディング・推論・マルチモーダルに強い対話モデル。長時間の多段階ワークフローやエージェントに適する。",
      vi:
        "Gemini 4 Argon — mô hình hội thoại mạnh về lập trình, suy luận và đa phương thức cho quy trình doanh nghiệp nhiều bước và tác tử.",
    },
    display_names: "Gemini 4 Argon",
  },
  "gemini-4-barium": {
    description:
      "Gemini 4 Barium 对话模型：百万级上下文与多模态，覆盖代码、法务金融与漏洞推理等复杂任务。",
    description_zh:
      "Gemini 4 Barium 对话模型：百万级上下文与多模态，覆盖代码、法务金融与漏洞推理等复杂任务。",
    description_en:
      "Gemini 4 Barium chat model with million-token context and multimodal coverage of code, legal/finance and vulnerability reasoning.",
    descriptions: {
      zhCN:
        "Gemini 4 Barium 对话模型：百万级上下文与多模态，覆盖代码、法务金融与漏洞推理等复杂任务。",
      zhTW:
        "Gemini 4 Barium 對話模型：百萬級上下文與多模態，涵蓋程式碼、法務金融與漏洞推理等複雜任務。",
      en:
        "Gemini 4 Barium chat model with million-token context and multimodal coverage of code, legal/finance and vulnerability reasoning.",
      fr:
        "Gemini 4 Barium — modèle de chat avec contexte d'un million de tokens et multimodal : code, juridique/finance et raisonnement de vulnérabilités.",
      ru:
        "Gemini 4 Barium — диалоговая модель с контекстом в миллион токенов и мультимодальностью: код, право/финансы и поиск уязвимостей.",
      ja:
        "Gemini 4 Barium。100万トークン級コンテキストとマルチモーダル対応。コード、法務・金融、脆弱性推論まで幅広く扱う。",
      vi:
        "Gemini 4 Barium — mô hình hội thoại với ngữ cảnh cấp triệu token và đa phương thức, bao phủ mã nguồn, pháp lý/tài chính và suy luận lỗ hổng.",
    },
    display_names: "Gemini 4 Barium",
  },
};

const paths = [
  path.join(root, "config/marketplace-model-copy.json"),
  path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json"),
];

for (const p of paths) {
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [k, v] of Object.entries(COPY)) data[k] = v;
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const a = fs.readFileSync(paths[0]);
const b = fs.readFileSync(paths[1]);
if (!a.equals(b)) throw new Error("copies differ");

const check = JSON.parse(fs.readFileSync(paths[0], "utf8"));
for (const k of Object.keys(COPY)) {
  if (JSON.stringify(check[k]) !== JSON.stringify(COPY[k])) throw new Error("copy mismatch " + k);
}
console.log(
  JSON.stringify({ ok: true, total: Object.keys(check).length, added: Object.keys(COPY) })
);
