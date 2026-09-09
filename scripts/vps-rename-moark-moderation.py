#!/usr/bin/env python3
"""Rename public model id moark-text-moderation -> keyo-text-moderation.

Keeps upstream routing via channel model_mapping:
  keyo-text-moderation -> moark-text-moderation
Does not change passthrough catalog upstream id.
"""
import json
import os
import sqlite3
import sys
import time

OLD = "moark-text-moderation"
NEW = "keyo-text-moderation"


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def remap_opt_json(cur, key, old, new):
    cur.execute("SELECT value FROM options WHERE key=?", (key,))
    row = cur.fetchone()
    if not row:
        return False
    try:
        obj = json.loads(row[0] or "{}")
    except Exception:
        return False
    if not isinstance(obj, dict) or old not in obj:
        return False
    obj[new] = obj.pop(old)
    cur.execute("UPDATE options SET value=? WHERE key=?", (json.dumps(obj, ensure_ascii=False, separators=(",", ":")), key))
    return True


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
    if not os.path.exists(db):
        raise SystemExit("DB not found: " + db)
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")

    sql = "SELECT id, models, model_mapping FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    for cid, models, mapping in cur.fetchall():
        parts = [p.strip() for p in (models or "").split(",") if p.strip()]
        changed = False
        if OLD in parts:
            parts = [NEW if p == OLD else p for p in parts]
            if NEW not in parts:
                parts.append(NEW)
            changed = True
        mp = {}
        if mapping:
            try:
                mp = json.loads(mapping)
            except Exception:
                mp = {}
        if not isinstance(mp, dict):
            mp = {}
        # public NEW maps to upstream OLD; drop OLD as public key if present
        if mp.get(NEW) != OLD:
            mp[NEW] = OLD
            changed = True
        if OLD in mp and OLD != NEW:
            # if someone called OLD as public, keep mapping to itself for safety
            pass
        if changed:
            sets = ["models=?", "model_mapping=?"]
            vals = [",".join(parts), json.dumps(mp, ensure_ascii=False, separators=(",", ":"))]
            if "updated_time" in ch_cols:
                sets.append("updated_time=?")
                vals.append(now)
            vals.append(cid)
            cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
            print("channel", cid, "models+mapping updated")

    for key in ("ModelPrice", "ModelRatio", "CompletionRatio", "ImageRatio"):
        if remap_opt_json(cur, key, OLD, NEW):
            print("options", key, OLD, "->", NEW)

    m_cols = cols(cur, "models")
    q = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        q += " AND deleted_at IS NULL"
    cur.execute(q, (OLD,))
    row = cur.fetchone()
    if row:
        sets = ["model_name=?", "description=?"]
        vals = [
            NEW,
            "文本内容安全审核（敏感内容识别）。按次计费。",
        ]
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace renamed", OLD, "->", NEW)
    else:
        cur.execute(q, (NEW,))
        if not cur.fetchone():
            print("marketplace row missing for both ids (ok if created later)")

    try:
        cur.execute("UPDATE abilities SET model=? WHERE model=?", (NEW, OLD))
        print("abilities renamed", cur.rowcount)
    except Exception as e:
        print("abilities skip", e)

    conn.commit()
    conn.close()
    print("DONE_RENAME_MOARK", NEW)


if __name__ == "__main__":
    main()
