/**
 * 把 config/gitee-selected-models.json 同步进 pricing-admin/data/models.json（人民币台账）
 * 用法：node scripts/sync-gitee-pricing-admin.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const cfg = JSON.parse(
  fs.readFileSync(path.join(root, "config/gitee-selected-models.json"), "utf8")
);
const dataDir = path.join(root, "pricing-admin/data");
const dataFile = path.join(dataDir, "models.json");
fs.mkdirSync(dataDir, { recursive: true });

let list = [];
if (fs.existsSync(dataFile)) {
  try {
    list = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
}
const byId = Object.fromEntries(list.map((x) => [x.id, x]));

for (const m of cfg.models) {
  const b = m.billing;
  let row;
  if (b.mode === "token") {
    row = {
      id: m.id,
      name: m.id,
      kind: "text",
      enabled: true,
      costIn: b.cost_in_cny_per_m,
      costOut: b.cost_out_cny_per_m,
      sellIn: b.sell_in_cny_per_m,
      sellOut: b.sell_out_cny_per_m,
      officialIn: b.cost_in_cny_per_m,
      officialOut: b.cost_out_cny_per_m,
      note: `${m.category_zh}；¥/M tokens`,
    };
  } else {
    row = {
      id: m.id,
      name: m.id,
      kind: "image",
      enabled: true,
      costPerCall: b.cost_cny,
      sellPerCall: b.sell_cny,
      officialPerCall: b.cost_cny,
      note: `${m.category_zh}；单位=${b.unit_label}${b.free_upstream ? "（免费档底价）" : ""}`,
    };
  }
  byId[m.id] = { ...(byId[m.id] || {}), ...row };
}

const out = Object.values(byId);
fs.writeFileSync(dataFile, JSON.stringify(out, null, 2));
console.log("pricing-admin models:", out.length, "(gitee", cfg.models.length, ")");
