# Seedance 4大系列合并 + 480p aicopy 官方稳定版一键发版脚本
# 适用：VPS /opt/ai-relay
set -e
cd /opt/ai-relay

sudo git pull --ff-only origin main

# 1. 确保环境变量
sudo touch /opt/ai-relay/.env.apimart
if ! sudo grep -q '^AIONE_API_KEY=.' /opt/ai-relay/.env.apimart 2>/dev/null; then
  if sudo grep -q '^AIONE_API_KEY=.' /opt/ai-relay/.env 2>/dev/null; then
    sudo grep -E '^AIONE_(API_KEY|BASE_URL)=' /opt/ai-relay/.env | sudo tee -a /opt/ai-relay/.env.apimart >/dev/null
  fi
fi
if ! sudo grep -q '^AIONE_BASE_URL=' /opt/ai-relay/.env.apimart 2>/dev/null; then
  echo 'AIONE_BASE_URL=https://api.aione.help' | sudo tee -a /opt/ai-relay/.env.apimart >/dev/null
fi
if ! sudo grep -q '^AICOPY_API_KEY=.' /opt/ai-relay/.env.apimart 2>/dev/null; then
  if sudo grep -q '^AICOPY_API_KEY=.' /opt/ai-relay/.env 2>/dev/null; then
    sudo grep -E '^AICOPY_(API_KEY|BASE_URL)=' /opt/ai-relay/.env | sudo tee -a /opt/ai-relay/.env.apimart >/dev/null
  fi
fi
if ! sudo grep -q '^AICOPY_BASE_URL=' /opt/ai-relay/.env.apimart 2>/dev/null; then
  echo 'AICOPY_BASE_URL=https://api.aicopy.top' | sudo tee -a /opt/ai-relay/.env.apimart >/dev/null
fi

# 2. 重建 apimart-passthrough 网关 (:3011)
echo "=== 1/4 重建 apimart-passthrough 视频网关 (:3011) ==="
sudo docker build -t keyo-apimart-passthrough ./services/apimart-passthrough
sudo docker rm -f ai-relay-apimart-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-apimart-passthrough --restart always --network host \
  --env-file /opt/ai-relay/.env.apimart \
  -v /opt/ai-relay/data:/data:rw \
  -v /opt/ai-relay/services/apimart-passthrough/catalog.json:/app/catalog.json:ro \
  -e NEW_API_DB=/data/new-api/one-api.db \
  -e NEW_API_BASE=http://127.0.0.1:3000 \
  -e CATALOG=/app/catalog.json \
  -e LISTEN_HOST=127.0.0.1 \
  -e PORT=3011 \
  keyo-apimart-passthrough

# 3. 重建 creem-moderation-proxy 代理 (:3001)
echo "=== 2/4 重建 creem-moderation-proxy 代理 (:3001) ==="
sudo docker build -t keyo-creem-moderation ./services/creem-moderation-proxy
sudo docker rm -f ai-relay-creem-moderation 2>/dev/null || true
sudo docker run -d --name ai-relay-creem-moderation --restart always --network host \
  --env-file /opt/ai-relay/.env.moderation \
  -e UPSTREAM_URL=http://127.0.0.1:3000 \
  -e LISTEN_HOST=127.0.0.1 \
  -e PORT=3001 \
  -e RANKINGS_DISPLAY_MULTIPLIER=10 \
  -e VIDEO_GEN_URL=http://127.0.0.1:3011 \
  -e VIDEO_CATALOG=/app/video-catalog.json \
  -e UPLOAD_DIR=/opt/ai-relay/static/uploads \
  -e UPLOAD_PUBLIC_BASE=https://www.keyoapi.xyz/uploads \
  -e UPLOAD_MAX_BYTES=104857600 \
  -e UPLOAD_TTL_HOURS=48 \
  -v /opt/ai-relay/services/apimart-passthrough/catalog.json:/app/video-catalog.json:ro \
  -v /opt/ai-relay/static/uploads:/opt/ai-relay/static/uploads \
  keyo-creem-moderation

# 4. 同步数据库与元数据
echo "=== 3/4 注册新模型到 New-API 数据库 ==="
sudo python3 /opt/ai-relay/scripts/vps-add-apimart-videos.py /opt/ai-relay/data/new-api/one-api.db
sudo docker restart ai-relay-new-api >/dev/null || true
sleep 3

# 5. 健康检查
echo "=== 4/4 验证服务健康状态 ==="
curl -sS http://127.0.0.1:3011/healthz; echo
python3 - <<'PY'
import urllib.request, json
try:
    with urllib.request.urlopen("https://www.keyoapi.xyz/api/pricing", timeout=10) as resp:
        data = json.loads(resp.read().decode())
        models = [m.get("model_name") for m in data.get("data", [])]
        for needed in ["seedance-2.5", "seedance-2.0", "seedance-2.0-fast", "seedance-2.0-mini"]:
            print(f"Pricing check {needed}: {'OK' if needed in models else 'MISSING'}")
except Exception as e:
    print("Pricing check failed:", e)
PY

echo "=== Seedance 4大系列合并与发版完成 ==="
