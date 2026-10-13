/**
 * 更新 gemini-api-pricing 落地页：Gemini 4 Argon/Barium 已上架（此前为 "announced, not yet listed"）。
 *   node scripts/_update-gemini4-landing.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const p = path.join(root, "config/seo/pricing-landings.json");
const data = JSON.parse(fs.readFileSync(p, "utf8"));

const page = data.pages.find((x) => x.slug === "gemini-api-pricing");
if (!page) throw new Error("gemini-api-pricing page missing");

page.metaDescription =
  "Gemini API pricing on KeyoAPI: gemini-4-argon and gemini-4-barium ~$0.74/$3.68 per 1M, gemini-3.8-flash ~$0.28/$1.38, plus Omni request IDs.";

const rows = page.rows || [];
for (const model of ["gemini-4-argon", "gemini-4-barium"]) {
  const i = rows.findIndex((r) => r.model === model);
  const row = {
    model,
    official:
      "Google Gemini 4 list rates move by tier and access — verify on Google; announced Argon intro was about $2 / $10 per 1M",
    keyo: "~$0.74 / $3.68 per 1M in/out",
    note: model === "gemini-4-argon" ? "Current Gemini 4 coding/reasoning chat ID" : "Current Gemini 4 million-token context chat ID",
  };
  if (i >= 0) rows[i] = row;
  else rows.unshift(row);
}
page.rows = rows;

if (page.faqs) {
  const i = page.faqs.findIndex((f) => /Argon available/.test(f.q || ""));
  if (i >= 0) {
    page.faqs[i] = {
      q: "Is Gemini 4 Argon available on KeyoAPI?",
      a: "Yes — gemini-4-argon and its million-token sibling gemini-4-barium are live in the Keyo catalog at about $0.74 / $3.68 per 1M in/out. Confirm live rates on /pricing/gemini-4-argon and /pricing/gemini-4-barium.",
    };
  }
}

// 已上架，撤下 "announced, not yet listed" 提示块
delete page.announcedNote;

fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(
  JSON.stringify({
    ok: true,
    rows: rows.map((r) => r.model).slice(0, 6),
    meta: page.metaDescription.slice(0, 80),
  })
);
