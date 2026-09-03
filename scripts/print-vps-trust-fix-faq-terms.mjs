/**
 * Re-pack only faq + terms (empty on VPS after gzip failure)
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

function pack(name, absPath) {
  const raw = fs.readFileSync(absPath);
  const b64 = zlib.gzipSync(raw, { level: 9 }).toString("base64");
  const CHUNK = 2200;
  const parts = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  parts.forEach((p, idx) => {
    const n = idx + 1;
    const op = idx === 0 ? "sudo tee" : "sudo tee -a";
    writeLf(
      path.join(__dirname, `vps-trust-fix-${name}-p${n}.txt`),
      `echo '${p}' | ${op} /tmp/vps-trust-${name}.b64 >/dev/null && echo OK_FIX_${name.toUpperCase()}_PART${n}`
    );
  });
  return { name, parts: parts.length, bytes: raw.length };
}

const packs = [
  pack("faq", path.join(root, "static/brand/faq.html")),
  pack("terms", path.join(root, "static/brand/terms.html")),
];

writeLf(
  path.join(__dirname, "vps-trust-fix-deploy.txt"),
  `set -e
base64 -d /tmp/vps-trust-faq.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/faq.html >/dev/null
base64 -d /tmp/vps-trust-terms.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/terms.html >/dev/null
wc -c /opt/ai-relay/static/brand/faq.html /opt/ai-relay/static/brand/terms.html
if [ -d /opt/ai-relay/data/new-api ]; then
  sudo mkdir -p /opt/ai-relay/data/new-api/brand
  sudo cp -f /opt/ai-relay/static/brand/faq.html /opt/ai-relay/static/brand/terms.html /opt/ai-relay/data/new-api/brand/
fi
if [ -d /opt/ai-relay/new-api/web/public/brand ]; then
  sudo cp -f /opt/ai-relay/static/brand/faq.html /opt/ai-relay/static/brand/terms.html /opt/ai-relay/new-api/web/public/brand/
fi
if sudo docker inspect ai-relay-new-api >/dev/null 2>&1; then
  sudo docker cp /opt/ai-relay/static/brand/faq.html ai-relay-new-api:/app/web/dist/brand/faq.html 2>/dev/null || true
  sudo docker cp /opt/ai-relay/static/brand/terms.html ai-relay-new-api:/app/web/dist/brand/terms.html 2>/dev/null || true
  sudo docker cp /opt/ai-relay/static/brand/faq.html ai-relay-new-api:/app/web/public/brand/faq.html 2>/dev/null || true
  sudo docker cp /opt/ai-relay/static/brand/terms.html ai-relay-new-api:/app/web/public/brand/terms.html 2>/dev/null || true
fi
echo DONE_TRUST_FIX_FAQ_TERMS`
);

console.log(JSON.stringify({ packs }, null, 2));
