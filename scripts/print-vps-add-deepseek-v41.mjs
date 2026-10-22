/**
 * Generate short VPS paste command for DeepSeek V4.1 Flash 1017 deployment
 * Usage: node scripts/print-vps-add-deepseek-v41.mjs
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

const copyB64 = pack("config/marketplace-model-copy.json");
const iconB64 = pack("config/model-icon-map.json");
const unoCfgB64 = pack("config/unorouter-paid-models.json");
const proxyServerB64 = pack("services/creem-moderation-proxy/server.mjs");
const pyB64 = pack("scripts/vps-add-deepseek-v41.py");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/config /opt/ai-relay/scripts /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${copyB64}' | sudo tee /tmp/ds-copy.b64 >/dev/null`,
  "base64 -d /tmp/ds-copy.b64 | gunzip | sudo tee /opt/ai-relay/config/marketplace-model-copy.json >/dev/null",
  "base64 -d /tmp/ds-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  `echo '${iconB64}' | sudo tee /tmp/ds-icon.b64 >/dev/null`,
  "base64 -d /tmp/ds-icon.b64 | gunzip | sudo tee /opt/ai-relay/config/model-icon-map.json >/dev/null",
  "base64 -d /tmp/ds-icon.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json >/dev/null",
  `echo '${unoCfgB64}' | sudo tee /tmp/ds-uno.b64 >/dev/null`,
  "base64 -d /tmp/ds-uno.b64 | gunzip | sudo tee /opt/ai-relay/config/unorouter-paid-models.json >/dev/null",
  `echo '${proxyServerB64}' | sudo tee /tmp/ds-proxy.b64 >/dev/null`,
  "base64 -d /tmp/ds-proxy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
  `echo '${pyB64}' | sudo tee /tmp/ds-py.b64 >/dev/null`,
  "base64 -d /tmp/ds-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-deepseek-v41.py >/dev/null",
  "sudo python3 /opt/ai-relay/scripts/vps-add-deepseek-v41.py /opt/ai-relay/data/new-api/one-api.db",
  "if sudo docker ps --format '{{.Names}}' | grep -q '^ai-relay-creem-moderation$'; then sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json 2>/dev/null || true; sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json ai-relay-creem-moderation:/app/model-icon-map.json 2>/dev/null || true; sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs 2>/dev/null || true; sudo docker restart ai-relay-creem-moderation 2>/dev/null || true; echo 'OK: creem-moderation updated'; fi",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json http://127.0.0.1:3000/api/pricing || true",
  `python3 - <<'PY'
import json
try:
    d = json.load(open("/tmp/pricing.json"))
    by = {m.get("model_name"): m for m in (d.get("data") or [])}
    for name in ["deepseek-v4.1-flash-1017", "deepseek-v4.1-flash-1017:free"]:
        m = by.get(name)
        if m:
            mr = float(m.get("model_ratio") or 0)
            cr = float(m.get("completion_ratio") or 1)
            print("VERIFY_OK", name, "in: $", round(mr*2, 4), "out: $", round(mr*2*cr, 4), "ratio:", mr, "comp:", cr)
        else:
            print(f"MISSING {name}")
    print("DONE_ADD_DEEPSEEK_V41")
except Exception as e:
    print(f"Verify failed: {e}")
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-add-deepseek-v41-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("Wrote", out, "size:", fs.statSync(out).size);
