#!/bin/bash
# Redeploy the moderation proxy from the checked-out source after a git pull.
# Reuses the exact container flags from vps-ocr-upload-fix.sh so runtime
# behavior (env, uploads volume, host network) stays identical.
#
#   sudo bash /opt/ai-relay/scripts/vps-redeploy-creem-moderation.sh
set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"

# Pull latest source first (keep Caddy reload off; static deploy owns that).
sudo RELOAD_CADDY="${RELOAD_CADDY:-0}" bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"

cd "$ROOT"
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

# Wait for the health endpoint before declaring success.
ok=0
for i in $(seq 1 15); do
  if curl -sfS -o /dev/null http://127.0.0.1:3001/healthz; then ok=1; break; fi
  sleep 2
done
if [[ "$ok" != 1 ]]; then
  echo "creem-moderation failed /healthz after deploy" >&2
  sudo docker logs --tail 50 ai-relay-creem-moderation >&2 || true
  exit 1
fi
echo DONE_REDEPLOY_CREEM_MODERATION
