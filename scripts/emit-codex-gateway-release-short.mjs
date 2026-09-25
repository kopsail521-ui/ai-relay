/**
 * Emit VPS short: deploy Codex gateway/docs fixes (InfiniteTalk + stream + brand).
 * Usage: node scripts/emit-codex-gateway-release-short.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const files = {
  gitee: pack("services/gitee-passthrough/server.mjs"),
  giteeDf: pack("services/gitee-passthrough/Dockerfile"),
  creem: pack("services/creem-moderation-proxy/server.mjs"),
  caddy: pack("scripts/caddy-seo-shared.mjs"),
  docs: pack("static/brand/keyo-docs.html"),
  ref: pack("static/brand/keyo-api-ref.md"),
  refEn: pack("static/brand/keyo-api-ref.en.md"),
  seoIt: pack("static/seo/model/InfiniteTalk.html"),
  seoAv: pack("static/seo/ai-avatar-video-generator.html"),
};

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/gitee-passthrough /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/scripts /opt/ai-relay/static/brand /opt/ai-relay/static/seo/model",
  `echo '${files.gitee}' | sudo tee /tmp/gitee-srv.b64 >/dev/null`,
  "base64 -d /tmp/gitee-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/gitee-passthrough/server.mjs >/dev/null",
  `echo '${files.giteeDf}' | sudo tee /tmp/gitee-df.b64 >/dev/null`,
  "base64 -d /tmp/gitee-df.b64 | gunzip | sudo tee /opt/ai-relay/services/gitee-passthrough/Dockerfile >/dev/null",
  `echo '${files.creem}' | sudo tee /tmp/creem-srv.b64 >/dev/null`,
  "base64 -d /tmp/creem-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
  `echo '${files.caddy}' | sudo tee /tmp/caddy-shared.b64 >/dev/null`,
  "base64 -d /tmp/caddy-shared.b64 | gunzip | sudo tee /opt/ai-relay/scripts/caddy-seo-shared.mjs >/dev/null",
  `echo '${files.docs}' | sudo tee /tmp/keyo-docs.b64 >/dev/null`,
  "base64 -d /tmp/keyo-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${files.ref}' | sudo tee /tmp/keyo-ref.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null",
  `echo '${files.refEn}' | sudo tee /tmp/keyo-ref-en.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref-en.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null",
  `echo '${files.seoIt}' | sudo tee /tmp/seo-it.b64 >/dev/null`,
  "base64 -d /tmp/seo-it.b64 | gunzip | sudo tee /opt/ai-relay/static/seo/model/InfiniteTalk.html >/dev/null",
  `echo '${files.seoAv}' | sudo tee /tmp/seo-av.b64 >/dev/null`,
  "base64 -d /tmp/seo-av.b64 | gunzip | sudo tee /opt/ai-relay/static/seo/ai-avatar-video-generator.html >/dev/null",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker restart ai-relay-creem-moderation",
  "sudo docker build -t keyo-gitee-passthrough ./services/gitee-passthrough",
  "sudo docker rm -f ai-relay-gitee-passthrough 2>/dev/null || true",
  "sudo docker run -d --name ai-relay-gitee-passthrough --restart always --network host --env-file /opt/ai-relay/.env.gitee -v /opt/ai-relay/data/new-api:/data:rw -e NEW_API_DB=/data/one-api.db -e NEW_API_BASE=http://127.0.0.1:3000 -e CATALOG=/app/catalog.json -e LISTEN_HOST=127.0.0.1 -e PORT=3010 keyo-gitee-passthrough",
  "sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh || true",
  "python3 - <<'PY'\nfrom pathlib import Path\np=Path('/etc/caddy/Caddyfile')\nif p.exists():\n  t=p.read_text(encoding='utf-8',errors='ignore')\n  if 'not path /v1/*' not in t and 'encode gzip' in t:\n    t=t.replace('encode gzip','@compress_pages not path /v1/*\\n\\tencode @compress_pages gzip',1)\n    p.write_text(t,encoding='utf-8')\n    print('caddy_patched')\n  else:\n    print('caddy_ok')\nelse:\n  print('caddy_missing')\nPY",
  "sudo systemctl reload caddy || true",
  "sudo docker exec ai-relay-gitee-passthrough which ffmpeg >/dev/null && echo ffmpeg_ok || echo ffmpeg_MISSING",
  "curl -sS -o /dev/null -w 'gitee_health=%{http_code}\\n' http://127.0.0.1:3010/healthz || true",
  "curl -sS https://www.keyoapi.xyz/brand/keyo-api-ref.md | tr -d '\\n' | grep -o 'cond_video' | head -1",
  "echo DONE_CODEX_GATEWAY_RELEASE",
].join(" && ");

const out = path.join(root, "scripts/vps-codex-gateway-release-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
