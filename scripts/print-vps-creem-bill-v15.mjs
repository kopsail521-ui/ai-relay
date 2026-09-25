/**
 * Deploy creem bill v15: inject OpenLux price table on all non-auth SPA shells
 * so soft-nav from / → /pricing still gets the resolution tier list.
 * Usage: node scripts/print-vps-creem-bill-v15.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const injectSrc = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/billing-unit-inject.js"),
  "utf8"
);
const serverSrc = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/server.mjs"),
  "utf8"
);
if (!injectSrc.includes("__keyoBillV15")) throw new Error("missing __keyoBillV15");
if (!serverSrc.includes("keyo-pricing-sort-v20")) throw new Error("missing keyo-pricing-sort-v20");
if (!serverSrc.includes("wantPricingPatches")) throw new Error("missing wantPricingPatches");

const copyB64 = pack("services/creem-moderation-proxy/marketplace-model-copy.json");
const serverB64 = pack("services/creem-moderation-proxy/server.mjs");
const injectB64 = pack("services/creem-moderation-proxy/billing-unit-inject.js");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${copyB64}' | sudo tee /tmp/mkt-bill.b64 >/dev/null`,
  "base64 -d /tmp/mkt-bill.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  `echo '${serverB64}' | sudo tee /tmp/creem-srv.b64 >/dev/null`,
  "base64 -d /tmp/creem-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
  `echo '${injectB64}' | sudo tee /tmp/creem-bill.b64 >/dev/null`,
  "base64 -d /tmp/creem-bill.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js >/dev/null",
  "grep -o '__keyoBillV15' /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js | head -1",
  "grep -o 'keyo-pricing-sort-v20' /opt/ai-relay/services/creem-moderation-proxy/server.mjs | head -1",
  "grep -o 'wantPricingPatches' /opt/ai-relay/services/creem-moderation-proxy/server.mjs | head -1",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 5",
  "curl -sS -H 'Cache-Control: no-cache' https://www.keyoapi.xyz/ | tr -d '\\n' | grep -o '__keyoBillV15' | head -1",
  "curl -sS -H 'Cache-Control: no-cache' https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o 'keyo-pricing-sort-v20' | head -1",
  "curl -sS -H 'Cache-Control: no-cache' https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o '0.02055' | head -1",
  "echo DONE_CREEM_BILL_V15",
].join(" && ");

const out = path.join(root, "scripts/vps-creem-bill-v15-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
