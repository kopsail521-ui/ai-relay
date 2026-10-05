/**
 * Add 3 System One models to both marketplace copy files (config + creem proxy).
 * Same shape as Bespoke-Nimble-9B entry: description + 7-locale descriptions +
 * token unit/badge/suffix/price_key + flat _zh/_en fields.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const BADGE = {
  zhCN: "按量计费",
  zhTW: "按量計費",
  en: "Token",
  fr: "Token",
  ru: "Token",
  ja: "従量",
  vi: "Theo token",
};
const SUFFIX = {
  zhCN: "/百万tokens",
  zhTW: "/百萬tokens",
  en: "/ 1M tokens",
  fr: "/ 1M tokens",
  ru: "/ 1M токенов",
  ja: "/ 100万 tokens",
  vi: "/ 1M tokens",
};
const PRICE_KEY = {
  zhCN: "输入 / 输出",
  zhTW: "輸入 / 輸出",
  en: "Input / Output",
  fr: "Entrée / Sortie",
  ru: "Вход / Выход",
  ja: "入力 / 出力",
  vi: "Vào / Ra",
};

const MODELS = [
  {
    id: "SemIf-OpenJev-4B",
    zhCN:
      "SemIf-OpenJev-4B：SemIf（原 OpenJev）项目的 4B 语义决策模型（System One，底座 Qwen3.5-4B，128K 上下文）。输入上下文 + 决策条件 + 候选选项，直接读取候选选项 Logits 概率返回结构化决策，不生成自然语言回答、无需 JSON 解析，适合 Agent 路由、分类、重试与完成判断等高频语义 if/else。计费：输入 $0.0274 / 输出 $0（每百万 tokens）。",
    zhTW:
      "SemIf-OpenJev-4B：SemIf（原 OpenJev）項目的 4B 語義決策模型（System One，底座 Qwen3.5-4B，128K 上下文）。輸入上下文 + 決策條件 + 候選選項，直接讀取候選選項 Logits 機率回傳結構化決策，不生成自然語言回答、無需 JSON 解析，適合 Agent 路由、分類、重試與完成判斷等高頻語義 if/else。計費：輸入 $0.0274 / 輸出 $0（每百萬 tokens）。",
    en: "SemIf-OpenJev-4B — 4B semantic decision model from the SemIf (formerly OpenJev) project (System One; Qwen3.5-4B base, 128K context). Pass context + decision criteria + candidate options; the model reads option logits directly and returns structured decisions with probabilities — no free-form generation, no JSON parsing. Ideal for high-frequency semantic if/else: routing, classification, retry and completion checks. Pricing: $0.0274 input / $0 output per 1M tokens.",
    fr: "SemIf-OpenJev-4B — modèle de décision sémantique 4B du projet SemIf (ex OpenJev) (System One ; base Qwen3.5-4B, contexte 128K). Envoyez contexte + critères + options candidates ; le modèle lit directement les logits des options et renvoie des décisions structurées avec probabilités — sans génération libre ni parsing JSON. Idéal pour les if/else sémantiques haute fréquence : routage, classification, contrôles de retry et d'achèvement. Tarif : $0.0274 entrée / $0 sortie pour 1M tokens.",
    ru: "SemIf-OpenJev-4B — модель семантических решений 4B от проекта SemIf (бывш. OpenJev) (System One; база Qwen3.5-4B, контекст 128K). Передайте контекст + критерии + варианты; модель читает логиты вариантов напрямую и возвращает структурированные решения с вероятностями — без свободной генерации и парсинга JSON. Идеальна для частых семантических if/else: маршрутизация, классификация, проверки retry и завершения. Тариф: вход $0.0274 / выход $0 за 1M токенов.",
    ja: "SemIf-OpenJev-4B：SemIf（旧 OpenJev）プロジェクトの 4B 意味的意思決定モデル（System One、ベース Qwen3.5-4B、128K コンテキスト）。コンテキスト＋判定条件＋候補を渡すと、候補のロジットを直接読み取り確率付きの構造化判断を返却。自由テキスト生成も JSON 解析も不要。ルーティング、分類、リトライ判定など高頻度の意味的 if/else に最適。料金：入力 $0.0274 / 出力 $0（100万 tokens）。",
    vi: "SemIf-OpenJev-4B — mô hình quyết định ngữ nghĩa 4B của dự án SemIf (trước là OpenJev) (System One; nền Qwen3.5-4B, ngữ cảnh 128K). Gửi ngữ cảnh + tiêu chí + các lựa chọn; mô hình đọc trực tiếp logits của lựa chọn và trả về quyết định có cấu trúc kèm xác suất — không sinh văn bản tự do, không parse JSON. Phù hợp cho if/else ngữ nghĩa tần suất cao: định tuyến, phân loại, kiểm tra retry và hoàn tất. Giá: vào $0.0274 / ra $0 mỗi 1M tokens.",
  },
  {
    id: "DiffusionGemma-26B-A4B-it-Jev",
    zhCN:
      "DiffusionGemma-26B-A4B-it-Jev：基于 Google DeepMind DiffusionGemma 26B A4B IT 的块扩散语言模型（System One 决策，MoE 架构，总参约 25.2B、激活约 3.8B，NVFP4 量化，64K 上下文）。区别于逐 token 自回归生成，模型在固定 Token Canvas 上迭代去噪、可并行生成，直接读取预定义候选答案的概率分布，无需生成自由文本再解析，适用于 Agent 路由、工具选择、条件判断与分类评估。计费：输入 $0.0822 / 输出 $0（每百万 tokens）。",
    zhTW:
      "DiffusionGemma-26B-A4B-it-Jev：基於 Google DeepMind DiffusionGemma 26B A4B IT 的塊擴散語言模型（System One 決策，MoE 架構，總參約 25.2B、激活約 3.8B，NVFP4 量化，64K 上下文）。不同於逐 token 自迴歸生成，模型在固定 Token Canvas 上迭代去噪、可平行生成，直接讀取預定義候選答案的機率分佈，無需生成自由文字再解析，適用於 Agent 路由、工具選擇、條件判斷與分類評估。計費：輸入 $0.0822 / 輸出 $0（每百萬 tokens）。",
    en: "DiffusionGemma-26B-A4B-it-Jev — block-diffusion language model built on Google DeepMind DiffusionGemma 26B A4B IT (System One decisions; MoE, ~25.2B total / ~3.8B active params, NVFP4 quantization, 64K context). Instead of token-by-token autoregression it denoises a fixed token canvas and reads probability distributions over predefined candidate answers directly — no free-form generation to parse. Built for agent routing, tool selection, conditional checks, and classification. Pricing: $0.0822 input / $0 output per 1M tokens.",
    fr: "DiffusionGemma-26B-A4B-it-Jev — modèle de langage à diffusion par blocs basé sur Google DeepMind DiffusionGemma 26B A4B IT (décisions System One ; MoE, ~25.2B params au total / ~3.8B actifs, quantification NVFP4, contexte 64K). Au lieu de la génération autorégressive token par token, il débruite itérativement un canvas fixe et lit directement les distributions de probabilité des réponses candidates prédéfinies — sans texte libre à analyser. Idéal pour le routage d'agents, la sélection d'outils, les vérifications conditionnelles et la classification. Tarif : $0.0822 entrée / $0 sortie pour 1M tokens.",
    ru: "DiffusionGemma-26B-A4B-it-Jev — блочно-диффузионная языковая модель на базе Google DeepMind DiffusionGemma 26B A4B IT (решения System One; MoE, ~25.2B всего / ~3.8B активных параметров, квантизация NVFP4, контекст 64K). Вместо авторегрессии токен за токеном — итеративное шумоподавление на фиксированном canvas и прямое чтение распределений вероятностей предопределённых вариантов, без свободного текста. Для маршрутизации агентов, выбора инструментов, условных проверок и классификации. Тариф: вход $0.0822 / выход $0 за 1M токенов.",
    ja: "DiffusionGemma-26B-A4B-it-Jev：Google DeepMind の DiffusionGemma 26B A4B IT を基盤とするブロック拡散言語モデル（System One 決策、MoE、総パラメータ約 25.2B・アクティブ約 3.8B、NVFP4 量子化、64K コンテキスト）。トークン逐次の自己回帰ではなく、固定 Token Canvas 上で反復デノイズし候補答案の確率分布を直接読み取り、自由テキスト生成・解析不要。エージェントルーティング、ツール選択、条件判定、分類評価に最適。料金：入力 $0.0822 / 出力 $0（100万 tokens）。",
    vi: "DiffusionGemma-26B-A4B-it-Jev — mô hình ngôn ngữ khuếch tán khối dựa trên Google DeepMind DiffusionGemma 26B A4B IT (quyết định System One; MoE, ~25.2B tham số / ~3.8B kích hoạt, lượng tử hóa NVFP4, ngữ cảnh 64K). Thay vì sinh tự hồi quy từng token, mô hình khử nhiễu lặp trên canvas token cố định và đọc trực tiếp phân phối xác suất của các phương án định sẵn — không cần sinh văn bản tự do để parse. Phù hợp định tuyến agent, chọn tool, kiểm tra điều kiện và phân loại. Giá: vào $0.0822 / ra $0 mỗi 1M tokens.",
  },
  {
    id: "laya-multilingual",
    zhCN:
      "Laya Multilingual：Convai Innovations 开源的多语言文本决策模型（System One，基于 mmBERT，约 322M 参数，8K 上下文，支持 100+ 语言）。非自回归架构一次前向完成判断，返回 choice（分类选择）/ score（等级评分）/ noul（条件判断）及对应概率；单次请求最多 16 道问题、每题 ≤8192 tokens、选择题 ≤20 个候选、请求体 ≤1 MiB。适用于工单分流、意图识别、内容审核与智能体路由。计费：输入 $0.00274 / 输出 $0（每百万 tokens）。",
    zhTW:
      "Laya Multilingual：Convai Innovations 開源的多語言文字決策模型（System One，基於 mmBERT，約 322M 參數，8K 上下文，支援 100+ 語言）。非自迴歸架構一次前向完成判斷，回傳 choice（分類選擇）/ score（等級評分）/ noul（條件判斷）及對應機率；單次請求最多 16 道問題、每題 ≤8192 tokens、選擇題 ≤20 個候選、請求體 ≤1 MiB。適用於工單分流、意圖識別、內容審核與智能體路由。計費：輸入 $0.00274 / 輸出 $0（每百萬 tokens）。",
    en: "Laya Multilingual — open-source multilingual text decision model by Convai Innovations (System One; mmBERT base, ~322M params, 8K context, 100+ languages). Non-autoregressive: one forward pass returns choice / score / noul decisions with probabilities. Up to 16 questions per request, 8,192 tokens per question, 20 candidates per choice, 1 MiB body. Built for ticket triage, intent detection, content moderation, and agent routing. Pricing: $0.00274 input / $0 output per 1M tokens.",
    fr: "Laya Multilingual — modèle de décision textuelle multilingue open source de Convai Innovations (System One ; base mmBERT, ~322M params, contexte 8K, 100+ langues). Non autorégressif : une seule passe retourne des décisions choice / score / noul avec probabilités. Jusqu'à 16 questions par requête, 8 192 tokens par question, 20 candidats par choix, corps ≤ 1 Mio. Pour le triage de tickets, la détection d'intention, la modération et le routage d'agents. Tarif : $0.00274 entrée / $0 sortie pour 1M tokens.",
    ru: "Laya Multilingual — открытая многоязычная модель текстовых решений от Convai Innovations (System One; база mmBERT, ~322M параметров, контекст 8K, 100+ языков). Неавторегрессионная: один прямой проход возвращает choice / score / noul с вероятностями. До 16 вопросов на запрос, 8192 токенов на вопрос, 20 вариантов на выборку, тело ≤ 1 МиБ. Для триажа тикетов, определения интентов, модерации и маршрутизации агентов. Тариф: вход $0.00274 / выход $0 за 1M токенов.",
    ja: "Laya Multilingual：Convai Innovations 製のオープンソース多言語テキスト決定モデル（System One、ベース mmBERT、約 322M パラメータ、8K コンテキスト、100+ 言語対応）。非自己回帰で 1 回のフォワードパスで choice / score / noul と確率を返却。1 リクエスト最大 16 問、1 問 8,192 tokens まで、選択肢は最大 20、本文 1 MiB まで。チケット振り分け、インテント判定、コンテンツモデレーション、エージェントルーティング向け。料金：入力 $0.00274 / 出力 $0（100万 tokens）。",
    vi: "Laya Multilingual — mô hình quyết định văn bản đa ngôn ngữ mã nguồn mở của Convai Innovations (System One; nền mmBERT, ~322M tham số, ngữ cảnh 8K, hỗ trợ 100+ ngôn ngữ). Phi tự hồi quy: một lượt forward trả về choice / score / noul kèm xác suất. Tối đa 16 câu hỏi/yêu cầu, 8.192 tokens/câu, 20 lựa chọn/câu hỏi, thân yêu cầu ≤ 1 MiB. Dành cho phân loại ticket, nhận diện ý định, kiểm duyệt nội dung và định tuyến agent. Giá: vào $0.00274 / ra $0 mỗi 1M tokens.",
  },
];

const FILES = [
  path.join(root, "config/marketplace-model-copy.json"),
  path.join(
    root,
    "services/creem-moderation-proxy/marketplace-model-copy.json"
  ),
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
      unit: "token",
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
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  console.log("updated", path.relative(root, f), "keys:", Object.keys(j).length);
}
console.log("DONE_MKT_COPY_SYSTEMONE3");
