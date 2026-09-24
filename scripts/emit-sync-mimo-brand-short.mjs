/**
 * Force-sync brand docs + marketplace copy for mimo (b64, no git pull required).
 * Usage: node scripts/emit-sync-mimo-brand-short.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const docsB64 = pack("static/brand/keyo-docs.html");
const refB64 = pack("static/brand/keyo-api-ref.md");
const refEnB64 = pack("static/brand/keyo-api-ref.en.md");
const copyB64 = pack("services/creem-moderation-proxy/marketplace-model-copy.json");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/static/brand /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${docsB64}' | sudo tee /tmp/keyo-docs.b64 >/dev/null`,
  "base64 -d /tmp/keyo-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${refB64}' | sudo tee /tmp/keyo-ref.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null",
  `echo '${refEnB64}' | sudo tee /tmp/keyo-ref-en.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref-en.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null",
  `echo '${copyB64}' | sudo tee /tmp/mkt-copy.b64 >/dev/null`,
  "base64 -d /tmp/mkt-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker restart ai-relay-creem-moderation",
  "sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "sleep 3",
  "curl -sS -o /tmp/docs.html https://www.keyoapi.xyz/brand/keyo-docs.html",
  "curl -sS -o /tmp/ref.md https://www.keyoapi.xyz/brand/keyo-api-ref.md",
  "curl -sS -o /tmp/pricing.json https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json,re
docs=open('/tmp/docs.html',encoding='utf-8',errors='ignore').read()
ref=open('/tmp/ref.md',encoding='utf-8',errors='ignore').read()
j=json.load(open('/tmp/pricing.json'))
blob=json.dumps(j,ensure_ascii=False)+docs+ref
leak=bool(re.search(r'unorouter|openlux|apimart|grsai|sensenova|模力|上游|passthrough|进货|二道', blob, re.I))
ids=['mimo-v2.6-pro','mimo-v2.6-flash']
by={m['model_name']:m for m in j.get('data') or []}
print('docs_mimo', all(f'data-copy="{i}"' in docs for i in ids))
print('ref_mimo', all(i in ref for i in ids))
for i in ids:
  m=by.get(i) or {}
  d=(m.get('description') or '')
  print(i, 'listed' if m else 'MISSING', 'desc_ok' if d and d!=i and len(d)>20 else 'WEAK')
print('public_leak', leak)
print('DONE_SYNC_MIMO_BRAND')
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-sync-mimo-brand-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
