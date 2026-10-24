#!/bin/bash
# Redeploy the moderation proxy from the checked-out source after a git pull.
# Reuses the exact container flags from vps-ocr-upload-fix.sh so runtime
# behavior (env, uploads volume, host network) stays identical.
#
#   sudo bash /opt/ai-relay/scripts/vps-redeploy-creem-moderation.sh
set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"
NAME="${NAME:-ai-relay-creem-moderation}"
IMAGE="${IMAGE:-keyo-creem-moderation}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.moderation}"
UPLOAD_DIR="${UPLOAD_DIR:-$ROOT/static/uploads}"
OLD="${NAME}-previous-$(date +%s)-$$"
BACKUP="${NAME}-rollback"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-15}"
[[ "$HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ && "$HEALTH_ATTEMPTS" -le 60 ]] || { echo "ABORT: invalid health attempt limit" >&2; exit 1; }

# Pull latest source first (keep Caddy reload off; static deploy owns that).
sudo RELOAD_CADDY="${RELOAD_CADDY:-0}" bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"

cd "$ROOT"
sudo docker inspect "$NAME" >/dev/null
[[ -r "$ENV_FILE" ]] || { echo "ABORT: moderation env file is not readable" >&2; exit 1; }
[[ -d "$UPLOAD_DIR" ]] || { echo "ABORT: uploads directory is missing" >&2; exit 1; }
RESTART=$(sudo docker inspect "$NAME" --format '{{.HostConfig.RestartPolicy.Name}}{{if .HostConfig.RestartPolicy.MaximumRetryCount}}:{{.HostConfig.RestartPolicy.MaximumRetryCount}}{{end}}')
WAS_RUNNING=$(sudo docker inspect "$NAME" --format '{{.State.Running}}')

# Complete the build before interrupting the existing service. Keep its
# container (and therefore its original image/config) until the new one passes.
sudo docker build -q -t "$IMAGE" ./services/creem-moderation-proxy
swap_started=0
rollback() {
  trap - ERR INT TERM
  if [[ "$swap_started" == 1 ]]; then
    echo "moderation deploy failed; restoring previous container" >&2
    if sudo docker inspect "$OLD" >/dev/null 2>&1; then
      sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
      sudo docker rename "$OLD" "$NAME" || { echo "ROLLBACK_FAILED: previous container remains at $OLD" >&2; exit 1; }
    fi
    sudo docker update --restart="${RESTART:-always}" "$NAME" >/dev/null || true
    if [[ "$WAS_RUNNING" == true ]]; then
      sudo docker start "$NAME" >/dev/null || { echo "ROLLBACK_FAILED: previous container could not start" >&2; exit 1; }
    fi
    echo "DONE_ROLLBACK_CREEM_MODERATION" >&2
  fi
  exit 1
}
trap rollback ERR INT TERM
swap_started=1
sudo docker update --restart=no "$NAME" >/dev/null
sudo docker stop "$NAME" >/dev/null
sudo docker rename "$NAME" "$OLD"
sudo docker run -d --name "$NAME" --restart "${RESTART:-always}" --network host \
  --env-file "$ENV_FILE" \
  -e UPSTREAM_URL=http://127.0.0.1:3000 \
  -e LISTEN_HOST=127.0.0.1 \
  -e PORT=3001 \
  -e "UPLOAD_DIR=$UPLOAD_DIR" \
  -e UPLOAD_PUBLIC_BASE=https://www.keyoapi.xyz/uploads \
  -e UPLOAD_MAX_BYTES=104857600 \
  -e UPLOAD_TTL_HOURS=48 \
  -v "$UPLOAD_DIR:$UPLOAD_DIR" \
  "$IMAGE"

# Wait for the health endpoint before declaring success.
ok=0
for i in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if [[ "$(sudo docker inspect "$NAME" --format '{{.State.Running}}')" == true ]] && \
    curl -sfS --max-time 3 -o /dev/null http://127.0.0.1:3001/healthz; then ok=1; break; fi
  sleep 2
done
if [[ "$ok" != 1 ]]; then
  echo "creem-moderation failed /healthz after deploy" >&2
  # Do not print arbitrary container logs: they can contain request data.
  rollback
fi
trap - ERR INT TERM
# Only discard the older rollback slot after the replacement is healthy.
# If cleanup fails, leave the unique previous name available for recovery.
if { ! sudo docker inspect "$BACKUP" >/dev/null 2>&1 || sudo docker rm -f "$BACKUP" >/dev/null; } && \
  sudo docker rename "$OLD" "$BACKUP"; then
  echo "ROLLBACK_CONTAINER=$BACKUP RESTART_POLICY=${RESTART:-always}"
else
  echo "WARN: rollback container retained as $OLD RESTART_POLICY=${RESTART:-always}" >&2
fi
echo DONE_REDEPLOY_CREEM_MODERATION
