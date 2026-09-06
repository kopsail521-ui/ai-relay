#!/usr/bin/env python3
"""One-shot: scrub supplier-looking channel names in New API sqlite."""
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("PRAGMA table_info(channels)")
cols = {r[1] for r in cur.fetchall()}
cur.execute(
    "SELECT id, name, base_url FROM channels"
    + (" WHERE deleted_at IS NULL" if "deleted_at" in cols else "")
)
now = int(time.time())
for cid, name, base in cur.fetchall():
    blob = ((name or "") + " " + (base or "")).lower()
    new = name
    if "apimart" in blob or (("透传" in (name or "")) and "video" in blob.lower()):
        new = "Keyo Video Gen"
    elif "openlux" in blob or "上游" in (name or ""):
        new = "Keyo Primary"
    elif "sensenova" in blob or "商汤" in (name or ""):
        new = "Keyo Free"
    elif "gitee" in blob or "模力" in (name or ""):
        new = "Keyo Media"
    elif "grsai" in blob:
        new = "Keyo Images"
    if new != name:
        if "updated_time" in cols:
            cur.execute(
                "UPDATE channels SET name=?, updated_time=? WHERE id=?",
                (new, now, cid),
            )
        else:
            cur.execute("UPDATE channels SET name=? WHERE id=?", (new, cid))
        print("renamed", cid, name, "->", new)
conn.commit()
print("DONE_SCRUB_CHANNELS")
