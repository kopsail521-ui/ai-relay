#!/usr/bin/env bash
# From the reviewed checkout on the VPS: bash scripts/vps-add-cloudflare-clef.sh
# Does not fetch main: deploys the exact local decisions/server changes reviewed together.
set -euo pipefail
set +x
umask 077
ROOT=${CLEF_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}
PY="$ROOT/scripts/add-cloudflare-clef.py"
SERVICE="$ROOT/services/gitee-passthrough"
CONTAINER=${CLEF_CONTAINER:-ai-relay-gitee-passthrough}
NEW_API_CONTAINER=${CLEF_NEW_API_CONTAINER:-ai-relay-new-api}
CADDYFILE=${CLEF_CADDYFILE:-/etc/caddy/Caddyfile}
PROBE_BASE=${CLEF_PROBE_BASE:-https://www.keyoapi.xyz}
DB=${NEW_API_DB_HOST:-$ROOT/data/new-api/one-api.db}
STAMP=$(date +%Y%m%d%H%M%S)-$$
BACKUP="$ROOT/data/clef-deploy-$STAMP"
OLD="$CONTAINER-clef-backup-$STAMP"
IMAGE="keyo-gitee-passthrough:clef-$STAMP"
WORK=$(mktemp -d)
RENAMED=0
CADDY_CHANGED=0
REGISTERED=0
SUCCESS=0

cleanup() {
  result=$?
  trap - EXIT
  if [[ "$SUCCESS" != 1 && "$REGISTERED" != 1 ]]; then
    if [[ "$RENAMED" == 1 ]]; then
      docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
      docker rename "$OLD" "$CONTAINER" >/dev/null 2>&1 || true
      docker start "$CONTAINER" >/dev/null 2>&1 || true
    fi
    if [[ "$CADDY_CHANGED" == 1 ]]; then
      cp -p "$BACKUP/Caddyfile" "$CADDYFILE"
      caddy validate --config "$CADDYFILE" >/dev/null 2>&1 && systemctl reload caddy || true
    fi
    printf 'CLEF_NOT_ACTIVATED: deployment/probe failed; prior container and Caddy restored where changed. Backup: %s\n' "$BACKUP" >&2
  elif [[ "$SUCCESS" != 1 ]]; then
    printf 'CLEF_PUBLIC_CHECK_FAILED: real billing passed and registration was written; inspect public pricing/cache. Backup: %s\n' "$BACKUP" >&2
  fi
  rm -rf -- "$WORK"
  exit "$result"
}
trap cleanup EXIT

for executable in python3 docker curl caddy systemctl; do
  command -v "$executable" >/dev/null || { printf 'Required executable missing: %s\n' "$executable" >&2; exit 1; }
done
[[ -f "$PY" && -f "$DB" && -f "$CADDYFILE" ]] || { printf 'Missing registration script, local billing DB or installed Caddyfile.\n' >&2; exit 1; }
[[ -f "$SERVICE/decisions.mjs" ]] || { printf 'Deploy the reviewed decisions.mjs/server hook in this checkout first.\n' >&2; exit 1; }
# Fail before rebuilding if matching reviewed frontend metadata is missing.
python3 - "$ROOT/config/marketplace-model-copy.json" "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json" <<'PY'
import json, sys
left, right = [json.load(open(path, encoding='utf-8')) for path in sys.argv[1:]]
if left != right or 'cloudflare/clef' not in left:
    raise SystemExit('Matching reviewed Clef marketplace copies are required before deployment')
PY
docker inspect ai-relay-creem-moderation >/dev/null
# Prevent accidental deployment of a server that still returns 404 for decisions.
python3 - "$SERVICE/server.mjs" <<'PY'
from pathlib import Path
import sys
text = Path(sys.argv[1]).read_text()
if 'decisions.mjs' not in text or 'createDecisionsHandler' not in text:
    raise SystemExit('server.mjs does not install createDecisionsHandler; activation blocked')
PY
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
docker inspect "$CONTAINER" > "$BACKUP/container-inspect.json"
docker inspect "$NEW_API_CONTAINER" >/dev/null
cp -p "$CADDYFILE" "$BACKUP/Caddyfile"
cp -a "$SERVICE" "$BACKUP/service-source"
# SQLite backup API handles WAL safely. Snapshot is for diagnosis/manual recovery only;
# never overwrite a live DB on rollback, as that would discard concurrent customer billing.
python3 - "$DB" "$BACKUP/one-api.db" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1], timeout=30) as source, sqlite3.connect(sys.argv[2]) as target:
    source.backup(target)
PY
chmod 600 "$BACKUP/container-inspect.json" "$BACKUP/one-api.db"
python3 "$PY" --env-file "$ROOT/.env" --db "$DB" --prepare-key "$WORK/upstream-key"

# Stage the build without editing the checked-out Dockerfile. Older Dockerfiles
# enumerate COPY sources and therefore need an explicit decisions.mjs layer.
mkdir "$WORK/service"
cp -a "$SERVICE/." "$WORK/service/"
python3 - "$WORK/service/Dockerfile" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
# Appending is harmless if the reviewed Dockerfile already includes this file.
path.write_text(text.rstrip() + '\nCOPY decisions.mjs /app/decisions.mjs\n')
PY
docker build -q -t "$IMAGE" "$WORK/service" > "$WORK/build.log" 2>&1 || {
  printf 'Passthrough build failed; inspect the protected build log in %s.\n' "$BACKUP" >&2
  cp "$WORK/build.log" "$BACKUP/build.log"
  exit 1
}
docker run --rm --entrypoint node "$IMAGE" --check /app/server.mjs >/dev/null
docker run --rm --entrypoint node "$IMAGE" --check /app/decisions.mjs >/dev/null

# Preserve the original container for immediate rollback. Inspect contains secrets,
# stays mode 600, and is consumed by the Python helper without printing its argv.
docker stop "$CONTAINER" >/dev/null
docker rename "$CONTAINER" "$OLD" >/dev/null
RENAMED=1
python3 "$PY" --env-file "$ROOT/.env" --clone-container "$BACKUP/container-inspect.json" "$IMAGE" "$CONTAINER" "$WORK/upstream-key"
docker start "$CONTAINER" >/dev/null
healthy=0
for attempt in $(seq 1 20); do
  if curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:3010/healthz >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]] || { printf 'New passthrough failed health check.\n' >&2; exit 1; }

# Surgical matcher addition preserves all installed VPS routes and site settings.
CADDY_CHANGED=1
python3 "$PY" --patch-caddy "$CADDYFILE"
caddy validate --config "$CADDYFILE" > "$WORK/caddy-validate.log" 2>&1 || {
  cp "$WORK/caddy-validate.log" "$BACKUP/caddy-validate.log"
  printf 'Caddy validation failed; saved protected log and restoring prior config.\n' >&2
  exit 1
}
systemctl reload caddy

# Prefer admin token API (updates caches); fall back to local DB only if no token
# was configured. An invalid configured token fails instead of silently switching.
BACKEND=$(python3 - "$PY" "$ROOT/.env" <<'PY'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('clef', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.load_env(sys.argv[2])
print('admin' if os.environ.get('NEW_API_ADMIN_TOKEN') else 'db')
PY
)
python3 "$PY" --env-file "$ROOT/.env" --db "$DB" --backend "$BACKEND" --probe-base "$PROBE_BASE"
REGISTERED=1
if [[ "$BACKEND" == db ]]; then
  # DB writes bypass new-api's in-memory option/channel/ability caches.
  docker restart "$NEW_API_CONTAINER" >/dev/null
fi
public_ok=0
for attempt in $(seq 1 15); do
  if python3 "$PY" --env-file "$ROOT/.env" --probe-base "$PROBE_BASE" --check-public > "$WORK/public-check.log" 2>&1; then
    public_ok=1
    break
  fi
  sleep 2
done
[[ "$public_ok" == 1 ]] || {
  cp "$WORK/public-check.log" "$BACKUP/public-check.log"
  printf 'Public pricing verification failed; see %s/public-check.log.\n' "$BACKUP" >&2
  exit 1
}
# Deploy the matching reviewed marketplace copy and pricing injection into the
# existing moderation container. Backup current assets before replacing them.
PROXY="$ROOT/services/creem-moderation-proxy"
if [[ -f "$PROXY/marketplace-model-copy.json" ]]; then
  python3 - "$ROOT/config/marketplace-model-copy.json" "$PROXY/marketplace-model-copy.json" <<'PY'
import json, sys
left, right = [json.load(open(path, encoding='utf-8')) for path in sys.argv[1:]]
if left != right or 'cloudflare/clef' not in left:
    raise SystemExit('Marketplace copies differ or lack Clef; deploy matching reviewed metadata first')
PY
  docker inspect ai-relay-creem-moderation >/dev/null
  for file in marketplace-model-copy.json billing-unit-inject.js; do
    [[ -f "$PROXY/$file" ]] || { printf 'Missing marketplace asset: %s\n' "$file" >&2; exit 1; }
    docker cp "ai-relay-creem-moderation:/app/$file" "$BACKUP/$file"
    docker cp "$PROXY/$file" "ai-relay-creem-moderation:/app/$file"
  done
  docker restart ai-relay-creem-moderation >/dev/null
else
  printf 'Matching marketplace copy missing; billing and registration passed but frontend rollout incomplete.\n' >&2
  exit 1
fi
SUCCESS=1
printf 'DONE_ADD_CLOUDFLARE_CLEF: real Decisions and user/token/channel/log settlement verified; public pricing verified.\n'
printf 'Backup: %s\nRetained stopped rollback container: %s\n' "$BACKUP" "$OLD"
