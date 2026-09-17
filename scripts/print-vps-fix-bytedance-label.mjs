/**
 * Emit VPS one-shot to deploy ByteDance→字节跳动 label fix + lobehub icon fixes.
 * Usage: node scripts/print-vps-fix-bytedance-label.mjs > scripts/vps-fix-bytedance-label.txt
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const files = [
  "services/creem-moderation-proxy/server.mjs",
  "services/creem-moderation-proxy/marketplace-model-copy.json",
  "services/creem-moderation-proxy/model-icon-map.json",
];

const lines = [];
lines.push(
  "# Fix: zh sidebar shows 字节跳动 (not ByteDance); apply lobehub icon fixes on /api/pricing"
);
lines.push("set -euo pipefail");
lines.push("cd /opt/ai-relay");

for (const rel of files) {
  const raw = fs.readFileSync(path.join(root, rel));
  const b64 = zlib.gzipSync(raw).toString("base64");
  const tag = path.basename(rel).replace(/\W+/g, "_");
  const b64path = `/tmp/keyo_${tag}.b64`;
  lines.push(`cat > ${b64path} <<'EOF_B64'`);
  lines.push(b64);
  lines.push("EOF_B64");
  lines.push(
    `base64 -d ${b64path} | gunzip | sudo tee /opt/ai-relay/${rel} >/dev/null`
  );
}

lines.push(
  "sudo docker build -t keyo-creem-moderation ./services/creem-moderation-proxy"
);
lines.push("sudo docker rm -f ai-relay-creem-moderation 2>/dev/null || true");
lines.push(
  "sudo docker run -d --name ai-relay-creem-moderation --restart always --network host --env-file /opt/ai-relay/.env.moderation -e UPSTREAM_URL=http://127.0.0.1:3000 -e LISTEN_HOST=127.0.0.1 -e PORT=3001 keyo-creem-moderation"
);
lines.push("sleep 2");
lines.push(
  "curl -sS http://127.0.0.1:3001/api/pricing | python3 -c \"import sys,json;j=json.load(sys.stdin);vs=[v for v in j.get('vendors',[]) if v.get('id')==21 or 'Byte' in (v.get('name') or '') or '\\u5b57\\u8282' in (v.get('name') or '')];print('vendors',[(v.get('id'),v.get('name'),v.get('icon')) for v in vs]);ms=[(m['model_name'],m.get('icon'),m.get('vendor_id')) for m in j['data'] if m['model_name'] in ('Unlimited-OCR','IndexTTS-2','seedance-2.5','seedance-2.0')];print('models',ms)\""
);
lines.push("echo DONE_FIX_BYTEDANCE_LABEL");

const outPath = path.join(__dirname, "vps-fix-bytedance-label.txt");
fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.error("wrote", outPath, fs.statSync(outPath).size);
