/**
 * Fix the 13 UnoRouter docs price rows to the ACTUAL post-halving prices
 * (cost x4 = mr x2; the earlier $0.035 numbers were based on stale docs).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(
  fs.readFileSync(path.join(root, "config/unorouter-paid-models.json"), "utf8")
);
const costs = Object.fromEntries(
  cfg.models.map((m) => [m.id, [Number(m.cost_in), Number(m.cost_out)]])
);
const fmt = (v) => (v < 0.1 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100);

const docsPath = path.join(root, "static/brand/keyo-docs.html");
let s = fs.readFileSync(docsPath, "utf8");
let patched = 0;
for (const [id, [cin, cout]] of Object.entries(costs)) {
  const pin = fmt(cin * 4);
  const pout = fmt(cout * 4);
  const re = new RegExp(
    '(<tr><td class="model"><button type="button" class="model-btn" data-copy="' +
      id.replace(/[.$]/g, "\\$&") +
      '">)[^<]*(</button></td><td class="price">)~\\$[0-9.]+(</td><td class="price">)~\\$[0-9.]+(</td><td class="note-cell">)'
  );
  if (!re.test(s)) throw new Error("docs row not found for " + id);
  s = s.replace(re, "$1" + id + "$2~$" + pin + "$3~$" + pout + "$4");
  patched++;
  console.log(id, "-> ~$" + pin, "/ ~$" + pout);
}
fs.writeFileSync(docsPath, s);
console.log("docs rows fixed:", patched);

cfg.note =
  "UnoRouter paid chat on Keyo Chat. Sell = cost x4 (halved 2026-10-05 from x8; docs were stale before that). Public copy must not name the supplier.";
fs.writeFileSync(
  path.join(root, "config/unorouter-paid-models.json"),
  JSON.stringify(cfg, null, 2) + "\n"
);
console.log("config note corrected: sell = cost x4");
console.log("DONE_UNOROUTER_DOCS_FIX");
