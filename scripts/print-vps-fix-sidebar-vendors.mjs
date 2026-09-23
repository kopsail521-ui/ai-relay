/**
 * Short VPS: hotpatch creem pickVendor fix (sidebar vendors no longer collapse to 字节跳动)
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function pack(rel) {
  return zlib
    .gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 })
    .toString("base64");
}

const serverB64 = pack("services/creem-moderation-proxy/server.mjs");
const copyB64 = pack(
  "services/creem-moderation-proxy/marketplace-model-copy.json"
);

const cmd = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${serverB64}' | sudo tee /tmp/creem-server.b64 >/dev/null`,
  "base64 -d /tmp/creem-server.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
  `echo '${copyB64}' | sudo tee /tmp/creem-copy.b64 >/dev/null`,
  "base64 -d /tmp/creem-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 3",
  "curl -sS -o /tmp/pricing-page.html https://www.keyoapi.xyz/pricing",
  `python3 - <<'PY'
import re
html=open('/tmp/pricing-page.html',encoding='utf-8',errors='ignore').read()
bad='(MAP.__vendors__||{})["字节跳动"]' in html or "(MAP.__vendors__||{})[\\\"字节跳动\\\"]" in html
print('locale_script', 'V6' if '__keyoLocaleDescV6' in html else ('V5' if '__keyoLocaleDescV5' in html else 'UNKNOWN'))
print('bad_bytedance_fallback', bad)
print('DONE_FIX_SIDEBAR_VENDORS')
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-fix-sidebar-vendors-short.txt");
fs.writeFileSync(out, cmd.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, "bytes", fs.statSync(out).size);
