/**
 * Generate short VPS paste: list gpt-6.1-sol on Keyo Primary (sell = cost).
 *   node scripts/print-vps-add-gpt-6.1-sol.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

const py = fs.readFileSync(path.join(__dirname, "vps-add-gpt-6.1-sol.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts",
  `echo '${pyB64}' | sudo tee /tmp/gpt61-sol-py.b64 >/dev/null`,
  "base64 -d /tmp/gpt61-sol-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-gpt-6.1-sol.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-add-gpt-6.1-sol.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker restart ai-relay-creem-moderation",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json,re
d=json.load(open("/tmp/pricing.json"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
m=by.get("gpt-6.1-sol")
print("hit", bool(m))
if m:
  mr=float(m.get("model_ratio") or 0)
  cr=float(m.get("completion_ratio") or 1)
  print("sell", round(mr*2,6), "/", round(mr*2*cr,6))
blob=json.dumps(d,ensure_ascii=False)
print("public_leak", bool(re.search(r'unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough', blob, re.I)))
print("DONE_ADD_GPT61_SOL")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-add-gpt-6.1-sol-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-add-gpt-6.1-sol-readme.txt"),
  `# 上架 gpt-6.1-sol（Keyo Primary；售价=成本）

约 $0.07354 / $0.3677 每百万 tokens。

粘贴：scripts/vps-add-gpt-6.1-sol-short.txt
→ DONE_ADD_GPT61_SOL
`
);

console.log({ pyB64: pyB64.length, short: Buffer.byteLength(short) });
