#!/bin/bash
# 部署 OCR 上传修复（bound body cap + sized disk check），并打印现场诊断。
# 前置：先 git pull 拿到最新的 services/creem-moderation-proxy/server.mjs。
#   cd /opt/ai-relay && sudo git pull --ff-only origin main
#   sudo bash scripts/vps-ocr-upload-fix.sh
set -e
cd /opt/ai-relay
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
sleep 2
echo '--- probe: expect 401 invalid_api_key ---'
curl -sS -o /tmp/up_probe.json -w "upload_probe=%{http_code}\n" -X POST http://127.0.0.1:3001/v1/uploads -H "Authorization: Bearer sk-invalid" -F "file=@/etc/hosts" || true
head -c 160 /tmp/up_probe.json; echo
echo '--- 磁盘（Unlimited-OCR 503 的现场答案） ---'
df -h / || true
echo '--- 内存（MinerU 提交超时的现场答案） ---'
free -m || true
echo '--- 上传目录 ---'
sudo du -sh /opt/ai-relay/static/uploads 2>/dev/null || true
sudo ls /opt/ai-relay/static/uploads 2>/dev/null | wc -l
echo '--- 代理日志里的写盘失败记录 ---'
sudo docker logs ai-relay-creem-moderation 2>&1 | grep -i "uploads" | tail -10 || true
echo '--- new-api 日志里的 OCR/任务记录 ---'
sudo docker logs --tail 400 ai-relay-new-api 2>&1 | grep -iE "mineru|unlimited-ocr|documents/parse|task" | tail -12 || true
echo DONE_OCR_UPLOAD_FIX
