#!/usr/bin/env python3
"""Delist leftover free twins + glm-5.3 (paid ×2 twins already re-listed).

Avoids UNIQUE(model_name, deleted_at) by hard-deleting prior soft-deleted rows first.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

DELIST = [
    "glm-5.3",
    "glm-5.2-free",
    "kimi-k3-free",
    "deepseek-v4-flash-free",
    "deepseek-v4-pro-free",
]


def get_opt(cur, key):
    row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    return row[0] if row else None


def put_opt(cur, key, value):
    if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
        cur.execute("INSERT INTO options(key, value) VALUES(?,?)", (key, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))


def load_map(cur, key):
    raw = get_opt(cur, key)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db):
        raise SystemExit("DB not found: " + db)

    now = int(time.time())
    want = set(DELIST)
    con = sqlite3.connect(db)
    cur = con.cursor()
    m_cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}
    ch_cols = {r[1] for r in cur.execute("PRAGMA table_info(channels)")}
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    print("delist_targets", ",".join(sorted(want)))

    for i, mid in enumerate(sorted(want)):
        # Clear prior soft-deleted duplicates so UNIQUE(model_name, deleted_at) cannot fire
        if "deleted_at" in m_cols:
            cur.execute(
                "DELETE FROM models WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
                (mid,),
            )
            if cur.rowcount:
                print("purge_old_soft", mid, cur.rowcount)
            ts = now + i + 1
            cur.execute(
                "UPDATE models SET deleted_at=?, status=0 WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
                (ts, mid),
            )
            print("soft_delete", mid, cur.rowcount)
        elif "status" in m_cols:
            cur.execute("UPDATE models SET status=0 WHERE model_name=?", (mid,))
            print("status0", mid, cur.rowcount)
        if "abilities" in tabs:
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            print("abilities_del", mid, cur.rowcount)

    for cid, name, models in cur.execute("SELECT id, name, models FROM channels").fetchall():
        if not models:
            continue
        parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
        new_parts = [p for p in parts if p not in want]
        if len(new_parts) == len(parts):
            continue
        removed = [p for p in parts if p not in new_parts]
        if "updated_time" in ch_cols:
            cur.execute(
                "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                (",".join(new_parts), now, cid),
            )
        else:
            cur.execute(
                "UPDATE channels SET models=? WHERE id=?",
                (",".join(new_parts), cid),
            )
        print("channel_strip", cid, name or "", "removed", ",".join(removed))

    for key in ("ModelRatio", "CompletionRatio", "ModelPrice"):
        m = load_map(cur, key)
        changed = False
        for mid in list(m.keys()):
            if mid in want:
                del m[mid]
                changed = True
                print("option_%s_removed" % key, mid)
        if changed:
            put_opt(cur, key, json.dumps(m, ensure_ascii=False, separators=(",", ":")))

    con.commit()
    con.close()
    print("DONE_DELIST_FREE_TWINS")


if __name__ == "__main__":
    main()
