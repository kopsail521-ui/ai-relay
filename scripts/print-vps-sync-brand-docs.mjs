/**
 * Hotfix brand docs: add glm-5.3 row + scrub moark from api-ref (b64, no pull).
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

const docsB64 = pack("static/brand/keyo-docs.html");
const refB64 = pack("static/brand/keyo-api-ref.md");
const refEnB64 = pack("static/brand/keyo-api-ref.en.md");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/static/brand",
  `echo '${docsB64}' | sudo tee /tmp/keyo-docs.b64 >/dev/null`,
  "base64 -d /tmp/keyo-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${refB64}' | sudo tee /tmp/keyo-ref.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null",
  `echo '${refEnB64}' | sudo tee /tmp/keyo-ref-en.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref-en.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null",
  "sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh || true",
  "curl -sS -o /tmp/docs.html https://www.keyoapi.xyz/brand/keyo-docs.html",
  "curl -sS -o /tmp/ref.md https://www.keyoapi.xyz/brand/keyo-api-ref.md",
  `python3 - <<'PY'
docs=open('/tmp/docs.html',encoding='utf-8',errors='ignore').read()
ref=open('/tmp/ref.md',encoding='utf-8',errors='ignore').read()
print('docs_glm53', 'data-copy="glm-5.3"' in docs)
print('docs_leak_moark', 'moark' in docs.lower())
print('ref_leak_moark', 'moark' in ref.lower())
print('DONE_SYNC_BRAND_DOCS')
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-sync-brand-docs-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
