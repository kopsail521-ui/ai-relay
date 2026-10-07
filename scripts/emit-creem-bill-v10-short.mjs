/**
 * Deploy only creem server.mjs (billing detail inject v10).
 * Usage: node scripts/emit-creem-bill-v10-short.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const b64 = zlib
  .gzipSync(fs.readFileSync(path.join(root, "services/creem-moderation-proxy/server.mjs")), {
    level: 9,
  })
  .toString("base64");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${b64}' | sudo tee /tmp/creem-srv.b64 >/dev/null`,
  "base64 -d /tmp/creem-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 4",
  "curl -sS https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o '__keyoBillV10' | head -1",
  "curl -sS https://www.keyoapi.xyz/pricing | tr -d '\\n' | grep -o 'keyo-pricing-sort-v15' | head -1",
  "echo DONE_CREEM_BILL_V10",
].join(" && ");

const out = path.join(root, "scripts/vps-creem-bill-v10-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
