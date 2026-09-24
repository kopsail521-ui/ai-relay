/**
 * Emit VPS short: restore video billing descs + tags + list-card unit rewrite.
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
const pyB64 = pack("scripts/vps-heal-billing-descs.py");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/scripts",
  `echo '${copyB64}' | sudo tee /tmp/mkt-bill.b64 >/dev/null`,
  "base64 -d /tmp/mkt-bill.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  `echo '${serverB64}' | sudo tee /tmp/creem-srv.b64 >/dev/null`,
  "base64 -d /tmp/creem-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
  `echo '${pyB64}' | sudo tee /tmp/heal-bill.b64 >/dev/null`,
  "base64 -d /tmp/heal-bill.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-heal-billing-descs.py >/dev/null",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /opt/ai-relay/scripts/vps-heal-billing-descs.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-creem-moderation ai-relay-new-api",
  "sleep 5",
  "curl -sS -o /tmp/pricing.json https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json,re
j=json.load(open('/tmp/pricing.json'))
by={m['model_name']:m for m in j.get('data') or []}
ids=['seedance-2.0-1080p','MiniMax-H3','flux-3-video','grok-1.5-video','gpt-image-2.5']
for i in ids:
  m=by.get(i) or {}
  d=m.get('description') or ''
  print(i, 'tag='+(m.get('tags') or ''), 'bill' if re.search(r'计费|/秒|/次', d) else 'NO_BILL', d[-40:])
sec=sum(1 for m in by.values() if (m.get('tags') or '')=='视频按秒')
req=sum(1 for m in by.values() if (m.get('tags') or '')=='视频按次')
print('tag_counts', '视频按秒', sec, '视频按次', req)
blob=json.dumps(j,ensure_ascii=False)
print('public_leak', bool(re.search(r'unorouter|openlux|apimart|grsai|上游|进货|二道|passthrough', blob, re.I)))
print('DONE_HEAL_BILLING_LIVE')
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-heal-billing-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
