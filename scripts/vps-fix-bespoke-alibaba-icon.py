#!/usr/bin/env python3
"""Hotfix: Bespoke-Nimble-9B → vendor 阿里巴巴, icon Qwen.Color"""
import os
import sqlite3
import sys
import time

MODEL = "Bespoke-Nimble-9B"
VENDOR = "阿里巴巴"
ICON = "Qwen.Color"


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    m_cols = cols(cur, "models")

    cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,))
    vrow = cur.fetchone()
    if not vrow:
        raise SystemExit("vendor missing: " + VENDOR)
    vid = vrow[0]

    sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    cur.execute(sql, (MODEL,))
    mrow = cur.fetchone()
    if not mrow:
        raise SystemExit("model missing: " + MODEL)
    mid = mrow[0]
    now = int(time.time())

    sets = ["vendor_id=?", "icon=?"]
    vals = [vid, ICON]
    if "updated_time" in m_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(mid)
    cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
    conn.commit()
    cur.execute("SELECT model_name, vendor_id, icon FROM models WHERE id=?", (mid,))
    print("updated", cur.fetchone(), "vendor=", VENDOR)
    print("DONE_BESPOKE_ICON_ALIBABA")
    conn.close()


if __name__ == "__main__":
    main()
