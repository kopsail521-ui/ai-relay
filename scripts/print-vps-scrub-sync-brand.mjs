import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const copyB64 = pack("services/creem-moderation-proxy/marketplace-model-copy.json");
const docsB64 = pack("static/brand/keyo-docs.html");
const refB64 = pack("static/brand/keyo-api-ref.md");
const refEnB64 = pack("static/brand/keyo-api-ref.en.md");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/static/brand",
  `echo '${copyB64}' | sudo tee /tmp/mkt-copy.b64 >/dev/null`,
  "base64 -d /tmp/mkt-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  `echo '${docsB64}' | sudo tee /tmp/docs.b64 >/dev/null`,
  "base64 -d /tmp/docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${refB64}' | sudo tee /tmp/ref.b64 >/dev/null`,
  "base64 -d /tmp/ref.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null",
  `echo '${refEnB64}' | sudo tee /tmp/refen.b64 >/dev/null`,
  "base64 -d /tmp/refen.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 3",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "curl -sS -o /tmp/pricing-page.html https://www.keyoapi.xyz/pricing",
  "curl -sS -o /tmp/docs-check.html https://www.keyoapi.xyz/static/brand/keyo-docs.html",
  `python3 - <<'PY'
import re
html=open('/tmp/pricing-page.html',encoding='utf-8',errors='ignore').read()
docs=open('/tmp/docs-check.html',encoding='utf-8',errors='ignore').read()
gone=['glm-5.2-free','kimi-k3-free','deepseek-v4-flash-free','deepseek-v4-pro-free']
print('copy_gone_still', [g for g in gone if g in html] or 'NONE')
print('docs_has_glm53', 'data-copy=\"glm-5.3\"' in docs)
print('public_leak', bool(re.search(r'unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|gitee|moark', html+docs, re.I)))
print('DONE_SCRUB_SYNC_BRAND')
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-scrub-sync-brand-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
