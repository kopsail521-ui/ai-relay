/**
 * Halve the "~$in / ~$out" prices in keyo-docs.html chat pricing table for the
 * 13 UnoRouter paid models (rows matched by data-copy), and refresh the stale
 * markup note in config/unorouter-paid-models.json.
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
  const re = new RegExp(
    '(<tr><td class="model"><button type="button" class="model-btn" data-copy="' +
      id.replace(/[.$]/g, "\\$&") +
      '">)[^<]*(</button></td><td class="price">)~\\$[0-9.]+(</td><td class="price">)~\\$[0-9.]+(</td><td class="note-cell">)'
  );
  const repl =
    "$1" + id + "$2~$" + fmt(cin) + "$3~$" + fmt(cout) + "$4";
  if (!re.test(s)) throw new Error("docs row not found for " + id);
  s = s.replace(re, repl);
  patched++;
}
fs.writeFileSync(docsPath, s);
console.log("docs rows halved:", patched);

// refresh stale markup note
cfg.note =
  "UnoRouter paid chat on Keyo Chat. Sell = cost x1 (halved 2026-10-05; originally x8, then x4, x2). Public copy must not name the supplier.";
fs.writeFileSync(
  path.join(root, "config/unorouter-paid-models.json"),
  JSON.stringify(cfg, null, 2) + "\n"
);
console.log("config note updated");
console.log("DONE_HALVE_UNOROUTER_DOCS");
