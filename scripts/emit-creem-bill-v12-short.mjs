/**
 * Deploy only creem inject v12 + marketplace copy; verify __keyoBillV12 live.
 * Usage: node scripts/emit-creem-bill-v12-short.mjs
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

if (!fs.readFileSync(path.join(root, "services/creem-moderation-proxy/server.mjs"), "utf8").includes("__keyoBillV12")) {
  throw new Error("server.mjs missing __keyoBillV12 — run _patch-bill-v12.mjs first");
}

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${copyB64}' | sudo tee /tmp/mkt-bill.b64 >/dev/null`,
  "base64 -d /tmp/mkt-bill.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  `echo '${serverB64}' | sudo tee /tmp/creem-srv.b64 >/dev/null`,
  "base64 -d /tmp/creem-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
  "grep -o '__keyoBillV12' /opt/ai-relay/services/creem-moderation-proxy/server.mjs | head -1",
  "grep -o 'keyo-pricing-sort-v17' /opt/ai-relay/services/creem-moderation-proxy/server.mjs | head -1",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 5",
  "curl -sS https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o '__keyoBillV12' | head -1",
  "curl -sS https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o 'keyo-pricing-sort-v17' | head -1",
  "curl -sS https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o '按秒收费' | head -1",
  "echo DONE_CREEM_BILL_V12",
].join(" && ");

const out = path.join(root, "scripts/vps-creem-bill-v12-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
