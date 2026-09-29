/**
 * Register subtitle-erase-pro / video-enhance-pro on Keyo Media Tools,
 * sync marketplace copy + docs, deploy volc-passthrough skeleton (:3012).
 *   node scripts/print-vps-add-volc-media-tools.mjs
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

const cfg = pack("config/volc-media-tools.json");
const py = pack("scripts/vps-add-volc-media-tools.py");
const docs = pack("static/brand/keyo-docs.html");
const refZh = pack("static/brand/keyo-api-ref.md");
const refEn = pack("static/brand/keyo-api-ref.en.md");
const copy = pack("config/marketplace-model-copy.json");
const srv = pack("services/volc-passthrough/server.mjs");
const docker = pack("services/volc-passthrough/Dockerfile");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/config /opt/ai-relay/scripts /opt/ai-relay/static/brand /opt/ai-relay/services/volc-passthrough /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${cfg}' | sudo tee /tmp/volc-cfg.b64 >/dev/null`,
  "base64 -d /tmp/volc-cfg.b64 | gunzip | sudo tee /opt/ai-relay/config/volc-media-tools.json >/dev/null",
  `echo '${py}' | sudo tee /tmp/volc-py.b64 >/dev/null`,
  "base64 -d /tmp/volc-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-volc-media-tools.py >/dev/null",
  `echo '${docs}' | sudo tee /tmp/keyo-docs.b64 >/dev/null`,
  "base64 -d /tmp/keyo-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${refZh}' | sudo tee /tmp/keyo-ref-zh.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref-zh.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null",
  `echo '${refEn}' | sudo tee /tmp/keyo-ref-en.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref-en.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null",
  `echo '${copy}' | sudo tee /tmp/mkt-copy.b64 >/dev/null`,
  "base64 -d /tmp/mkt-copy.b64 | gunzip | sudo tee /opt/ai-relay/config/marketplace-model-copy.json >/dev/null",
  "base64 -d /tmp/mkt-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  `echo '${srv}' | sudo tee /tmp/volc-srv.b64 >/dev/null`,
  "base64 -d /tmp/volc-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/volc-passthrough/server.mjs >/dev/null",
  `echo '${docker}' | sudo tee /tmp/volc-docker.b64 >/dev/null`,
  "base64 -d /tmp/volc-docker.b64 | gunzip | sudo tee /opt/ai-relay/services/volc-passthrough/Dockerfile >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-add-volc-media-tools.py /data/one-api.db",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-update-marketplace-copy.py /data/one-api.db /opt/ai-relay/config/marketplace-model-copy.json || echo COPY_SKIP",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json 2>/dev/null || true",
  "cd /opt/ai-relay/services/volc-passthrough && sudo docker build -t ai-relay-volc-passthrough:local .",
  "sudo docker rm -f ai-relay-volc-passthrough 2>/dev/null || true",
  "sudo docker run -d --name ai-relay-volc-passthrough --restart unless-stopped --network host --env-file /opt/ai-relay/.env -e PORT=3012 -e LISTEN_HOST=0.0.0.0 -e NEW_API_DB=/data/one-api.db -v /opt/ai-relay/data/new-api:/data:rw ai-relay-volc-passthrough:local",
  "sleep 2",
  "curl -sS -m 3 http://127.0.0.1:3012/healthz || echo WARN_VOLC_DOWN",
  "sudo docker restart ai-relay-new-api ai-relay-creem-moderation && sleep 5",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/docs.html https://www.keyoapi.xyz/brand/keyo-docs.html",
  `python3 - <<'PY'
import json,re
want={"subtitle-erase-pro","video-enhance-pro"}
d=json.load(open("/tmp/pricing.json"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
print("missing", sorted(want-set(by)) or "NONE")
for mid in sorted(want):
  m=by.get(mid)
  if not m:
    print(mid, "ABSENT"); continue
  print(mid, "ModelPrice", m.get("model_price"), "desc_ok", bool(m.get("description")))
docs=open("/tmp/docs.html",encoding="utf-8",errors="ignore").read()
print("docs_erase", 'data-copy="subtitle-erase-pro"' in docs)
print("docs_enhance", 'data-copy="video-enhance-pro"' in docs)
print("docs_i18n", "硬字幕擦除" in docs or "Hard-subtitle erase" in docs)
print("public_leak", bool(re.search(r'unorouter|openlux|apimart|grsai|volcengine|火山|上游|passthrough', json.dumps(d,ensure_ascii=False)+docs, re.I)))
print("DONE_ADD_VOLC_MEDIA_TOOLS")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-add-volc-media-tools-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-add-volc-media-tools-readme.txt"),
  `# 上架 Keyo Media Tools：subtitle-erase-pro / video-enhance-pro

售价（成本×2，FX 7.3）：
- subtitle-erase-pro：$0.018265/秒（对应精细化字幕擦除 4 元/分钟）
- video-enhance-pro：720p $0.034247 · 1080p $0.068493 · 2K $0.136986 /秒

渠道：Keyo Media Tools → http://127.0.0.1:3012
公开文案禁止写供应商名。

粘贴：scripts/vps-add-volc-media-tools-short.txt
→ missing NONE / docs_erase True / public_leak False
→ DONE_ADD_VOLC_MEDIA_TOOLS

注意：passthrough 骨架已起；真正提交上游需在 .env 配置 VOLC_ACCESS_KEY / VOLC_SECRET_KEY 并完成 MediaKit submit/poll 接线。上架前请确认转售/代售授权。
`
);

console.log({
  short: Buffer.byteLength(short),
  out: "scripts/vps-add-volc-media-tools-short.txt",
});
