#!/usr/bin/env python3
"""DeepSeek icons: free = DeepSeek (black); paid = DeepSeek.Color (blue)."""
import os
import sqlite3
import sys
import time

FREE_ICON = "DeepSeek"
PAID_ICON = "DeepSeek.Color"

FREE = (
    "deepseek-v4-pro-free",
    "deepseek-v4-flash-free",
)
PAID = (
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "deepseek-v4-pro-0813",
    "deepseek-v4-flash-0731",
)


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db):
        raise SystemExit("DB not found: " + db)
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    now = int(time.time())
    m_cols = cols(cur, "models")
    updated = []

    def set_icon(name, icon):
        sql = "SELECT id, icon FROM models WHERE model_name=?"
        if "deleted_at" in m_cols:
            sql += " AND deleted_at IS NULL"
        cur.execute(sql, (name,))
        row = cur.fetchone()
        if not row:
            print("skip missing", name)
            return
        mid, old = row
        if old == icon:
            print("ok", name, icon)
            return
        sets = ["icon=?"]
        vals = [icon]
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(mid)
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        updated.append("%s:%s->%s" % (name, old, icon))
        print("updated", name, old, "->", icon)

    for n in FREE:
        set_icon(n, FREE_ICON)
    for n in PAID:
        set_icon(n, PAID_ICON)

    # any other deepseek* without -free → Color; *-free → mono
    sql = "SELECT id, model_name, icon FROM models WHERE lower(model_name) LIKE 'deepseek%'"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    cur.execute(sql)
    for mid, name, icon in cur.fetchall():
        if name in FREE or name in PAID:
            continue
        want = FREE_ICON if name.endswith("-free") else PAID_ICON
        if icon == want:
            continue
        sets = ["icon=?"]
        vals = [want]
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(mid)
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        updated.append("%s:%s->%s" % (name, icon, want))
        print("updated extra", name, icon, "->", want)

    conn.commit()
    conn.close()
    print({"ok": True, "updated": updated})


if __name__ == "__main__":
    main()
