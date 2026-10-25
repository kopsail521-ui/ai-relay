#!/bin/bash
# Runs ON THE VPS, streamed via:  ssh ... 'sudo bash -s' < this-file
# (see .github/workflows/keyo-gift-speech-smoke.yml — the workflow checks out
# the repo and pipes this script, so no nested-quote escaping is ever needed.)
#
# Pipeline: safe-pull -> rebuild gitee passthrough -> verify /healthz build
# marker (kill a stale ghost process on :3010 if mismatched) -> CPU cooldown
# -> real-call smoke for the speech gift-credit twins -> public status file.

set -e
cd /opt/ai-relay

STATUS_FILE=/opt/ai-relay/static/brand/smoke-status-e0cf117e.txt
write_status() {
  mkdir -p /opt/ai-relay/static/brand
  cat > "$STATUS_FILE"
  chmod 644 "$STATUS_FILE"
}

if ! bash scripts/vps-safe-pull-preserve-blog.sh >/tmp/safe-pull.log 2>&1; then
  {
    echo "smoke_exit=97"
    echo "smoke_time=$(date -u +%FT%TZ)"
    echo "SAFE_PULL_FAILED"
    tail -20 /tmp/safe-pull.log
  } | write_status
  exit 1
fi

# Rebuild the gitee passthrough image so the container picks up the
# server.mjs committed in this push (gift-credit twins support: model
# normalization + gift-first billing).
EXPECTED_BUILD=gift-twins-2026-10-24b
if ! bash scripts/vps-passthrough-rebuild.txt >/tmp/passthrough-rebuild.log 2>&1; then
  cat /tmp/passthrough-rebuild.log
  {
    echo "smoke_exit=96"
    echo "smoke_time=$(date -u +%FT%TZ)"
    echo "PASSTHROUGH_REBUILD_FAILED"
    tail -20 /tmp/passthrough-rebuild.log
  } | write_status
  exit 1
fi
tail -5 /tmp/passthrough-rebuild.log

# A stale non-docker process can still own :3010 (ghost from old runbooks);
# the new container then crash-loops on EADDRINUSE while the ghost serves
# requests with old code. Verify the /healthz build marker and recover.
HZ=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  HZ=$(curl -sS --max-time 3 http://127.0.0.1:3010/healthz 2>/dev/null || true)
  case "$HZ" in *"$EXPECTED_BUILD"*) break ;; esac
  sleep 3
  HZ=""
done

if [ -z "$HZ" ]; then
  echo "PASSTHROUGH_BUILD_MISMATCH — healthz now: $(curl -sS --max-time 3 http://127.0.0.1:3010/healthz 2>/dev/null || true)"
  echo "PORT 3010 OWNERS:"
  ss -ltnp | grep ":3010" || true
  PIDS=$(ss -ltnp | grep ":3010" | grep -o "pid=[0-9]*" | cut -d= -f2 | sort -u)
  if [ -n "$PIDS" ]; then
    echo "KILLING STALE PID(S) ON 3010: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
    sleep 2
    docker restart ai-relay-gitee-passthrough >/dev/null 2>&1 || true
  fi
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    HZ=$(curl -sS --max-time 3 http://127.0.0.1:3010/healthz 2>/dev/null || true)
    case "$HZ" in *"$EXPECTED_BUILD"*) break ;; esac
    sleep 3
    HZ=""
  done
fi

if [ -z "$HZ" ]; then
  {
    echo "smoke_exit=98"
    echo "smoke_time=$(date -u +%FT%TZ)"
    echo "PASSTHROUGH_BUILD_MISMATCH after ghost cleanup"
    docker ps -a --filter name=ai-relay-gitee-passthrough --format "{{.Status}}" 2>/dev/null || true
    docker logs --tail 20 ai-relay-gitee-passthrough 2>&1 | tail -20 || true
    ss -ltnp | grep ":3010" || true
  } | write_status
  echo "PASSTHROUGH_STALE_BUILD"
  exit 1
fi
echo "PASSTHROUGH_BUILD_OK: $HZ"

# CPU cooldown: docker build spikes this small VPS above new-api's 90%
# overload guard, which 503-rejects the smoke calls until it settles.
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  IDLE=$(vmstat 1 2 | tail -1 | tr -s " " | sed -e "s/^ //" | cut -d" " -f15)
  if [ -n "$IDLE" ] && [ "$IDLE" -ge 15 ] 2>/dev/null; then break; fi
  sleep 5
done

set +e
OUT=$(python3 /opt/ai-relay/scripts/vps-smoke-gift-speech.py /opt/ai-relay/data/new-api/one-api.db 2>&1)
CODE=$?
echo "$OUT"
{
  echo "smoke_exit=$CODE"
  echo "smoke_time=$(date -u +%FT%TZ)"
  echo "$OUT"
} | write_status
exit $CODE
