/**
 * VPS short: restore InfiniteTalk 15s audio gate + docs.
 *   node scripts/print-vps-infinitetalk-15s-gate.mjs
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

function pack(rel) {
  return zlib
    .gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 })
    .toString("base64");
}

const serverB64 = pack("services/gitee-passthrough/server.mjs");
const catalogB64 = pack("services/gitee-passthrough/catalog.json");
const docsB64 = pack("static/brand/keyo-docs.html");
const copyB64 = pack("services/creem-moderation-proxy/marketplace-model-copy.json");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/gitee-passthrough /opt/ai-relay/static/brand /opt/ai-relay/services/creem-moderation-proxy",
  "sudo git pull --ff-only origin main || echo PULL_SKIP",
  `echo '${serverB64}' | sudo tee /tmp/it15-server.b64 >/dev/null`,
  "base64 -d /tmp/it15-server.b64 | gunzip | sudo tee /opt/ai-relay/services/gitee-passthrough/server.mjs >/dev/null",
  `echo '${catalogB64}' | sudo tee /tmp/it15-catalog.b64 >/dev/null`,
  "base64 -d /tmp/it15-catalog.b64 | gunzip | sudo tee /opt/ai-relay/services/gitee-passthrough/catalog.json >/dev/null",
  `echo '${docsB64}' | sudo tee /tmp/it15-docs.b64 >/dev/null`,
  "base64 -d /tmp/it15-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${copyB64}' | sudo tee /tmp/it15-copy.b64 >/dev/null`,
  "base64 -d /tmp/it15-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  "sudo docker build -t keyo-gitee-passthrough ./services/gitee-passthrough",
  "sudo docker rm -f ai-relay-gitee-passthrough 2>/dev/null || true",
  "sudo docker run -d --name ai-relay-gitee-passthrough --restart always --network host --env-file /opt/ai-relay/.env.gitee -v /opt/ai-relay/data/new-api:/data:rw -e NEW_API_DB=/data/one-api.db -e NEW_API_BASE=http://127.0.0.1:3000 -e CATALOG=/app/catalog.json -e LISTEN_HOST=127.0.0.1 -e PORT=3010 keyo-gitee-passthrough",
  "sleep 2",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json 2>/dev/null || true",
  "sudo docker restart ai-relay-creem-moderation 2>/dev/null || true",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  'sudo docker exec ai-relay-gitee-passthrough grep -n "infinitetalk_audio_too_long\\|duration > 15\\|audioDurationSeconds" /app/server.mjs | head -20',
  "curl -sS -o /tmp/docs.html https://www.keyoapi.xyz/brand/keyo-docs.html",
  "python3 - <<'PY'\nimport pathlib\nd=pathlib.Path('/tmp/docs.html').read_text(encoding='utf-8',errors='ignore')\nprint('docs_15s', '最长 15 秒' in d or '15 seconds or shorter' in d)\nprint('DONE_INFINITETALK_15S_GATE')\nPY",
].join(" && ");

writeLf(path.join(root, "scripts/vps-infinitetalk-15s-gate-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-infinitetalk-15s-gate-readme.txt"),
  `# 恢复 InfiniteTalk 单任务音频 ≤15 秒（对齐上游硬限制）

粘贴：scripts/vps-infinitetalk-15s-gate-short.txt
→ docs_15s True
→ DONE_INFINITETALK_15S_GATE
`
);

console.log({
  serverB64: serverB64.length,
  catalogB64: catalogB64.length,
  docsB64: docsB64.length,
  copyB64: copyB64.length,
  short: Buffer.byteLength(short),
});
