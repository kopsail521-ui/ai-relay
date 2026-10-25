#!/bin/bash
# Reorganize the gpt-image-2.5 family: keep only gpt-image-2.5-flare and
# gpt-image-2.5-sunburst, each served by the zex (HD) and aicopy (Pro)
# channels; delist gpt-image-2.5 and both -vip SKUs everywhere.
# From the reviewed checkout on the VPS: bash scripts/vps-reorg-gpt-image-25.sh
# Backs up the wallet DB, touches channels/abilities only, restarts new-api.
set -euo pipefail
umask 077
ROOT=${ROOT:-/opt/ai-relay}
DB=${NEW_API_DB_HOST:-$ROOT/data/new-api/one-api.db}
NEW_API=${NEW_API_CONTAINER:-ai-relay-new-api}
STAMP=$(date +%Y%m%d%H%M%S)-$$
BACKUP="$ROOT/data/gpt25-reorg-$STAMP"

[[ -f "$DB" ]] || { printf 'DB missing: %s\n' "$DB" >&2; exit 1; }
mkdir -p "$BACKUP"
cp "$DB" "$BACKUP/one-api.db"
chmod 600 "$BACKUP/one-api.db"
printf 'BACKUP %s/one-api.db\n' "$BACKUP"

if ! python3 "$ROOT/scripts/reorg-gpt-image-25.py" "$DB"; then
  printf 'REORG_FAILED: restoring DB backup and restarting\n' >&2
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
if [[ "$healthy" != 1 ]]; then
  printf 'RESTART_UNHEALTHY: DB changes stand; inspect %s logs. Backup: %s\n' "$NEW_API" "$BACKUP" >&2
  exit 1
fi

python3 - <<'PYEOF'
import json, urllib.request

with urllib.request.urlopen("http://127.0.0.1:3000/api/pricing", timeout=20) as r:
    j = json.load(r)
rows = {
    m["model_name"]: m.get("enable_groups")
    for m in j.get("data", [])
    if m.get("model_name", "").startswith("gpt-image-2.5")
}
print("PRICING_GROUPS", json.dumps(rows, ensure_ascii=False))
PYEOF
printf 'DONE_GPT25_REORG backup=%s\n' "$BACKUP"
