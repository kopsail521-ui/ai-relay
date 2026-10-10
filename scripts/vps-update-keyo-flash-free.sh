#!/usr/bin/env bash
# 一键更新 keyo-flash:free 接力池（拉代码 → 重建镜像 → 重启容器 → 健康检查）
# 修复：上游连接挂起（接受 TCP 但迟迟不返回响应头）时无限等待的问题。
set -euo pipefail
cd /opt/ai-relay

echo "== 1/4 拉取最新代码 =="
sudo git pull --ff-only

echo "== 2/4 重新构建镜像 =="
sudo docker build -t keyo-unofree-pool ./services/unofree-pool

echo "== 3/4 重启容器 =="
sudo docker rm -f ai-relay-unofree-pool 2>/dev/null || true
sudo docker run -d --name ai-relay-unofree-pool --restart always --network host \
  --env-file /opt/ai-relay/.env -e PORT=3020 -e LISTEN_HOST=0.0.0.0 keyo-unofree-pool

echo "== 4/4 健康检查 =="
sleep 3
curl -sS http://127.0.0.1:3020/health
echo
echo DONE_UPDATE_KEYO_FLASH_FREE