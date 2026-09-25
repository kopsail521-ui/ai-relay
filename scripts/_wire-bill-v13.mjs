import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = path.join(root, "services/creem-moderation-proxy/server.mjs");
let s = fs.readFileSync(p, "utf8");

const start = s.indexOf("function buildBillingUnitScript()");
const end = s.indexOf("const LOCALE_DESC_SCRIPT");
if (start < 0 || end < 0) throw new Error("bounds");

const next = `function buildBillingUnitScript() {
  // v13: load raw inject file (avoid template-literal regex breakage); replace 定价 card with OpenLux table.
  const injectPath = path.join(__dirname, "billing-unit-inject.js");
  const js = fs.readFileSync(injectPath, "utf8");
  return "<script>" + js + "</script>";
}


`;

s = s.slice(0, start) + next + s.slice(end);
s = s.replace(/keyo-pricing-sort-v1[45678]/g, "keyo-pricing-sort-v18");
fs.writeFileSync(p, s);

const df = path.join(root, "services/creem-moderation-proxy/Dockerfile");
let d = fs.readFileSync(df, "utf8");
if (!d.includes("billing-unit-inject.js")) {
  d = d.replace(
    "COPY video-routing.mjs server.mjs marketplace-model-copy.json model-icon-map.json ./",
    "COPY video-routing.mjs server.mjs marketplace-model-copy.json model-icon-map.json billing-unit-inject.js ./"
  );
  fs.writeFileSync(df, d);
}

console.log(
  "ok",
  s.includes("billing-unit-inject.js"),
  s.includes("keyo-pricing-sort-v18"),
  /from ["']path["']/.test(s.slice(0, 800))
);
console.log("df", fs.readFileSync(df, "utf8"));

// syntax check inject
const inj = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/billing-unit-inject.js"),
  "utf8"
);
try {
  new Function(inj);
  console.log("inject_syntax_ok", inj.length);
} catch (e) {
  console.log("inject_syntax_ERR", e.message);
  process.exit(1);
}
