#!/bin/bash
# 部署参考图生图（图生图）功能：重建透传 + 审核代理两个容器。
# 前置：先 git pull 拿到最新代码。
#   cd /opt/ai-relay && sudo git pull --ff-only origin main
#   sudo bash scripts/vps-deploy-i2i.sh
set -e
cd /opt/ai-relay

echo '--- 重建透传 (:3011) ---'
sudo docker build -q -t keyo-apimart-passthrough ./services/apimart-passthrough
sudo docker rm -f ai-relay-apimart-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-apimart-passthrough --restart always --network host \
  --env-file /opt/ai-relay/.env.apimart \
  -v /opt/ai-relay/data:/data:rw \
  -e NEW_API_DB=/data/new-api/one-api.db \
  keyo-apimart-passthrough

echo '--- 重建审核代理 (:3001) ---'
sudo docker build -q -t keyo-creem-moderation ./services/creem-moderation-proxy
sudo docker rm -f ai-relay-creem-moderation 2>/dev/null || true
sudo docker run -d --name ai-relay-creem-moderation --restart always --network host \
  --env-file /opt/ai-relay/.env.moderation \
  -e UPSTREAM_URL=http://127.0.0.1:3000 \
  -e LISTEN_HOST=127.0.0.1 \
  -e PORT=3001 \
  -e UPLOAD_DIR=/opt/ai-relay/static/uploads \
  -e UPLOAD_PUBLIC_BASE=https://www.keyoapi.xyz/uploads \
  -e UPLOAD_MAX_BYTES=104857600 \
  -e UPLOAD_TTL_HOURS=48 \
  -v /opt/ai-relay/static/uploads:/opt/ai-relay/static/uploads \
  keyo-creem-moderation

echo '--- 同步品牌文档 ---'
sudo cp static/brand/keyo-api-ref.md static/brand/keyo-api-ref.en.md static/brand/ 2>/dev/null || true

sleep 3
echo '--- 健康检查 ---'
curl -sS http://127.0.0.1:3011/healthz | head -c 200; echo
curl -sS -m 10 -o /dev/null -w 'moderation probe: expect 401 -> %{http_code}\n' \
  -X POST http://127.0.0.1:3001/v1/uploads -H 'Authorization: Bearer sk-invalid' -F 'file=@/etc/hosts' || true
echo '--- 目录里的图片模型（应看到 kind=image 8 个） ---'
sudo docker logs ai-relay-creem-moderation 2>&1 | grep IMAGE_GEN_MODELS | tail -2 || true
echo DONE_DEPLOY_I2I
