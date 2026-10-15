#!/usr/bin/env bash
# From the reviewed checkout on the VPS: bash scripts/vps-add-zex-gpt-image.sh
# Requires ZEX_API_KEY in /opt/ai-relay/.env (single key, no quotes needed).
set -euo pipefail
set +x
umask 077
ROOT=${ZEX_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}
PY="$ROOT/scripts/add-zex-gpt-image.py"
NEW_API=${ZEX_NEW_API_CONTAINER:-ai-relay-new-api}
MODERATION=${ZEX_MODERATION_CONTAINER:-ai-relay-creem-moderation}
PROBE_BASE=${ZEX_PROBE_BASE:-https://www.keyoapi.xyz}
DB=${NEW_API_DB_HOST:-$ROOT/data/new-api/one-api.db}
STAMP=$(date +%Y%m%d%H%M%S)-$$
BACKUP="$ROOT/data/zex-deploy-$STAMP"
OLD="$NEW_API-zex-backup-$STAMP"
WORK=$(mktemp -d)
RENAMED=0
SUCCESS=0

cleanup() {
  result=$?
  trap - EXIT
  if [[ "$SUCCESS" != 1 && "$RENAMED" == 1 ]]; then
    docker rm -f "$NEW_API" >/dev/null 2>&1 || true
    docker rename "$OLD" "$NEW_API" >/dev/null 2>&1 || true
    docker start "$NEW_API" >/dev/null 2>&1 || true
    printf 'ZEX_NOT_ACTIVATED: prior new-api container restored. Backup: %s\n' "$BACKUP" >&2
  elif [[ "$SUCCESS" != 1 ]]; then
    printf 'ZEX_INCOMPLETE: check output above. Channel can be disabled with: python3 %s --db %s --disable\n' "$PY" "$DB" >&2
  fi
  rm -rf -- "$WORK"
  exit "$result"
}
trap cleanup EXIT

for executable in python3 docker curl; do
  command -v "$executable" >/dev/null || { printf 'Required executable missing: %s\n' "$executable" >&2; exit 1; }
done
[[ -f "$PY" && -f "$DB" ]] || { printf 'Missing registration script or local billing DB.\n' >&2; exit 1; }
python3 - "$ROOT/config/marketplace-model-copy.json" "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json" <<'PYEOF'
import json, sys
left, right = [json.load(open(p, encoding='utf-8')) for p in sys.argv[1:3]]
if left != right:
    raise SystemExit('Marketplace copies differ; deploy matching reviewed metadata first')
for name in ("gpt-image-2-1K", "gpt-image-2-2K", "gpt-image-2-4K", "gpt-image-2.5-1K",
             "gpt-image-2.5-flare-hd", "gpt-image-2.5-flare-vip",
             "gpt-image-2.5-sunburst-hd", "gpt-image-2.5-sunburst-vip"):
    if name not in left:
        raise SystemExit('Marketplace copy lacks ' + name)
PYEOF
mkdir -p "$BACKUP"; chmod 700 "$BACKUP"
docker inspect "$NEW_API" > "$BACKUP/new-api-inspect.json"
docker inspect "$MODERATION" >/dev/null
python3 - "$DB" "$BACKUP/one-api.db" <<'PYEOF'
import sqlite3, sys
with sqlite3.connect(sys.argv[1], timeout=30) as source, sqlite3.connect(sys.argv[2]) as target:
    source.backup(target)
PYEOF
chmod 600 "$BACKUP/new-api-inspect.json" "$BACKUP/one-api.db"
docker cp "$MODERATION:/app/marketplace-model-copy.json" "$BACKUP/marketplace-model-copy.json" >/dev/null
python3 - "$PY" "$ROOT/.env" "$WORK/upstream-key" <<'PYEOF'
import importlib.util, os, pathlib, sys
spec = importlib.util.spec_from_file_location('zex', sys.argv[1])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.load_env(sys.argv[2])
key = os.environ.get('ZEX_API_KEY', '').strip()
if not key or any(c in key for c in '\r\n\x00'):
    raise SystemExit('ZEX_API_KEY missing/invalid in .env')
fd = os.open(sys.argv[3], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as out:
    out.write(key)
PYEOF

# 1) Register channel, models, per-request prices in the DB (caches refresh on recreate).
python3 "$PY" --env-file "$ROOT/.env" --db "$DB" --key-file "$WORK/upstream-key" --register

# 2) Recreate new-api from its own image with TASK_PRICE_PATCH so per-call prices
#    are not multiplied by the sora seconds/size factors. Old container retained.
IMAGE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0]["Config"]["Image"])' "$BACKUP/new-api-inspect.json")
printf 'TASK_PRICE_PATCH=%s\n' "$(python3 -c 'import importlib.util,sys; spec=importlib.util.spec_from_file_location("m",sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print(",".join(m.MODELS))' "$PY")" > "$WORK/task-env"
docker stop "$NEW_API" >/dev/null
docker rename "$NEW_API" "$OLD" >/dev/null
RENAMED=1
python3 "$PY" --clone-container "$BACKUP/new-api-inspect.json" "$IMAGE" "$NEW_API" "$WORK/task-env"
docker start "$NEW_API" >/dev/null
healthy=0
for attempt in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:3000/api/status >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]] || { printf 'Recreated new-api failed health check; rolling back.\n' >&2; exit 1; }

# 3) Real billed proof through the public route; disables the channel on mismatch.
if ! python3 "$PY" --env-file "$ROOT/.env" --db "$DB" --key-file "$WORK/upstream-key" --probe --base "$PROBE_BASE"; then
  python3 "$PY" --env-file "$ROOT/.env" --db "$DB" --disable
  docker restart "$NEW_API" >/dev/null
  printf 'Probe failed: channel disabled, container env kept (harmless). Backup: %s\n' "$BACKUP" >&2
  exit 1
fi

# 4) Marketplace copy rollout.
docker cp "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json" "$MODERATION:/app/marketplace-model-copy.json" >/dev/null
docker restart "$MODERATION" >/dev/null

public_ok=0
for attempt in $(seq 1 15); do
  if python3 "$PY" --base "$PROBE_BASE" --check-public >/dev/null 2>&1; then public_ok=1; break; fi
  sleep 2
done
[[ "$public_ok" == 1 ]] || { printf 'Public pricing verification failed; see /api/pricing.\n' >&2; exit 1; }
SUCCESS=1
printf 'DONE_ADD_ZEX_GPT_IMAGE: 8 models live on POST /v1/videos with per-request billing verified.\n'
printf 'Backup: %s\nRetained stopped rollback container: %s\n' "$BACKUP" "$OLD"
