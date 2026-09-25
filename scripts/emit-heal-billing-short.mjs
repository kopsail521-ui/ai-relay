/**
 * Emit VPS short: billing drawer OpenLux table (v13 inject file).
 * Usage: node scripts/emit-heal-billing-short.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const copyB64 = pack("services/creem-moderation-proxy/marketplace-model-copy.json");
const serverB64 = pack("services/creem-moderation-proxy/server.mjs");
const injB64 = pack("services/creem-moderation-proxy/billing-unit-inject.js");
const pyB64 = pack("scripts/vps-heal-billing-descs.py");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/scripts",
  `echo '${copyB64}' | sudo tee /tmp/mkt-bill.b64 >/dev/null`,
  "base64 -d /tmp/mkt-bill.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  `echo '${serverB64}' | sudo tee /tmp/creem-srv.b64 >/dev/null`,
  "base64 -d /tmp/creem-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
  `echo '${injB64}' | sudo tee /tmp/creem-inj.b64 >/dev/null`,
  "base64 -d /tmp/creem-inj.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js >/dev/null",
  `echo '${pyB64}' | sudo tee /tmp/heal-bill.b64 >/dev/null`,
  "base64 -d /tmp/heal-bill.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-heal-billing-descs.py >/dev/null",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /opt/ai-relay/scripts/vps-heal-billing-descs.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 4",
  "curl -sS https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o '__keyoBillV13' | head -1",
  "curl -sS https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o 'keyo-pricing-sort-v18' | head -1",
  "curl -sS https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o 'fillPricingCard' | head -1",
  "echo DONE_HEAL_BILLING_LIVE",
].join(" && ");

const out = path.join(root, "scripts/vps-heal-billing-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
