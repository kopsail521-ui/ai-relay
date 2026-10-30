#!/bin/bash
# Fix MiniMax-M3.1-Flash tags (remove invented 工具/识图) and restart new-api
# so /api/pricing reflects it. DB-backed-up, idempotent, tags-only.
set -euo pipefail
umask 077
ROOT=${ROOT:-/opt/ai-relay}
DB=${NEW_API_DB_HOST:-$ROOT/data/new-api/one-api.db}
NEW_API=${NEW_API_CONTAINER:-ai-relay-new-api}
STAMP=$(date +%Y%m%d%H%M%S)-$$
BACKUP="$ROOT/data/tags-fix-$STAMP"

[[ -f "$DB" ]] || { printf 'DB missing: %s\n' "$DB" >&2; exit 1; }
mkdir -p "$BACKUP"
cp "$DB" "$BACKUP/one-api.db"
chmod 600 "$BACKUP/one-api.db"
printf 'BACKUP %s/one-api.db\n' "$BACKUP"

if ! python3 "$ROOT/scripts/fix-minimax-m31-tags.py" "$DB"; then
  printf 'TAGS_FIX_FAILED: restoring DB backup\n' >&2
  cp "$BACKUP/one-api.db" "$DB"
  docker restart "$NEW_API" >/dev/null || true
  exit 1
fi

docker restart "$NEW_API" >/dev/null
healthy=0
for attempt in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:3000/api/status >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]] || { printf 'RESTART_UNHEALTHY. Backup: %s\n' "$BACKUP" >&2; exit 1; }

python3 - <<'PYEOF'
import json, urllib.request
with urllib.request.urlopen("http://127.0.0.1:3000/api/pricing", timeout=20) as r:
    j = json.load(r)
for m in j.get("data", []):
    if m.get("model_name") == "MiniMax-M3.1-Flash":
        print("PUBLIC_TAGS", json.dumps(m.get("tags"), ensure_ascii=False))
PYEOF
printf 'DONE_TAGS_FIX backup=%s\n' "$BACKUP"