/**
 * VPS: enable POST /v1/uploads (+ /v1/files), mount static/uploads for Caddy,
 * sync brand docs that document the upload flow.
 *
 *   node scripts/print-vps-enable-uploads.mjs
 * → writes scripts/vps-enable-uploads.txt (paste on VPS Workbench)
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function pack(rel) {
  const abs = path.join(root, rel);
  const gz = zlib.gzipSync(fs.readFileSync(abs));
  return gz.toString("base64");
}

const serverB64 = pack("services/creem-moderation-proxy/server.mjs");
const docsB64 = pack("static/brand/keyo-docs.html");
const refZhB64 = pack("static/brand/keyo-api-ref.md");
const refEnB64 = pack("static/brand/keyo-api-ref.en.md");
const onePagerB64 = pack("docs/客户接入一页纸.md");

const lines = [
  "set -euo pipefail",
  "sudo mkdir -p /opt/ai-relay/static/uploads /opt/ai-relay/static/brand /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/docs",
  "sudo chmod 755 /opt/ai-relay/static/uploads",
  "",
  `echo '${serverB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null`,
  `echo '${docsB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null`,
  `echo '${refZhB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null`,
  `echo '${refEnB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null`,
  `echo '${onePagerB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/docs/客户接入一页纸.md >/dev/null`,
  "",
  "# Ensure Caddy serves /uploads/* from host dir (idempotent)",
  "if ! sudo grep -q 'handle_path /uploads/\\*' /etc/caddy/Caddyfile 2>/dev/null; then",
  "  echo 'WARN: Caddy missing handle_path /uploads/* — re-run SEO Caddy install if public GET /uploads fails'",
  "fi",
  "",
  "cd /opt/ai-relay",
  "sudo docker build -t keyo-creem-moderation ./services/creem-moderation-proxy",
  "sudo docker rm -f ai-relay-creem-moderation 2>/dev/null || true",
  "sudo docker run -d --name ai-relay-creem-moderation --restart always --network host \\",
  "  --env-file /opt/ai-relay/.env.moderation \\",
  "  -e UPSTREAM_URL=http://127.0.0.1:3000 \\",
  "  -e LISTEN_HOST=127.0.0.1 \\",
  "  -e PORT=3001 \\",
  "  -e UPLOAD_DIR=/opt/ai-relay/static/uploads \\",
  "  -e UPLOAD_PUBLIC_BASE=https://www.keyoapi.xyz/uploads \\",
  "  -e UPLOAD_MAX_BYTES=104857600 \\",
  "  -e UPLOAD_TTL_HOURS=48 \\",
  "  -v /opt/ai-relay/static/uploads:/opt/ai-relay/static/uploads \\",
  "  keyo-creem-moderation",
  "",
  "sleep 2",
  'curl -sS -o /tmp/up_probe.json -w "upload_probe=%{http_code}\\n" -X POST http://127.0.0.1:3001/v1/uploads -H "Authorization: Bearer sk-invalid" -F "file=@/etc/hosts" || true',
  "head -c 200 /tmp/up_probe.json; echo",
  'curl -sS -o /dev/null -w "brand_docs=%{http_code}\\n" https://www.keyoapi.xyz/brand/keyo-docs.html || true',
  'curl -sS -o /dev/null -w "api_ref=%{http_code}\\n" https://www.keyoapi.xyz/brand/keyo-api-ref.md || true',
  "echo DONE_ENABLE_UPLOADS",
  "echo 'Expect upload_probe=401 (creem auth), NOT New-API Invalid URL 404'",
].join("\n");

const out = path.join(root, "scripts/vps-enable-uploads.txt");
fs.writeFileSync(out, lines);
console.log("Wrote", out, "(" + lines.length + " chars)");
console.log("Paste scripts/vps-enable-uploads.txt on the VPS Workbench.");
