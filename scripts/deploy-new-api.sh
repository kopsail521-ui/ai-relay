#!/bin/bash
# 在阿里云新加坡 Ubuntu 上一键安装 Docker + New API
# 用法：以 root 登录后执行：
#   bash <(curl -fsSL ...)  或  bash deploy-new-api.sh

set -euo pipefail

echo "==> 更新系统"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw

echo "==> 安装 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> 防火墙放行 22/80/443/3000"
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw allow 3000/tcp || true
ufw --force enable || true

echo "==> 创建目录"
mkdir -p /opt/ai-relay/data/new-api /opt/ai-relay/data/logs
cd /opt/ai-relay

# 随机密钥
SESSION_SECRET=$(openssl rand -hex 32)
CRYPTO_SECRET=$(openssl rand -hex 32)

cat > /opt/ai-relay/docker-compose.yml <<EOF
services:
  new-api:
    image: calciumion/new-api:latest
    container_name: ai-relay-new-api
    restart: always
    command: --log-dir /app/logs
    ports:
      - "3000:3000"
    volumes:
      - ./data/new-api:/data
      - ./data/logs:/app/logs
    environment:
      - TZ=Asia/Shanghai
      - ERROR_LOG_ENABLED=true
      - BATCH_UPDATE_ENABLED=true
      - SESSION_SECRET=${SESSION_SECRET}
      - CRYPTO_SECRET=${CRYPTO_SECRET}
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://localhost:3000/api/status | grep -o '\\\"success\\\":\\\\s*true' || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF

echo "==> 拉取并启动 New API"
docker compose pull
docker compose up -d

echo ""
echo "========================================"
echo " 安装完成"
echo " 浏览器打开: http://$(curl -s ifconfig.me || echo 你的公网IP):3000"
echo " 首次打开请创建管理员账号密码"
echo "========================================"
docker compose ps
