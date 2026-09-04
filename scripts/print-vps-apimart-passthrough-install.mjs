/**
 * 生成 APIMart 透传安装粘贴包（Workbench）
 * 用法：node scripts/print-vps-apimart-passthrough-install.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function b64gz(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return zlib.gzipSync(buf).toString("base64");
}

const serverB64 = b64gz("services/apimart-passthrough/server.mjs");
const catalogB64 = b64gz("services/apimart-passthrough/catalog.json");
const dockerB64 = b64gz("services/apimart-passthrough/Dockerfile");
const pyB64 = b64gz("scripts/vps-add-apimart-videos.py");
const cfgB64 = b64gz("config/apimart-selected-models.json");

// Key is injected on server via .env.apimart — do NOT embed in this script output permanently.
// User pastes key once into /opt/ai-relay/.env.apimart

const cmd = `set -e
sudo mkdir -p /opt/ai-relay/services/apimart-passthrough /opt/ai-relay/scripts /opt/ai-relay/config /opt/ai-relay/data
cd /opt/ai-relay

# --- 写入文件 ---
echo '${serverB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/server.mjs >/dev/null
echo '${catalogB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/catalog.json >/dev/null
echo '${dockerB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/Dockerfile >/dev/null
echo '${pyB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-apimart-videos.py >/dev/null
echo '${cfgB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/config/apimart-selected-models.json >/dev/null

# --- API Key（若已存在则跳过）---
if [ ! -f /opt/ai-relay/.env.apimart ]; then
  sudo tee /opt/ai-relay/.env.apimart >/dev/null <<'EOF'
APIMART_BASE_URL=https://api.apimart.ai
APIMART_API_KEY=REPLACE_ME
NEW_API_BASE=http://127.0.0.1:3000
NEW_API_DB=/opt/ai-relay/data/new-api/one-api.db
MARKUP=1.2
PORT=3011
LISTEN_HOST=127.0.0.1
EOF
  echo "EDIT /opt/ai-relay/.env.apimart and set APIMART_API_KEY then re-run docker"
fi

# --- Docker ---
sudo docker build -t keyo-apimart-passthrough ./services/apimart-passthrough
sudo docker rm -f ai-relay-apimart-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-apimart-passthrough --restart always --network host \\
  --env-file /opt/ai-relay/.env.apimart \\
  -v /opt/ai-relay/data:/data \\
  -e NEW_API_DB=/opt/ai-relay/data/new-api/one-api.db \\
  -e CATALOG=/app/catalog.json \\
  keyo-apimart-passthrough

# --- 注册模型广场 ---
DB=/opt/ai-relay/data/new-api/one-api.db
if [ -f "\$DB" ]; then
  sudo python3 /opt/ai-relay/scripts/vps-add-apimart-videos.py "\$DB"
else
  echo "WARN: DB not found at \$DB — run python script with correct path"
fi

# --- Caddy：APIMart 路径走 3011（保留原有 Gitee 3010）---
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.apimart.\$(date +%s) || true
# 若尚未包含 apimart matcher，则插入（人工核对更稳妥）
if ! grep -q 'videos/generations' /etc/caddy/Caddyfile; then
  echo "请手动在 Caddyfile 的 @gitee_special 旁加入："
  echo '  @apimart_video path /v1/videos/generations* /v1/tasks*'
  echo '  handle @apimart_video { reverse_proxy 127.0.0.1:3011 }'
fi

curl -sS http://127.0.0.1:3011/healthz || true
echo
sudo docker logs --tail 40 ai-relay-apimart-passthrough
echo DONE_APIMART_PASSTHROUGH
`;

const out = path.join(root, "scripts/vps-apimart-passthrough-install.txt");
fs.writeFileSync(out, cmd);
console.log("Wrote", out, "(" + cmd.length + " chars)");
