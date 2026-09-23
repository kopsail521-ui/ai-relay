/**
 * Emit one-liner VPS short for weak-desc patch deploy.
 * Usage: node scripts/emit-patch-weak-descs-short.mjs
 */
import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const copyB64 = pack("services/creem-moderation-proxy/marketplace-model-copy.json");
const pyB64 = pack("scripts/vps-patch-weak-descs.py");

const verifyPy = [
  "import json",
  "j=json.load(open('/tmp/pricing.json'))",
  "ids=['glm-5.3-flash:free','glm-5.3','nemotron-3-ultra-550b-a55b:free','seedance-2.0-1080p','mistral-large-3-675b:free']",
  "by={m['model_name']:m for m in j.get('data') or []}",
  "for i in ids:",
  "  d=(by.get(i) or {}).get('description') or ''",
  "  print(i, 'ok' if d and d!=i and len(d)>20 else 'WEAK', d[:60])",
  "print('DONE_PATCH_WEAK_DESCS_LIVE')",
].join("\n");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/scripts",
  `echo '${copyB64}' | sudo tee /tmp/mkt-descs.b64 >/dev/null`,
  "base64 -d /tmp/mkt-descs.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  `echo '${pyB64}' | sudo tee /tmp/patch-descs.b64 >/dev/null`,
  "base64 -d /tmp/patch-descs.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-patch-weak-descs.py >/dev/null",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /opt/ai-relay/scripts/vps-patch-weak-descs.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-creem-moderation ai-relay-new-api",
  "sleep 4",
  "curl -sS -o /tmp/pricing.json https://www.keyoapi.xyz/api/pricing",
  `python3 -c ${JSON.stringify(verifyPy)}`,
].join(" && ");

const out = path.join(root, "scripts/vps-patch-weak-descs-short.txt");
fs.writeFileSync(out, short + "\n");
console.log("short_bytes", fs.statSync(out).size);
console.log("wrote", out);
