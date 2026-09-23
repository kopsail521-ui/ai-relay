#!/usr/bin/env python3
"""Delist a fixed batch of chat models from New API (marketplace + channels + ratios).

Targets (paid + free twins where they exist):
  glm-5.3, glm-5.2, glm-5.2-free
  deepseek-v4-pro-0813, deepseek-v4-flash-0731, deepseek-v4.1-flash,
  deepseek-v4-pro, deepseek-v4-flash, deepseek-v4-flash-free, deepseek-v4-pro-free
  kimi-k3, kimi-k3-free
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

DELIST = [
    "glm-5.3",
    "glm-5.2",
    "glm-5.2-free",
    "deepseek-v4-pro-0813",
    "deepseek-v4-flash-0731",
    "deepseek-v4.1-flash",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "deepseek-v4-flash-free",
    "deepseek-v4-pro-free",
    "kimi-k3",
    "kimi-k3-free",
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
    db = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
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

    for mid in sorted(want):
        if "deleted_at" in m_cols:
            cur.execute(
                "UPDATE models SET deleted_at=? WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
                (now, mid),
            )
            print("soft_delete", mid, cur.rowcount)
        if "status" in m_cols:
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

    # option maps: exact keys only
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
    print("DONE_DELIST_BATCH")


if __name__ == "__main__":
    main()
