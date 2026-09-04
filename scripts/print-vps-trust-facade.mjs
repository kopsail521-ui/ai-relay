/**
 * Workbench 包：文档对齐 + 信任门面（brand 静态页 + proxy 跳转 + footer/FAQ）
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
      path.join(__dirname, `vps-trust-${name}-p${n}.txt`),
      `echo '${p}' | ${op} /tmp/vps-trust-${name}.b64 >/dev/null && echo OK_${name.toUpperCase()}_PART${n}`
    );
  });
  return { name, parts: parts.length, b64Chars: b64.length };
}

const packs = [
  pack("mod", path.join(root, "services/creem-moderation-proxy/server.mjs")),
  pack("home", path.join(root, "static/brand/keyo-home.html")),
  pack("docs", path.join(root, "static/brand/keyo-docs.html")),
  pack("status", path.join(root, "static/brand/status.html")),
  pack("faq", path.join(root, "static/brand/faq.html")),
  pack("integ", path.join(root, "static/brand/integrations.html")),
  pack("terms", path.join(root, "static/brand/terms.html")),
  pack("privacy", path.join(root, "static/brand/privacy.html")),
  pack("aup", path.join(root, "static/brand/aup.html")),
  pack("py", path.join(root, "scripts/vps-update-trust-facade.py")),
];

writeLf(
  path.join(__dirname, "vps-trust-deploy.txt"),
  `set -e
sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/static/brand /opt/ai-relay/scripts
# brand static (New API usually serves /brand from this path or a bind-mount — copy both common places)
for f in keyo-home.html keyo-docs.html status.html faq.html integrations.html terms.html privacy.html aup.html; do true; done
base64 -d /tmp/vps-trust-mod.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null
base64 -d /tmp/vps-trust-home.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-home.html >/dev/null
base64 -d /tmp/vps-trust-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null
base64 -d /tmp/vps-trust-status.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/status.html >/dev/null
base64 -d /tmp/vps-trust-faq.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/faq.html >/dev/null
base64 -d /tmp/vps-trust-integ.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/integrations.html >/dev/null
base64 -d /tmp/vps-trust-terms.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/terms.html >/dev/null
base64 -d /tmp/vps-trust-privacy.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/privacy.html >/dev/null
base64 -d /tmp/vps-trust-aup.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/aup.html >/dev/null
base64 -d /tmp/vps-trust-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-update-trust-facade.py >/dev/null
# also sync into new-api web public if present
if [ -d /opt/ai-relay/data/new-api ]; then
  sudo mkdir -p /opt/ai-relay/data/new-api/brand
  sudo cp -f /opt/ai-relay/static/brand/*.html /opt/ai-relay/data/new-api/brand/ 2>/dev/null || true
fi
if [ -d /opt/ai-relay/new-api/web/public/brand ]; then
  sudo cp -f /opt/ai-relay/static/brand/*.html /opt/ai-relay/new-api/web/public/brand/ 2>/dev/null || true
fi
# common docker volume path for calciumion/new-api custom brand
if sudo docker inspect ai-relay-new-api >/dev/null 2>&1; then
  sudo docker cp /opt/ai-relay/static/brand/. ai-relay-new-api:/app/web/dist/brand/ 2>/dev/null || true
  sudo docker cp /opt/ai-relay/static/brand/. ai-relay-new-api:/app/web/public/brand/ 2>/dev/null || true
fi
sudo python3 /opt/ai-relay/scripts/vps-update-trust-facade.py /opt/ai-relay/data/new-api/one-api.db
cd /opt/ai-relay
sudo docker build -t keyo-creem-moderation ./services/creem-moderation-proxy
sudo docker rm -f ai-relay-creem-moderation 2>/dev/null || true
sudo docker run -d --name ai-relay-creem-moderation --restart always --network host \\
  --env-file /opt/ai-relay/.env.moderation \\
  -e UPSTREAM_URL=http://127.0.0.1:3000 \\
  -e LISTEN_HOST=127.0.0.1 \\
  -e PORT=3001 \\
  keyo-creem-moderation
sudo docker restart ai-relay-new-api 2>/dev/null || true
sleep 3
echo "status=$(curl -sS -o /dev/null -w '%{http_code}' -L --max-redirs 0 http://127.0.0.1:3001/status || true)"
echo "faq=$(curl -sS -o /dev/null -w '%{http_code}' -L --max-redirs 0 http://127.0.0.1:3001/faq || true)"
echo "integ=$(curl -sS -o /dev/null -w '%{http_code}' -L --max-redirs 0 http://127.0.0.1:3001/integrations || true)"
curl -sS http://127.0.0.1:3001/ | grep -oE 'keyo-models-public|kopsail521@gmail.com' | sort -u || true
echo DONE_TRUST_FACADE`
);

const readmeLines = [
  "文档对齐 + 信任门面（Workbench）",
  "按包名依次粘贴分片，再粘贴 vps-trust-deploy.txt：",
  "",
];
for (const p of packs) {
  readmeLines.push(`- ${p.name}: vps-trust-${p.name}-p1.txt … p${p.parts}.txt`);
}
readmeLines.push(
  "",
  "最后: vps-trust-deploy.txt → 看到 DONE_TRUST_FACADE",
  "",
  "验证（无痕窗口）：",
  "- /pricing 可看价",
  "- /status /faq /integrations 不再 404",
  "- 文档图价为 USD；客服为 kopsail521@gmail.com",
  "",
  "注意：请确认 kopsail521@gmail.com 已能收信（域名邮箱或转发）。"
);
writeLf(path.join(__dirname, "vps-trust-readme.txt"), readmeLines.join("\n"));

console.log(JSON.stringify({ packs }, null, 2));
