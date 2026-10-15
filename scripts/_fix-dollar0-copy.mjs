// One-off: replace every "$0 per call / $0 model IDs / fixed-$0" claim with
// the real gift-credit model (billed at base rates from the one-time $10
// new-user credit). Verified against new-api/model/gift_models.go:
// ":free" IDs debit twin sell ratios; display stays "$0".
// Run from repo root: node scripts/_fix-dollar0-copy.mjs
import fs from "fs";
import path from "path";

const files = [
  "config/seo/pricing-landings.json",
  "config/seo/content-landings.json",
  "config/seo/model-pages.json",
  "config/seo/batch2-models.json",
];

const pairs = [
  // my recent video-line copy (8 pages)
  [/The fixed free catalog IDs cost \$0 per call — chat and speech models only, there is no free video tier\. They draw down your \$10 welcome credit \(fair-use rate limits\)/g,
   "The gift-credit IDs are chat and speech models only — there is no free video tier. They bill at normal rates from your one-time $10 new-user credit (fair-use limits)"],
  [/The fixed free catalog IDs cost \$0 per call — chat and speech models only, this tool has no free tier\. They draw down your \$10 welcome credit \(fair-use rate limits\)/g,
   "The gift-credit IDs are chat and speech models only — this tool has no free tier. They bill at normal rates from your one-time $10 new-user credit (fair-use limits)"],
  // seedance-2.0 page (freeKiller + FAQ + meta)
  [/the \$0 catalog IDs are chat and speech models only\. Use them \(covered by your \$10 welcome credit, fair-use rate limits\)/g,
   "the gift-credit IDs are chat and speech models only. Use them (billed from your one-time $10 new-user credit, fair-use limits)"],
  [/No free Seedance tier — \$0 prototyping IDs on the same key\./g,
   "No free Seedance tier — prototyping runs on gift-credit IDs on the same key."],
  // older chat landings
  [/\$0 model IDs whose calls draw down your \$10 welcome credit/g,
   "gift-credit IDs that bill at normal rates from your one-time $10 new-user credit"],
  [/\$0 fixed-ID twins whose calls draw down your \$10 welcome credit/g,
   "gift-credit twins billed from your one-time $10 new-user credit"],
  [/fixed-\$0 prototyping IDs \(covered by your \$10 welcome credit, fair-use\)/g,
   "gift-credit prototyping IDs (billed from your one-time $10 new-user credit, fair-use)"],
  [/fixed \$0 catalog IDs/g, "gift-credit catalog IDs"],
  [/For \$0 prototyping on the same (?:API )?key, use /g, "To prototype on the same key, use "],
  [/calls draw down your \$10 welcome credit/g,
   "calls bill at normal rates from your one-time $10 new-user credit"],
  [/a \$0 gift-credit ID/g, "a gift-credit ID"],
  [/A \$0 prototyping lane/g, "A gift-credit prototyping lane"],
];

const totals = new Map();
for (const f of files) {
  const p = path.resolve(f);
  let s = fs.readFileSync(p, "utf8");
  // operate on the JSON *string* only inside value literals is risky; parse-walk instead
  const data = JSON.parse(s);
  const walk = (obj) => {
    if (typeof obj === "string") {
      let out = obj;
      for (const [re, rep] of pairs) {
        out = out.replace(re, () => { totals.set(rep, (totals.get(rep) || 0) + 1); return rep; });
      }
      return out;
    }
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj)) obj[k] = walk(obj[k]);
    }
    return obj;
  };
  const fixed = walk(data);
  fs.writeFileSync(p, JSON.stringify(fixed, null, 2) + "\n");
}
for (const [rep, n] of totals) console.log(n + "x", rep.slice(0, 70));
console.log("DONE_DOLLAR0_FIX");