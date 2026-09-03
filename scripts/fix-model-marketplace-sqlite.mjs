/**
 * 直接改 New API SQLite：单标签 + 原厂供应商
 * VPS: NEW_API_DB=/opt/ai-relay/data/new-api/one-api.db node scripts/fix-model-marketplace-sqlite.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import { fixMarketplaceMeta } from "../services/gitee-passthrough/fix-marketplace-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH =
  process.env.NEW_API_DB ||
  path.join(__dirname, "..", "data/new-api/one-api.db");

const r = fixMarketplaceMeta(DB_PATH);
console.log(JSON.stringify(r, null, 2));
if (r.multiTag.length) {
  console.error("仍有多个标签的模型:", r.multiTag);
  process.exit(1);
}
console.log("\n完成。请执行: docker restart ai-relay-new-api");
