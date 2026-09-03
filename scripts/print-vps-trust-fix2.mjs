/**
 * Robust Workbench packs for faq + terms.
 * - small chunks (avoid paste truncation)
 * - strip whitespace on decode
 * - sha256 check before DONE
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

function pack(name, absPath, chunk = 900) {
  const raw = fs.readFileSync(absPath);
  const sha = crypto.createHash("sha256").update(raw).digest("hex");
  const b64 = zlib.gzipSync(raw, { level: 9 }).toString("base64");
  const parts = [];
  for (let i = 0; i < b64.length; i += chunk) parts.push(b64.slice(i, i + chunk));
  // wipe any old leftover on VPS first
  writeLf(
    path.join(__dirname, `vps-trust-fix2-${name}-p0.txt`),
    `sudo rm -f /tmp/vps-trust-${name}.b64 && : > /tmp/vps-trust-${name}.b64 && echo OK_FIX2_${name.toUpperCase()}_CLEAR`
  );
  parts.forEach((p, idx) => {
    const n = idx + 1;
    writeLf(
      path.join(__dirname, `vps-trust-fix2-${name}-p${n}.txt`),
      `printf '%s' '${p}' | sudo tee -a /tmp/vps-trust-${name}.b64 >/dev/null && echo OK_FIX2_${name.toUpperCase()}_PART${n}`
    );
  });
  return { name, parts: parts.length, bytes: raw.length, sha, b64Chars: b64.length };
}

const faq = pack("faq", path.join(root, "static/brand/faq.html"));
const terms = pack("terms", path.join(root, "static/brand/terms.html"));

writeLf(
  path.join(__dirname, "vps-trust-fix2-deploy.txt"),
  `set -e
decode() {
  local name="$1" dest="$2" expect_sha="$3"
  tr -d '\\n\\r\\t ' < "/tmp/vps-trust-\${name}.b64" | base64 -d | gunzip | sudo tee "\$dest" >/dev/null
  local got
  got=\$(sha256sum "\$dest" | awk '{print \$1}')
  echo "\${name}_bytes=\$(wc -c < "\$dest") sha=\$got"
  test "\$got" = "\$expect_sha"
}
decode faq /opt/ai-relay/static/brand/faq.html ${faq.sha}
decode terms /opt/ai-relay/static/brand/terms.html ${terms.sha}
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
echo DONE_TRUST_FIX2`
);

const steps = [];
steps.push(`vps-trust-fix2-faq-p0.txt → OK_FIX2_FAQ_CLEAR`);
for (let i = 1; i <= faq.parts; i++) steps.push(`vps-trust-fix2-faq-p${i}.txt → OK_FIX2_FAQ_PART${i}`);
steps.push(`vps-trust-fix2-terms-p0.txt → OK_FIX2_TERMS_CLEAR`);
for (let i = 1; i <= terms.parts; i++) steps.push(`vps-trust-fix2-terms-p${i}.txt → OK_FIX2_TERMS_PART${i}`);
steps.push(`vps-trust-fix2-deploy.txt → DONE_TRUST_FIX2`);

writeLf(path.join(__dirname, "vps-trust-fix2-readme.txt"), ["FAQ+Terms 小分片重传（防粘贴截断）", "", ...steps.map((s, i) => `${i + 1}. ${s}`)].join("\n"));

console.log(JSON.stringify({ faq, terms, steps }, null, 2));
