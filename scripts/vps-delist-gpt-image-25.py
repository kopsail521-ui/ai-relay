#!/usr/bin/env python3
"""Delist all gpt-image-2.5 variants from New API.

Removes: channel models, abilities, ModelPrice/ModelRatio/CompletionRatio/ImageRatio,
and soft-disables marketplace rows (status=0).
"""
import json
import os
import sqlite3
import sys
import time

MODELS = [
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst",
    "gpt-image-2.5-flare-c",
    "gpt-image-2.5-sunburst-c",
]


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
    if not os.path.exists(db):
        raise SystemExit("DB not found: " + db)

    conn = sqlite3.connect(db)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")

    for mid in MODELS:
        try:
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            print("abilities_deleted", mid, cur.rowcount)
        except Exception as e:
            print("abilities_skip", mid, e)

    sql = "SELECT id, models FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    for cid, models in cur.fetchall():
        if not models:
            continue
        parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
        new_parts = [p for p in parts if p not in MODELS]
        if len(new_parts) == len(parts):
            continue
        removed = [p for p in parts if p in MODELS]
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
        print("channel", cid, "removed", ",".join(removed))

    def get_opt(key):
        cur.execute("SELECT value FROM options WHERE key=?", (key,))
        row = cur.fetchone()
        return row[0] if row else None

    def put_opt(key, value):
        cur.execute("SELECT key FROM options WHERE key=?", (key,))
        if cur.fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))

    for key in ("ModelRatio", "ModelPrice", "CompletionRatio", "ImageRatio"):
        raw = get_opt(key)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        changed = False
        for mid in MODELS:
            if mid in data:
                del data[mid]
                changed = True
                print("option", key, "removed", mid)
        if changed:
            put_opt(key, json.dumps(data, ensure_ascii=False, separators=(",", ":")))

    for mid in MODELS:
        q = "SELECT id FROM models WHERE model_name=?"
        if "deleted_at" in m_cols:
            q += " AND deleted_at IS NULL"
        cur.execute(q, (mid,))
        row = cur.fetchone()
        if not row:
            print("marketplace_missing", mid)
            continue
        sets = []
        vals = []
        if "status" in m_cols:
            sets.append("status=0")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        if not sets:
            print("marketplace_noop", mid)
            continue
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace_disabled", mid)

    conn.commit()
    conn.close()
    print("DONE_DELIST_GPT_IMAGE_25")


if __name__ == "__main__":
    main()
