#!/bin/bash
# Remove the grsai-delisted gpt-image-2.5 family from grsai-backed channels.
# From the reviewed checkout on the VPS: bash scripts/vps-cleanup-grsai-image-models.sh
# Backs up the wallet DB first, edits channels/abilities only (never options or
# balances), restarts new-api to refresh caches, then verifies the public
# pricing view. The live GPT-Image-Pro lane is never modified.
set -euo pipefail
umask 077
ROOT=${ROOT:-/opt/ai-relay}
DB=${NEW_API_DB_HOST:-$ROOT/data/new-api/one-api.db}
NEW_API=${NEW_API_CONTAINER:-ai-relay-new-api}
STAMP=$(date +%Y%m%d%H%M%S)-$$
BACKUP="$ROOT/data/grsai-image-cleanup-$STAMP"

[[ -f "$DB" ]] || { printf 'DB missing: %s\n' "$DB" >&2; exit 1; }
mkdir -p "$BACKUP"
cp "$DB" "$BACKUP/one-api.db"
chmod 600 "$BACKUP/one-api.db"
printf 'BACKUP %s/one-api.db\n' "$BACKUP"

if ! python3 "$ROOT/scripts/cleanup-grsai-image-models.py" "$DB"; then
  printf 'CLEANUP_FAILED: restoring DB backup and restarting\n' >&2
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

# Public pricing is report-only here: the HD group may legitimately remain
# advertised via the live zex channel, and pricing cannot distinguish channel
# providers. The authoritative check is the python AFTER step (no grsai lane).
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
printf 'DONE_IMAGE_HD_CLEANUP backup=%s\n' "$BACKUP"
