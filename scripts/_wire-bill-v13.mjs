/**
 * Wire billing-unit-inject.js into creem server.mjs (v13).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const injectPath = path.join(
  root,
  "services/creem-moderation-proxy/billing-unit-inject.js"
);
const serverPath = path.join(root, "services/creem-moderation-proxy/server.mjs");

const browserJs = fs.readFileSync(injectPath, "utf8");
try {
  new Function(browserJs);
} catch (e) {
  console.error("inject syntax fail", e.message);
  process.exit(1);
}

let s = fs.readFileSync(serverPath, "utf8");
const start = s.indexOf("function buildBillingUnitScript()");
const end = s.indexOf("const LOCALE_DESC_SCRIPT");
if (start < 0 || end < 0) throw new Error("bounds");

const next = `function buildBillingUnitScript() {
  // v13: load OpenLux pricing-card inject from sibling file (JSON-escaped, no regex breakage).
  const js = ${JSON.stringify(browserJs)};
  return "<script>" + js + "</script>";
}


`;

s = s.slice(0, start) + next + s.slice(end);
s = s.replace(/keyo-pricing-sort-v1[0-9]+/g, "keyo-pricing-sort-v18");
fs.writeFileSync(serverPath, s);
console.log(
  "wired",
  "v13=" + s.includes("__keyoBillV13"),
  "v18=" + s.includes("keyo-pricing-sort-v18"),
  "bytes=" + browserJs.length
);
