#!/usr/bin/env python3
"""Reorganize the gpt-image-2.5 family down to two customer-facing models.

Target state per the owner:
  - gpt-image-2.5-flare   and gpt-image-2.5-sunburst are the only listed
    gpt-image-2.5-family models, each served by TWO channels:
      GPT-Image-HD  -> the zex-backed channel
      GPT-Image-Pro -> the aicopy-backed channel
  - gpt-image-2.5 (base) and both -vip SKUs are delisted everywhere.

The script deletes every ability row and models-list entry for the delisted
SKUs across ALL channels, then ensures the two kept models exist on both the
zex and aicopy channels (inserting missing ability rows / models entries).
Options, quotas, balances and tokens are never touched. Idempotent.
"""
import json
import sqlite3
import sys

DB = sys.argv[1]
DEAD = ["gpt-image-2.5", "gpt-image-2.5-flare-vip", "gpt-image-2.5-sunburst-vip"]
KEEP = ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]
ZEX = "zex"
AICOPY = "aicopy"
HD_GROUP = "GPT-Image-HD"
PRO_GROUP = "GPT-Image-Pro"

con = sqlite3.connect(DB, timeout=30)
con.row_factory = sqlite3.Row
cur = con.cursor()


def report(title, rows):
    print(title)
    for r in rows:
        print("   ", dict(r))


def find_channel(frag):
    return cur.execute(
        "SELECT id, \"group\", models FROM channels WHERE lower(base_url) LIKE ? LIMIT 1",
        (f"%{frag}%",),
    ).fetchone()


zex = find_channel(ZEX)
aicopy = find_channel(AICOPY)
if not zex or not aicopy:
    print(f"ABORT: zex channel found={bool(zex)} aicopy channel found={bool(aicopy)}; nothing changed")
    sys.exit(1)
print("ZEX_CHANNEL:", dict(zex))
print("AICOPY_CHANNEL:", dict(aicopy))

before = cur.execute(
    'SELECT a.model, a."group", c.id AS channel_id, c.name, c.base_url '
    "FROM abilities a JOIN channels c ON c.id=a.channel_id "
    "WHERE a.model IN (%s) ORDER BY a.model, a.\"group\""
    % ",".join("?" * (len(DEAD) + len(KEEP))),
    DEAD + KEEP,
).fetchall()
report("BEFORE:", before)

with con:
    # 1) Delist the dead SKUs everywhere.
    for model in DEAD:
        cur.execute("DELETE FROM abilities WHERE model=?", (model,))
        for ch in cur.execute("SELECT id, models FROM channels").fetchall():
            models = [m.strip() for m in (ch["models"] or "").split(",") if m.strip()]
            if model in models:
                cur.execute(
                    "UPDATE channels SET models=? WHERE id=?",
                    (",".join(m for m in models if m != model), ch["id"]),
                )

    # 2) Ensure the two kept models are served by BOTH lanes.
    ensured = []
    for model in KEEP:
        for ch, group, frag in ((zex, HD_GROUP, ZEX), (aicopy, PRO_GROUP, AICOPY)):
            row = cur.execute(
                'SELECT 1 FROM abilities WHERE channel_id=? AND model=? AND "group"=?',
                (ch["id"], model, group),
            ).fetchone()
            if not row:
                cur.execute(
                    'INSERT INTO abilities(channel_id,model,"group",enabled,priority,weight) VALUES (?,?,?,1,0,1)',
                    (ch["id"], model, group),
                )
                ensured.append({"channel_id": ch["id"], "model": model, "group": group})
            models = [m.strip() for m in (ch["models"] or "").split(",") if m.strip()]
            if model not in models:
                cur.execute(
                    "UPDATE channels SET models=? WHERE id=?",
                    (",".join(models + [model]), ch["id"]),
                )
print("ENSURED_ROWS:", json.dumps(ensured, ensure_ascii=False))

after_dead = cur.execute(
    "SELECT COUNT(*) AS n FROM abilities WHERE model IN (%s)" % ",".join("?" * len(DEAD)),
    DEAD,
).fetchone()["n"]
print("DEAD_ABILITY_ROWS_REMAINING:", after_dead["n"] if isinstance(after_dead, dict) else after_dead)

after_keep = cur.execute(
    'SELECT a.model, a."group", c.name, c.base_url FROM abilities a '
    "JOIN channels c ON c.id=a.channel_id WHERE a.model IN (%s) AND a.enabled=1 "
    'ORDER BY a.model, a."group"' % ",".join("?" * len(KEEP)),
    KEEP,
).fetchall()
report("AFTER (each kept model must be exactly zex-HD + aicopy-Pro):", after_keep)

expected = {(m, HD_GROUP) for m in KEEP} | {(m, PRO_GROUP) for m in KEEP}
actual = {(r["model"], r["group"]) for r in after_keep}
if after_dead not in (0,) or actual != expected:
    print(f"VERIFY_FAILED dead_rows={after_dead} unexpected_groups={actual ^ expected}")
    sys.exit(2)
print("REORG_OK")
