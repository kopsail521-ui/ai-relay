/**
 * Restore billing lines in marketplace copy + fix mis-tags.
 * Also used to emit DB heal for New API.
 * Usage: node scripts/heal-marketplace-billing-descs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const TAG_FIX = {
  "grok-1.5-video": "视频按次",
  "gpt-image-2.5": "图片",
  "gpt-image-2.5-flare": "图片",
  "gpt-image-2.5-sunburst": "图片",
};

/** Multi-tier / special billing lines (zh). Keep numbers from docs / live. */
const BILL_ZH = {
  "seedance-2.0-1080p": "计费：$0.100599/秒。",
  "seedance-2.0-1080p-fast": "计费：$0.0754/秒。",
  "seedance-2.0-1080p-mini": "计费：$0.050112/秒。",
  "seedance-2.0-720p": "计费：$0.096165/秒。",
  "seedance-2.0-720p-fast": "计费：$0.074794/秒。",
  "seedance-2.0-720p-mini": "计费：$0.049863/秒。",
  "seedance-2.5-1080p": "计费：$0.137996/秒。",
  "seedance-2.5-720p": "计费：$0.133562/秒。",
  "gemini-omni-1.1-flash": "计费：$0.1056/秒（时长由模型决定，约 3–10s）。",
  "gemini-omni-1.1-flash-ext":
    "计费：档位包（如 720P-8s $0.42）；参考视频按秒。",
  "MiniMax-H3":
    "计费：480p $0.02055/秒；768p $0.02877/秒；1080p $0.04110/秒。",
  "flux-3-video":
    "计费：DRAFT $0.0576/秒；HD $0.1632/秒；FHD $0.2784/秒。",
  "wan3.0-video":
    "计费：480P $0.04115/秒；720P $0.08228/秒；1080P $0.16457/秒。",
  "grok-imagine-video-1.5-preview":
    "计费：480p $0.08825/秒；720p $0.1545/秒（仅图生）。",
  "grok-1.5-video": "计费：$0.60675/次。",
};

const BILL_EN = {
  "seedance-2.0-1080p": "Billing: $0.100599/sec.",
  "seedance-2.0-1080p-fast": "Billing: $0.0754/sec.",
  "seedance-2.0-1080p-mini": "Billing: $0.050112/sec.",
  "seedance-2.0-720p": "Billing: $0.096165/sec.",
  "seedance-2.0-720p-fast": "Billing: $0.074794/sec.",
  "seedance-2.0-720p-mini": "Billing: $0.049863/sec.",
  "seedance-2.5-1080p": "Billing: $0.137996/sec.",
  "seedance-2.5-720p": "Billing: $0.133562/sec.",
  "gemini-omni-1.1-flash":
    "Billing: $0.1056/sec (duration model-chosen, ~3–10s).",
  "gemini-omni-1.1-flash-ext":
    "Billing: tier packs (e.g. 720P-8s $0.42); reference video per second.",
  "MiniMax-H3":
    "Billing: 480p $0.02055/sec; 768p $0.02877/sec; 1080p $0.04110/sec.",
  "flux-3-video":
    "Billing: DRAFT $0.0576/sec; HD $0.1632/sec; FHD $0.2784/sec.",
  "wan3.0-video":
    "Billing: 480P $0.04115/sec; 720P $0.08228/sec; 1080P $0.16457/sec.",
  "grok-imagine-video-1.5-preview":
    "Billing: 480p $0.08825/sec; 720p $0.1545/sec (image-to-video only).",
  "grok-1.5-video": "Billing: $0.60675/request.",
};

function hasBill(s) {
  return /计费|Billing|\/秒|\/次|\/页|\/万字符|per 1M|per second|per request|每百万/i.test(
    s || ""
  );
}

function stripOldBill(s) {
  return String(s || "")
    .replace(/\s*计费：[^\n。]*。?/g, "")
    .replace(/\s*Billing:[^\n.]*\.?/gi, "")
    .trim();
}

function ensureDesc(base, bill) {
  const clean = stripOldBill(base);
  if (!bill) return clean;
  if (hasBill(clean)) return clean;
  return `${clean} ${bill}`.replace(/\s+/g, " ").trim();
}

function patchCopy(rel) {
  const p = path.join(root, rel);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  let n = 0;
  for (const [id, billZh] of Object.entries(BILL_ZH)) {
    const e = j[id];
    if (!e || typeof e !== "object") continue;
    const billEn = BILL_EN[id] || billZh;
    const zh0 = e.description_zh || e.description || "";
    const en0 = e.description_en || (e.descriptions && e.descriptions.en) || "";
    const zh = ensureDesc(zh0, billZh);
    const en = ensureDesc(en0, billEn);
    e.description = zh;
    e.description_zh = zh;
    e.description_en = en;
    e.descriptions = {
      ...(e.descriptions || {}),
      zhCN: zh,
      zhTW: zh,
      en,
      fr: en,
      ru: en,
      ja: en,
      vi: en,
    };
    n++;
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log("patched", rel, n);
  return j;
}

const copy = patchCopy("services/creem-moderation-proxy/marketplace-model-copy.json");
patchCopy("config/marketplace-model-copy.json");

const descs = {};
for (const id of Object.keys(BILL_ZH)) {
  descs[id] = copy[id]?.description_zh || copy[id]?.description;
}

const py = `#!/usr/bin/env python3
"""Heal marketplace tags + restore billing lines in model descriptions."""
import json, sqlite3, sys, time
DESCS = ${JSON.stringify(descs, null, 0)}
TAGS = ${JSON.stringify(TAG_FIX, null, 0)}
db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
con = sqlite3.connect(db)
cur = con.cursor()
cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}
now = int(time.time())
nd = nt = 0
for mid, desc in DESCS.items():
    sets = ["description=?"]
    vals = [desc]
    if "updated_time" in cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(mid)
    cur.execute("UPDATE models SET %s WHERE model_name=?" % ",".join(sets), vals)
    if cur.rowcount:
        nd += 1
        print("desc", mid)
for mid, tag in TAGS.items():
    sets = ["tags=?"]
    vals = [tag]
    if "updated_time" in cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(mid)
    cur.execute("UPDATE models SET %s WHERE model_name=?" % ",".join(sets), vals)
    if cur.rowcount:
        nt += 1
        print("tag", mid, "->", tag)
con.commit()
con.close()
print("descs", nd, "tags", nt)
print("DONE_HEAL_BILLING_DESCS")
`;
fs.writeFileSync(path.join(root, "scripts/vps-heal-billing-descs.py"), py, "utf8");
console.log("wrote scripts/vps-heal-billing-descs.py");
console.log("tag fixes", TAG_FIX);
