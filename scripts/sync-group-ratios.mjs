/**
 * sync-group-ratios.mjs
 * 
 * 保持 New-API 的 GroupRatio 与 group_ratio_setting.group_ratio 完整同步：
 * 包含 GPT-Image-Pro (0.576x)、GPT-Image-HD (13.140553x)、Claude-Code-2 (1.666686x)、AWS-Bedrock-2 (3.333371x) 等
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
const env = fs.readFileSync(envPath, "utf8");
const token = env.match(/NEW_API_ADMIN_TOKEN=(.+)/)[1].trim();

const targetRatios = {
  default: 1,
  vip: 1,
  svip: 1,
  "Claude-Code-2": 1.666686,
  "AWS-Bedrock-2": 3.333371,
  "GPT-Image-HD": 13.140553,
  "GPT-Image-Pro": 0.576
};

async function main() {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  for (const optKey of ["GroupRatio", "group_ratio_setting.group_ratio"]) {
    const res = await fetch("https://www.keyoapi.xyz/api/option/", {
      method: "PUT",
      headers,
      body: JSON.stringify({ key: optKey, value: JSON.stringify(targetRatios) })
    });
    console.log(`Updated ${optKey}:`, (await res.json()).success);
  }

  // 验证 public /api/pricing
  const prRes = await fetch("https://www.keyoapi.xyz/api/pricing");
  const prData = await prRes.json();
  console.log("\nVerified /api/pricing group_ratio:", prData.group_ratio);
}

main().catch(console.error);
