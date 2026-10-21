/**
 * sync-live-glm-free.mjs
 * 
 * 自动化上架 UnoRouter 的 glm-5.2 模型到 Keyo 平台，
 * 作为赠送金模型 glm-5.3:free，标价：输入 $1.198 / 输出 $7.4872 每百万 tokens。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

let token = process.env.NEW_API_ADMIN_TOKEN;
let baseUrl = process.env.NEW_API_BASE || "https://www.keyoapi.xyz";

if (!token && fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  const match = envText.match(/NEW_API_ADMIN_TOKEN=(.+)/);
  if (match) token = match[1].trim();
  const baseMatch = envText.match(/NEW_API_BASE=(.+)/);
  if (baseMatch) baseUrl = baseMatch[1].trim();
}

if (!token) {
  console.error("Missing NEW_API_ADMIN_TOKEN");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const MODEL_NAME = "glm-5.3:free";
const UPSTREAM_MODEL = "glm-5.2";
const INPUT_PRICE_PER_1M = 1.198;
const OUTPUT_PRICE_PER_1M = 7.4872;
const MODEL_RATIO = INPUT_PRICE_PER_1M / 2; // 0.599
const COMPLETION_RATIO = OUTPUT_PRICE_PER_1M / INPUT_PRICE_PER_1M; // 6.24974958263773

async function main() {
  console.log(`Connecting to ${baseUrl}...`);

  // 1. Update ModelRatio
  console.log("Updating ModelRatio...");
  const optRes = await fetch(`${baseUrl}/api/option/`, { headers });
  const optData = await optRes.json();
  const mrOpt = optData.data.find((o) => o.key === "ModelRatio");
  const mrMap = JSON.parse(mrOpt.value);
  mrMap[MODEL_NAME] = MODEL_RATIO;

  const mrRes = await fetch(`${baseUrl}/api/option/`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ key: "ModelRatio", value: JSON.stringify(mrMap) }),
  });
  console.log("ModelRatio updated:", (await mrRes.json()).success);

  // 2. Update CompletionRatio
  console.log("Updating CompletionRatio...");
  const crOpt = optData.data.find((o) => o.key === "CompletionRatio");
  const crMap = JSON.parse(crOpt.value);
  crMap[MODEL_NAME] = COMPLETION_RATIO;

  const crRes = await fetch(`${baseUrl}/api/option/`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ key: "CompletionRatio", value: JSON.stringify(crMap) }),
  });
  console.log("CompletionRatio updated:", (await crRes.json()).success);

  // 3. Ensure Model in /api/models/
  console.log("Searching model in /api/models/...");
  const mSearchRes = await fetch(`${baseUrl}/api/models/search?keyword=glm-5.3:free`, { headers });
  const mSearch = await mSearchRes.json();
  const existing = (mSearch.data?.items || []).find((m) => m.model_name === MODEL_NAME);

  const modelPayload = {
    model_name: MODEL_NAME,
    description: `智谱 GLM 5.3 赠送金模型。在通用对话、复杂推理与中文场景下表现出色。调用按对应模型费率计费（输入 $${INPUT_PRICE_PER_1M} / 输出 $${OUTPUT_PRICE_PER_1M} 每 100 万 tokens），优先扣减赠送金，赠送金不足时扣充值余额。支持 128K 上下文。支持文本模态。`,
    icon: "Zhipu.Color",
    tags: "大语言模型",
    vendor_id: 8,
    endpoints: JSON.stringify({ openai: "/v1/chat/completions" }),
    status: 1,
    sync_official: 0,
  };

  if (existing) {
    console.log(`Updating existing model row [${existing.id}]...`);
    const updRes = await fetch(`${baseUrl}/api/models/`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ id: existing.id, ...modelPayload }),
    });
    console.log("Model updated:", (await updRes.json()).success);
  } else {
    console.log("Creating new model row...");
    const createRes = await fetch(`${baseUrl}/api/models/`, {
      method: "POST",
      headers,
      body: JSON.stringify(modelPayload),
    });
    console.log("Model created:", (await createRes.json()).success);
  }

  // 4. Update Channel 6 (Keyo Chat Free)
  console.log("Updating Channel 6 (Keyo Chat Free)...");
  const chRes = await fetch(`${baseUrl}/api/channel/6`, { headers });
  const ch = (await chRes.json()).data;
  if (!ch) throw new Error("Channel 6 not found");

  const chPayload = {
    id: ch.id,
    type: ch.type,
    name: ch.name,
    base_url: ch.base_url,
    group: ch.group,
    models: MODEL_NAME,
    model_mapping: JSON.stringify({ [MODEL_NAME]: UPSTREAM_MODEL }),
    auto_ban: ch.auto_ban || 1,
  };

  const chUpdRes = await fetch(`${baseUrl}/api/channel/`, {
    method: "PUT",
    headers,
    body: JSON.stringify(chPayload),
  });
  console.log("Channel 6 updated:", (await chUpdRes.json()).success);

  // 5. Verify /api/pricing
  console.log("Verifying /api/pricing...");
  const pRes = await fetch(`${baseUrl}/api/pricing`, { headers });
  const pData = await pRes.json();
  const pricingItem = (pData.data || []).find((m) => m.model_name === MODEL_NAME);

  console.log("\n================ LIVE VERIFICATION ================");
  if (pricingItem) {
    const inPrice = (pricingItem.model_ratio * 2).toFixed(3);
    const outPrice = (pricingItem.model_ratio * 2 * pricingItem.completion_ratio).toFixed(4);
    console.log(`Model: ${pricingItem.model_name}`);
    console.log(`Vendor: ${pricingItem.vendor_name} (${pricingItem.vendor_id})`);
    console.log(`Model Ratio: ${pricingItem.model_ratio} -> Input Price: $${inPrice} / 1M tokens`);
    console.log(`Completion Ratio: ${pricingItem.completion_ratio} -> Output Price: $${outPrice} / 1M tokens`);
    console.log(`Tags: ${pricingItem.tags}`);
    console.log(`Description: ${pricingItem.description}`);
    console.log(">>> SUCCESS: glm-5.3:free is live on Keyo platform! <<<");
  } else {
    console.error(">>> ERROR: glm-5.3:free not found in /api/pricing <<<");
  }
}

main().catch(console.error);
