#!/usr/bin/env python3
"""Remove the grsai-delisted gpt-image-2.5 family from grsai-backed channels.

Upstream delisted the whole gpt-image-2.5 family, so every lane except
GPT-Image-Pro (aicopy) is dead for these models. This script strips the dead
SKUs from grsai-backed channels only — the live Pro lane is preserved:

  - abilities rows for the dead SKUs are deleted for every group EXCEPT
    GPT-Image-Pro (even on channels that also serve the Pro group);
  - channels.models loses the dead SKUs only when the channel does not serve
    GPT-Image-Pro at all (otherwise the models string stays intact so a later
    console edit cannot resurrect the deleted lanes);

Options, quotas, balances and tokens are never touched. Idempotent: a second
run reports zero changes.
"""
import json
import sqlite3
import sys

DB = sys.argv[1]
DEAD = [
    "gpt-image-2.5",
    "gpt-image-2.5-sunburst",
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst-vip",
    "gpt-image-2.5-flare-vip",
]
PROVIDER = "grsai"
PROTECTED_GROUP = "GPT-Image-Pro"

con = sqlite3.connect(DB, timeout=30)
con.row_factory = sqlite3.Row
cur = con.cursor()


def report(title, rows):
    print(title)
    for r in rows:
        print("   ", dict(r))


before = cur.execute(
    'SELECT a.model, a."group", c.id AS channel_id, c.name, c.base_url '
    "FROM abilities a JOIN channels c ON c.id=a.channel_id "
    'WHERE a.model IN (%s) AND a.enabled=1 ORDER BY a.model, a."group"'
    % ",".join("?" * len(DEAD)),
    DEAD,
).fetchall()
report("BEFORE:", before)

grsai_ids = [
    r["id"]
    for r in cur.execute(
        "SELECT id FROM channels WHERE lower(base_url) LIKE ?", (f"%{PROVIDER}%",)
    ).fetchall()
]
print("GRSAI_BACKED_CHANNELS:", grsai_ids)
if not grsai_ids:
    print("ABORT: no grsai-backed channels found; nothing changed")
    sys.exit(1)

removed = 0
stripped = []
with con:
    for cid in grsai_ids:
        ch = cur.execute(
            'SELECT id, "group", models FROM channels WHERE id=?', (cid,)
        ).fetchone()
        if not ch:
            continue
        serves_pro = PROTECTED_GROUP in [
            g.strip() for g in (ch["group"] or "").split(",")
        ]
        for model in DEAD:
            if serves_pro:
                cur.execute(
                    'DELETE FROM abilities WHERE channel_id=? AND model=? AND "group"!=?',
                    (cid, model, PROTECTED_GROUP),
                )
            else:
                cur.execute(
                    "DELETE FROM abilities WHERE channel_id=? AND model=?",
                    (cid, model),
                )
            removed += max(cur.rowcount, 0)
        if not serves_pro:
            models = [m.strip() for m in (ch["models"] or "").split(",") if m.strip()]
            kept = [m for m in models if m not in DEAD]
            if kept != models:
                cur.execute(
                    "UPDATE channels SET models=? WHERE id=?", (",".join(kept), cid)
                )
                stripped.append({"channel_id": cid, "removed": [m for m in models if m in DEAD]})

print("REMOVED_ABILITY_ROWS:", removed)
print("STRIPPED_MODELS:", json.dumps(stripped, ensure_ascii=False) if stripped else "[]")

after = cur.execute(
    'SELECT a.model, a."group", c.base_url FROM abilities a '
    "JOIN channels c ON c.id=a.channel_id "
    "WHERE a.model IN (%s) AND a.enabled=1 ORDER BY a.model" % ",".join("?" * len(DEAD)),
    DEAD,
).fetchall()
report("AFTER (must only be the protected lane):", after)
bad = [dict(r) for r in after if r["group"] != PROTECTED_GROUP]
if bad:
    print("VERIFY_FAILED non-protected lanes remain:", bad)
    sys.exit(2)
print("CLEANUP_OK")
