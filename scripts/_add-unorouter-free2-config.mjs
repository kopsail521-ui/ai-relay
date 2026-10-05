/**
 * UnoRouter free: add k2-horizon:free + space-bunny-alpha:free, and drop the
 * legacy 免费 tag from all entries (免费 is now the price-based pricing-type
 * filter; the tag would fight the capability groups).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const f = path.join(root, "config/unorouter-free-models.json");
const j = JSON.parse(fs.readFileSync(f, "utf8"));

const NEW = [
  {
    id: "k2-horizon:free",
    vendor: "Moonshot",
    icon: "Moonshot",
    tags: "大语言模型",
    desc_zh: "k2-horizon:free",
  },
  {
    id: "space-bunny-alpha:free",
    vendor: "其他",
    icon: "Custom",
    tags: "大语言模型",
    desc_zh: "space-bunny-alpha:free",
  },
];

const ids = new Set(j.models.map((m) => m.id));
for (const m of NEW) {
  if (!ids.has(m.id)) j.models.unshift(m);
}
// legacy tag cleanup on every entry
for (const m of j.models) {
  if (typeof m.tags === "string") {
    m.tags = m.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && t !== "免费")
      .join(",");
  }
}
fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
console.log(
  "models:",
  j.models.length,
  "| new:",
  NEW.map((m) => m.id).join(", "),
  "| 免费 tags left:",
  j.models.filter((m) => (m.tags || "").includes("免费")).length
);
