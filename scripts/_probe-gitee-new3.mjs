/**
 * Probe Gitee (模力方舟) for the 3 new System One models:
 *   SemIf-OpenJev-4B / DiffusionGemma-26B-A4B-it-Jev / laya-multilingual
 * Fetches _next/data page JSON (same shape as _tmp_gitee_prices.json):
 *   service {name, remark, cover, tags...} + operations[{path, price, unit_tag,
 *   input_million_tokens_price, output_million_tokens_price}]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "scripts", "_gitee_new3_raw");
fs.mkdirSync(outDir, { recursive: true });

const NAMES = [
  "SemIf-OpenJev-4B",
  "DiffusionGemma-26B-A4B-it-Jev",
  "laya-multilingual",
];

const html = await (
  await fetch("https://ai.gitee.com/serverless-api", {
    headers: { "User-Agent": "Mozilla/5.0" },
  })
).text();
const buildId = html.match(/"buildId":"([^"]+)"/)?.[1];
console.log("buildId:", buildId);
fs.writeFileSync(path.join(outDir, "_catalog.html"), html.slice(0, 300000));

// find our names (or near matches) in the catalog page payload
for (const pat of ["SemIf", "OpenJev", "DiffusionGemma", "laya", "Jev"]) {
  const idxs = [];
  let i = -1;
  while ((i = html.indexOf(pat, i + 1)) >= 0 && idxs.length < 5) idxs.push(i);
  for (const ix of idxs.slice(0, 2)) {
    console.log("catalog hit", pat, JSON.stringify(html.slice(ix - 60, ix + 80)));
  }
}

for (const n of NAMES) {
  const enc = encodeURIComponent(n);
  const ju = `https://ai.gitee.com/_next/data/${buildId}/serverless-api/${enc}.json`;
  const r = await fetch(ju, { headers: { "User-Agent": "Mozilla/5.0" } });
  const t = await r.text();
  console.log("\n===", n, r.status, "len", t.length);
  fs.writeFileSync(path.join(outDir, n + ".json"), t);
  if (!r.ok) continue;
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    console.log("parse fail");
    continue;
  }
  const s = JSON.stringify(j);
  // locate service + operations anywhere in the payload
  const findKey = (obj, key, acc = []) => {
    if (!obj || typeof obj !== "object") return acc;
    if (Array.isArray(obj)) {
      for (const x of obj) findKey(x, key, acc);
      return acc;
    }
    if (obj[key]) acc.push(obj[key]);
    for (const v of Object.values(obj)) findKey(v, key, acc);
    return acc;
  };
  const services = findKey(j, "service").filter((x) => x && x.name);
  const ops = findKey(j, "operations").flat().filter(Boolean);
  for (const sv of services.slice(0, 2)) {
    console.log(
      "service:",
      sv.ident,
      "| remark:",
      String(sv.remark || "").slice(0, 120)
    );
    console.log("  cover:", sv.cover);
    console.log(
      "  tags:",
      (sv.tags || []).map((t) => t.name).join(", ")
    );
    console.log(
      "  summary:",
      JSON.stringify(sv.operation_summary || {}).slice(0, 400)
    );
  }
  for (const op of (ops[0] || []).slice ? ops[0].slice(0, 10) : []) {
    console.log(
      "op:",
      op.name,
      "|",
      op.type,
      "|",
      op.path,
      "| price=",
      op.price,
      "| unit_tag=",
      op.unit_tag,
      "| in=",
      op.input_million_tokens_price,
      "| out=",
      op.output_million_tokens_price
    );
  }
  if (!services.length) {
    const idx = s.indexOf("SemIf") + s.indexOf("Jev") + s.indexOf("laya");
    console.log("no service node; snippet:", s.slice(0, 300));
  }
}
console.log("\nraw saved to", outDir);
