/**
 * sync-live-seedance.mjs
 * 
 * 自动化同步线上 New-API 的 Seedance 4 个核心模型，清理 8 个旧分辨率卡片。
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

const TARGET_MODELS = [
  {
    model_name: "seedance-2.5",
    description:
      "字节 Seedance 2.5 视频生成大模型。新一代高保真长时长视频生成，单次最高30秒，支持多模态参考与480p/720p/1080p多分辨率。适合高质量短剧、广告营销与专业内容创作。",
    icon: "Doubao.Color",
    tags: "视频按秒",
    vendor_id: 21,
    endpoints: JSON.stringify({ "openai-video": "/v1/videos/generations" }),
    status: 1,
    sync_official: 0,
    price: 0.133562, // 720p base price ($/s)
  },
  {
    model_name: "seedance-2.0",
    description:
      "字节 Seedance 2.0 标准满血版视频生成模型。高保真运动控制，主体一致性强，支持480p/720p/1080p分辨率与多图音视频多模态参考。",
    icon: "Doubao.Color",
    tags: "视频按秒",
    vendor_id: 21,
    endpoints: JSON.stringify({ "openai-video": "/v1/videos/generations" }),
    status: 1,
    sync_official: 0,
    price: 0.096165, // 720p base price ($/s)
  },
  {
    model_name: "seedance-2.0-fast",
    description:
      "字节 Seedance 2.0 Fast 极速版视频生成模型。更快出片效率，适合快速试错、迭代预览与高吞吐批量生产。",
    icon: "Doubao.Color",
    tags: "视频按秒",
    vendor_id: 21,
    endpoints: JSON.stringify({ "openai-video": "/v1/videos/generations" }),
    status: 1,
    sync_official: 0,
    price: 0.074794, // 720p base price ($/s)
  },
  {
    model_name: "seedance-2.0-mini",
    description:
      "字节 Seedance 2.0 Mini 轻量经济版视频生成模型。大幅降低生成成本，适合短镜头、大批量调用与内容测试。",
    icon: "Doubao.Color",
    tags: "视频按秒",
    vendor_id: 21,
    endpoints: JSON.stringify({ "openai-video": "/v1/videos/generations" }),
    status: 1,
    sync_official: 0,
    price: 0.049863, // 720p base price ($/s)
  },
];

const TARGET_MODEL_NAMES = new Set(TARGET_MODELS.map((m) => m.model_name));

async function main() {
  console.log(`Connecting to ${baseUrl}...`);

  // 1. Fetch current models from /api/models/
  const mRes = await fetch(`${baseUrl}/api/models/?p=0&page_size=500`, { headers });
  const mData = await mRes.json();
  const allModels = mData?.data?.items || [];
  console.log(`Found ${allModels.length} models in /api/models/`);

  // Delete legacy seedance models
  for (const m of allModels) {
    const name = m.model_name;
    if (name.includes("seedance") && !TARGET_MODEL_NAMES.has(name)) {
      console.log(`Deleting legacy model [${m.id}] ${name}...`);
      const delRes = await fetch(`${baseUrl}/api/models/${m.id}`, { method: "DELETE", headers });
      const delData = await delRes.json();
      console.log(`Deleted ${name}: success=${delData.success}`);
    }
  }

  // Create or update the 4 target models
  for (const target of TARGET_MODELS) {
    const existing = allModels.find((m) => m.model_name === target.model_name);
    if (existing) {
      console.log(`Updating existing model [${existing.id}] ${target.model_name}...`);
      const payload = {
        id: existing.id,
        model_name: target.model_name,
        description: target.description,
        icon: target.icon,
        tags: target.tags,
        vendor_id: target.vendor_id,
        endpoints: target.endpoints,
        status: 1,
        sync_official: 0,
      };
      const updRes = await fetch(`${baseUrl}/api/models/`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
      const updData = await updRes.json();
      console.log(`Updated ${target.model_name}: success=${updData.success}`);
    } else {
      console.log(`Creating model ${target.model_name}...`);
      const payload = {
        model_name: target.model_name,
        description: target.description,
        icon: target.icon,
        tags: target.tags,
        vendor_id: target.vendor_id,
        endpoints: target.endpoints,
        status: 1,
        sync_official: 0,
      };
      const cRes = await fetch(`${baseUrl}/api/models/`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const cData = await cRes.json();
      console.log(`Created ${target.model_name}: success=${cData.success}`);
    }
  }

  // 2. Update Channel 4 models
  console.log("Fetching Channel 4...");
  const chRes = await fetch(`${baseUrl}/api/channel/4`, { headers });
  const chData = await chRes.json();
  const ch = chData.data;
  if (!ch) {
    throw new Error("Channel 4 not found");
  }

  // Filter out any seedance model and add only the 4 target models
  const existingList = (ch.models || "").split(",").map((s) => s.trim()).filter(Boolean);
  const nonSeedance = existingList.filter((m) => !m.includes("seedance"));
  const newModels = [...nonSeedance, ...TARGET_MODELS.map((m) => m.model_name)].join(",");

  console.log("New Channel 4 models:", newModels);

  const chPayload = {
    id: ch.id,
    type: ch.type,
    name: ch.name,
    base_url: ch.base_url,
    group: ch.group,
    models: newModels,
    model_mapping: ch.model_mapping || "",
    auto_ban: ch.auto_ban || 1,
  };

  const chUpdRes = await fetch(`${baseUrl}/api/channel/`, {
    method: "PUT",
    headers,
    body: JSON.stringify(chPayload),
  });
  const chUpdData = await chUpdRes.json();
  console.log(`Updated Channel 4: success=${chUpdData.success}`);

  // 3. Update ModelPrice option
  console.log("Updating ModelPrice option...");
  const optRes = await fetch(`${baseUrl}/api/option/`, { headers });
  const optData = await optRes.json();
  const mpOpt = (optData.data || []).find((o) => o.key === "ModelPrice");

  let priceMap = {};
  if (mpOpt && mpOpt.value) {
    try {
      priceMap = JSON.parse(mpOpt.value);
    } catch (e) {
      console.warn("Could not parse current ModelPrice:", e.message);
    }
  }

  // Delete all old seedance keys
  for (const k of Object.keys(priceMap)) {
    if (k.includes("seedance")) {
      delete priceMap[k];
    }
  }

  // Set 4 target model prices
  for (const target of TARGET_MODELS) {
    priceMap[target.model_name] = target.price;
  }

  const optUpdRes = await fetch(`${baseUrl}/api/option/`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      key: "ModelPrice",
      value: JSON.stringify(priceMap),
    }),
  });
  const optUpdData = await optUpdRes.json();
  console.log(`Updated ModelPrice option: success=${optUpdData.success}`);

  // 4. Verify /api/pricing
  console.log("Verifying /api/pricing on live...");
  const pRes = await fetch(`${baseUrl}/api/pricing`, { headers });
  const pData = await pRes.json();
  const liveSeedance = (pData.data || []).filter((m) => (m.model_name || "").includes("seedance"));

  console.log("\n================ LIVE VERIFICATION ================");
  console.log(`Total live Seedance models count: ${liveSeedance.length}`);
  for (const m of liveSeedance) {
    console.log(` - Model: ${m.model_name} | Price: $${m.model_price}/s | Tags: ${m.tags} | Vendor: ${m.vendor_name}`);
  }

  if (liveSeedance.length === 4 && liveSeedance.every((m) => TARGET_MODEL_NAMES.has(m.model_name))) {
    console.log("\n>>> SUCCESS: Strictly 4 Seedance models are live! <<<");
  } else {
    console.warn("\n>>> WARNING: Model count or names mismatch! <<<");
  }
}

main().catch(console.error);
