#!/usr/bin/env node
/**
 * Fail if video model IDs drift across catalog / creem / docs / selected / RULES.
 * Run: node scripts/audit-video-whitelist.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const catalog = JSON.parse(read("services/apimart-passthrough/catalog.json"));
const catIds = new Set(catalog.models.map((m) => m.id));

const creem = read("services/creem-moderation-proxy/server.mjs");
const usesCatalog =
  creem.includes("loadVideoGenModels") || creem.includes("VIDEO_CATALOG");
const m = creem.match(/VIDEO_GEN_FALLBACK = \[([\s\S]*?)\]/);
const creemFallback = new Set(
  [...(m?.[1].matchAll(/"([^"]+)"/g) || [])].map((x) => x[1])
);

const selected = JSON.parse(read("config/apimart-selected-models.json"));
const selIds = new Set(selected.models.map((m) => m.id));

const docs = read("static/brand/keyo-docs.html");
const docIds = new Set(
  [
    ...docs.matchAll(
      /data-copy="(seedance-[^"]+|wan3\.0-video|flux-3-video|MiniMax-H3|gemini-omni-[^"]+|grok-imagine-[^"]+|grok-1\.5-video)"/g
    ),
  ].map((x) => x[1])
);

const ref = read("static/brand/keyo-api-ref.md");
const pathB = ref.split("\n").find((l) => l.includes("`wan3.0-video`"));
const refIds = new Set(
  [...(pathB?.matchAll(/`([^`]+)`/g) || [])]
    .map((x) => x[1])
    .filter((id) => !/\s/.test(id))
);

const rules = read("services/gitee-passthrough/fix-marketplace-meta.mjs");
const ruleIds = new Set(
  [
    ...rules.matchAll(
      /"((?:seedance|wan3\.0-video|flux-3-video|MiniMax-H3|gemini-omni|grok-imagine|grok-1\.5)[^"]*)":\s*\{[\s\S]*?tag:\s*"视频/g
    ),
  ].map((x) => x[1])
);

let failed = false;
function mustCover(name, need, have) {
  const missing = [...need].filter((x) => !have.has(x)).sort();
  if (missing.length) {
    failed = true;
    console.error(`FAIL ${name}: missing`, missing.join(", "));
  } else {
    console.log(`OK   ${name}`);
  }
}

mustCover("selected ⊆ catalog", selIds, catIds);
mustCover("docs ⊆ catalog", docIds, catIds);
mustCover("apiref PathB ⊆ catalog", refIds, catIds);
mustCover("RULES video ⊆ catalog", ruleIds, catIds);
if (usesCatalog) {
  console.log("OK   creem loads VIDEO_CATALOG (runtime sync)");
  mustCover("catalog ⊆ creem fallback", catIds, creemFallback);
} else {
  mustCover("catalog ⊆ creem hardcoded", catIds, creemFallback);
}

const delisted = ["seedance-2.0", "seedance-2.5"];
for (const id of delisted) {
  if (catIds.has(id) || docIds.has(id)) {
    failed = true;
    console.error(`FAIL delisted still present: ${id}`);
  }
}
if (!failed) console.log("OK   delisted seedance-2.0/2.5 absent");

console.log(
  "catalog_count",
  catIds.size,
  "upstreams",
  Object.fromEntries(
    ["aione", "grsai", "openlux", "apimart"].map((k) => [
      k,
      catalog.models.filter(
        (m) => String(m.upstream || "apimart").toLowerCase() === k
      ).length,
    ])
  )
);
console.log(failed ? "AUDIT_DRIFT" : "AUDIT_OK");
process.exit(failed ? 1 : 0);
