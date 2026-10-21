#!/bin/bash
# Redeploy gitee-passthrough and update gift models (:free) on VPS
set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"
cd "$ROOT"

sudo RELOAD_CADDY=0 bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"

echo "=== 1/3 更新 New-API 数据库中的模型映射 (Atria-Dawn 及语音孪生) ==="
python3 "$ROOT/scripts/vps-free-rename-atria-prover.py" "$ROOT/data/new-api/one-api.db"
python3 "$ROOT/scripts/vps-add-gitee-speech-gift-twins.py" "$ROOT/data/new-api/one-api.db"
docker restart ai-relay-new-api

echo "=== 2/3 重建 gitee-passthrough 网关 (:3010) ==="
sudo docker build -t keyo-gitee-passthrough "$ROOT/services/gitee-passthrough"
sudo docker rm -f ai-relay-gitee-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-gitee-passthrough --restart always --network host \
  --env-file "$ROOT/.env.gitee" \
  -v "$ROOT/data/new-api:/data:rw" \
  -e NEW_API_DB=/data/one-api.db \
  -e NEW_API_BASE=http://127.0.0.1:3000 \
  -e CATALOG=/app/catalog.json \
  -e LISTEN_HOST=127.0.0.1 \
  -e PORT=3010 \
  keyo-gitee-passthrough

echo "=== 3/3 验证服务健康状态 ==="
ok=0
for i in $(seq 1 15); do
  if curl -sfS -o /dev/null http://127.0.0.1:3010/healthz; then ok=1; break; fi
  sleep 2
done
if [[ "$ok" != 1 ]]; then
  echo "gitee-passthrough failed /healthz after deploy" >&2
  sudo docker logs --tail 50 ai-relay-gitee-passthrough >&2 || true
  exit 1
fi

echo "gitee-passthrough healthz OK"
echo DONE_REDEPLOY_GITEE_PASSTHROUGH
