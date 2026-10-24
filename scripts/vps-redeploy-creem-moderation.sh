#!/bin/bash
# Redeploy the moderation proxy from the checked-out source after a git pull.
# Preserve the existing runtime environment and mounts; the legacy defaults
# below are only used when an older container has no corresponding setting.
#
#   sudo bash /opt/ai-relay/scripts/vps-redeploy-creem-moderation.sh
set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"
NAME="${NAME:-ai-relay-creem-moderation}"
IMAGE="${IMAGE:-keyo-creem-moderation}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.moderation}"
UPLOAD_DIR_OVERRIDE="${UPLOAD_DIR:-}"
UPLOAD_DIR="${UPLOAD_DIR_OVERRIDE:-$ROOT/static/uploads}"
OLD="${NAME}-previous-$(date +%s)-$$"
BACKUP="${NAME}-rollback"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-15}"
[[ "$HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ && "$HEALTH_ATTEMPTS" -ge 2 && "$HEALTH_ATTEMPTS" -le 60 ]] || { echo "ABORT: invalid health attempt limit (requires at least two checks)" >&2; exit 1; }

# Pull latest source first (keep Caddy reload off; static deploy owns that).
sudo RELOAD_CADDY="${RELOAD_CADDY:-0}" bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"

cd "$ROOT"
sudo docker inspect "$NAME" >/dev/null
[[ -r "$ENV_FILE" ]] || { echo "ABORT: moderation env file is not readable" >&2; exit 1; }
RESTART=$(sudo docker inspect "$NAME" --format '{{.HostConfig.RestartPolicy.Name}}{{if .HostConfig.RestartPolicy.MaximumRetryCount}}:{{.HostConfig.RestartPolicy.MaximumRetryCount}}{{end}}')
WAS_RUNNING=$(sudo docker inspect "$NAME" --format '{{.State.Running}}')

# Do not replace a customized upload path, credentials, or limits with the
# deployment defaults. Capture values in memory without printing inspect data.
# Values explicitly present in the env file take precedence, so editing that
# file remains an effective way to update production configuration.
declare -A ENV_FILE_KEYS=() CURRENT_ENV_KEYS=()
file_upload_set=0
file_upload_dir=''
HEALTH_PORT=3001
file_port=''
while IFS= read -r entry || [[ -n "$entry" ]]; do
  entry="${entry%$'\r'}"
  entry="${entry#"${entry%%[![:space:]]*}"}"
  [[ -n "$entry" && "$entry" != \#* ]] || continue
  env_key="${entry%%=*}"
  ENV_FILE_KEYS["$env_key"]=1
  if [[ "$entry" == UPLOAD_DIR=* ]]; then
    file_upload_set=1
    file_upload_dir="${entry#UPLOAD_DIR=}"
  fi
  [[ "$entry" != PORT=* ]] || file_port="${entry#PORT=}"
done < "$ENV_FILE"
CURRENT_ENV=$(sudo docker inspect "$NAME" --format '{{range .Config.Env}}{{println .}}{{end}}')
ENV_ARGS=()
while IFS= read -r entry; do
  [[ "$entry" == *=* ]] || continue
  env_key="${entry%%=*}"
  CURRENT_ENV_KEYS["$env_key"]=1
  if [[ -z "${ENV_FILE_KEYS[$env_key]:-}" ]]; then
    ENV_ARGS+=(-e "$entry")
  fi
  if [[ -z "$UPLOAD_DIR_OVERRIDE" && "$entry" == UPLOAD_DIR=* ]]; then
    UPLOAD_DIR="${entry#UPLOAD_DIR=}"
  fi
  [[ "$entry" != PORT=* ]] || HEALTH_PORT="${entry#PORT=}"
done <<< "$CURRENT_ENV"
if [[ "$file_upload_set" == 1 && -z "$UPLOAD_DIR_OVERRIDE" ]]; then
  UPLOAD_DIR="$file_upload_dir"
fi
[[ -z "$file_port" ]] || HEALTH_PORT="$file_port"
[[ "$HEALTH_PORT" =~ ^[0-9]+$ && "$HEALTH_PORT" -ge 1 && "$HEALTH_PORT" -le 65535 ]] || { echo "ABORT: invalid moderation port" >&2; exit 1; }
[[ "$UPLOAD_DIR" == /* && "$UPLOAD_DIR" != / ]] || { echo "ABORT: uploads path must be an absolute directory" >&2; exit 1; }

# A 200 response alone can come from an unrelated or leftover container. The
# host-network proxy runs node directly as its container PID. Fail closed when
# ss cannot identify every owner; never stop another container to free the port.
command -v ss >/dev/null || { echo "ABORT: ss is required to verify listener ownership" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "ABORT: sha256sum is required to verify deployed source" >&2; exit 1; }
listener_owned_by() {
  local expected_pid="$1" listeners="$2" remaining line_found found=0
  [[ "$expected_pid" =~ ^[1-9][0-9]*$ ]] || return 1
  while IFS= read -r remaining; do
    [[ -n "$remaining" ]] || continue
    line_found=0
    while [[ "$remaining" =~ pid=([0-9]+) ]]; do
      [[ "${BASH_REMATCH[1]}" == "$expected_pid" ]] || return 1
      found=1
      line_found=1
      remaining="${remaining#*"${BASH_REMATCH[0]}"}"
    done
    [[ "$line_found" == 1 ]] || return 1
  done <<< "$listeners"
  [[ "$found" == 1 ]]
}
CURRENT_PID=$(sudo docker inspect "$NAME" --format '{{.State.Pid}}')
CURRENT_LISTENERS=$(sudo ss -H -lntp "( sport = :$HEALTH_PORT )") || { echo "ABORT: cannot inspect moderation listener" >&2; exit 1; }
if [[ -n "$CURRENT_LISTENERS" ]] && ! listener_owned_by "$CURRENT_PID" "$CURRENT_LISTENERS"; then
  echo "ABORT: moderation port is owned by another process; no containers were stopped" >&2
  exit 1
fi

# Capture the checkout version before building. Check the actual container files
# as well as process ownership, so a stale image or source bind cannot pass.
SOURCE_NAMES=(server.mjs public-model-metadata.mjs model-contracts.json model-icon-inject.js)
SOURCE_PATHS=()
EXPECTED_SOURCE=''
for source_name in "${SOURCE_NAMES[@]}"; do
  source_file="$ROOT/services/creem-moderation-proxy/$source_name"
  [[ -r "$source_file" ]] || { echo "ABORT: proxy source is not readable" >&2; exit 1; }
  source_sum=$(sha256sum "$source_file")
  SOURCE_PATHS+=("/app/$source_name")
  EXPECTED_SOURCE+="${source_sum%% *}  /app/$source_name"$'\n'
done
EXPECTED_SOURCE="${EXPECTED_SOURCE%$'\n'}"

add_default_env() {
  if [[ -z "${ENV_FILE_KEYS[$1]:-}" && -z "${CURRENT_ENV_KEYS[$1]:-}" ]]; then
    ENV_ARGS+=(-e "$1=$2")
  fi
}
add_default_env UPSTREAM_URL http://127.0.0.1:3000
add_default_env LISTEN_HOST 127.0.0.1
add_default_env PORT 3001
add_default_env UPLOAD_DIR "$UPLOAD_DIR"
add_default_env UPLOAD_PUBLIC_BASE https://www.keyoapi.xyz/uploads
add_default_env UPLOAD_MAX_BYTES 104857600
add_default_env UPLOAD_TTL_HOURS 48
[[ -z "$UPLOAD_DIR_OVERRIDE" ]] || ENV_ARGS+=(-e "UPLOAD_DIR=$UPLOAD_DIR_OVERRIDE")

# Binds retain their original options. Also retain mounts created with
# --mount/Compose, including named volumes, rather than changing them to binds.
CURRENT_BINDS=$(sudo docker inspect "$NAME" --format '{{range .HostConfig.Binds}}{{println .}}{{end}}')
CURRENT_MOUNTS=$(sudo docker inspect "$NAME" --format '{{range .Mounts}}{{printf "%s|%s|%s|%t|%s\n" .Type .Source .Destination .RW .Name}}{{end}}')
MOUNT_ARGS=()
BIND_TARGETS=()
while IFS= read -r binding; do
  [[ -n "$binding" ]] || continue
  MOUNT_ARGS+=(-v "$binding")
  binding_target="${binding#*:}"
  BIND_TARGETS+=("${binding_target%%:*}")
done <<< "$CURRENT_BINDS"
upload_mount_found=0
upload_mount_depth=0
upload_host_path=''
upload_mount_rw=true
while IFS='|' read -r mount_type mount_source mount_target mount_rw mount_name; do
  [[ -n "$mount_type" ]] || continue
  represented=0
  for binding_target in "${BIND_TARGETS[@]}"; do
    [[ "$binding_target" != "$mount_target" ]] || represented=1
  done
  if [[ "$represented" == 0 ]]; then
    case "$mount_type" in
      bind) mount_spec="$mount_source:$mount_target" ;;
      volume)
        [[ -n "$mount_name" ]] || { echo "ABORT: cannot identify existing volume" >&2; exit 1; }
        mount_spec="$mount_name:$mount_target"
        ;;
      *) echo "ABORT: unsupported existing mount type" >&2; exit 1 ;;
    esac
    [[ "$mount_rw" != false ]] || mount_spec+=:ro
    MOUNT_ARGS+=(-v "$mount_spec")
  fi
  if [[ "$UPLOAD_DIR" == "$mount_target" || "$UPLOAD_DIR" == "${mount_target%/}/"* ]] && \
      [[ "${#mount_target}" -ge "$upload_mount_depth" ]]; then
    upload_mount_found=1
    upload_mount_depth="${#mount_target}"
    upload_mount_rw="$mount_rw"
    upload_host_path=''
    if [[ "$mount_type" == bind ]]; then
      upload_suffix="${UPLOAD_DIR#"${mount_target%/}"}"
      upload_host_path="${mount_source%/}$upload_suffix"
    fi
  fi
done <<< "$CURRENT_MOUNTS"
if [[ "$upload_mount_found" == 0 ]]; then
  upload_host_path="$UPLOAD_DIR"
  MOUNT_ARGS+=(-v "$UPLOAD_DIR:$UPLOAD_DIR")
fi
# Legacy docker -v created a missing host directory automatically. Initialize
# the same directory before stopping the service, without changing existing
# contents/permissions or creating a replacement for a named volume.
if [[ -n "$upload_host_path" && ! -d "$upload_host_path" ]]; then
  [[ "$upload_mount_rw" != false ]] || { echo "ABORT: existing read-only upload directory is missing" >&2; exit 1; }
  sudo mkdir -p -- "$upload_host_path"
fi

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
  "${ENV_ARGS[@]}" \
  "${MOUNT_ARGS[@]}" \
  "$IMAGE"

# Docker reports Running=true even while a restart-loop container has Pid=0.
# Require a live, non-restarting process that owns the listener and contains the
# checked-out source. Two successful rounds with the same PID reject brief starts.
proxy_ready() {
  local state running restarting pid listeners actual_source
  state=$(sudo docker inspect "$NAME" --format '{{.State.Running}} {{.State.Restarting}} {{.State.Pid}}') || return 1
  read -r running restarting pid <<< "$state"
  [[ "$running" == true && "$restarting" == false && "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  listeners=$(sudo ss -H -lntp "( sport = :$HEALTH_PORT )") || return 1
  listener_owned_by "$pid" "$listeners" || return 1
  curl -sfS --max-time 3 -o /dev/null "http://127.0.0.1:$HEALTH_PORT/healthz" || return 1
  actual_source=$(sudo docker exec "$NAME" sha256sum "${SOURCE_PATHS[@]}") || return 1
  [[ "$actual_source" == "$EXPECTED_SOURCE" ]] || return 1
  READY_PID="$pid"
}
ok=0
stable=0
last_pid=''
for i in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if proxy_ready; then
    if [[ "$READY_PID" == "$last_pid" ]]; then stable=$((stable + 1)); else stable=1; fi
    last_pid="$READY_PID"
    if [[ "$stable" -ge 2 ]]; then ok=1; break; fi
  else
    stable=0
    last_pid=''
  fi
  sleep 2
done
if [[ "$ok" != 1 ]]; then
  echo "creem-moderation failed stable process/source/health verification after deploy" >&2
  # Do not print arbitrary container logs: they can contain request data.
  rollback
fi
echo "VERIFIED_PROXY_PID=$last_pid SOURCE_FILES=${#SOURCE_PATHS[@]} STABLE_CHECKS=$stable"
trap - ERR INT TERM
# Only discard the older rollback slot after the replacement is healthy.
# If cleanup fails, leave the unique previous name available for recovery.
if { ! sudo docker inspect "$BACKUP" >/dev/null 2>&1 || \
    { [[ "$(sudo docker inspect "$BACKUP" --format '{{.State.Running}}')" == false ]] && sudo docker rm "$BACKUP" >/dev/null; }; } && \
  sudo docker rename "$OLD" "$BACKUP"; then
  echo "ROLLBACK_CONTAINER=$BACKUP RESTART_POLICY=${RESTART:-always}"
else
  echo "WARN: rollback container retained as $OLD RESTART_POLICY=${RESTART:-always}" >&2
fi
echo DONE_REDEPLOY_CREEM_MODERATION
