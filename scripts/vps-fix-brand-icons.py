#!/usr/bin/env python3
"""Restore lobehub brand icons for models that wrongly fell back to Custom."""
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

# model_name -> (vendor_name, lobehub_icon)
FIXES = {
    "sam3": ("Meta", "Meta.Color"),
    "Step-Audio-TTS-3B": ("阶跃星辰", "Stepfun.Color"),
    "Real-ESRGAN": ("腾讯", "Tencent.Color"),
    "Unlimited-OCR": ("百度", "Wenxin.Color"),
    "IndexTTS-2": ("哔哩哔哩", "Bilibili.Color"),
    # RMBG / Atria: no reliable lobehub brand key — keep Custom + inject SVG
}

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("PRAGMA table_info(models)")
m_cols = {r[1] for r in cur.fetchall()}
cur.execute("PRAGMA table_info(vendors)")
v_cols = {r[1] for r in cur.fetchall()}
now = int(time.time())


def ensure_vendor(name, icon):
    cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        if "icon" in v_cols:
            cur.execute("UPDATE vendors SET icon=? WHERE id=?", (icon, row[0]))
        return row[0]
    fields, vals = ["name"], [name]
    if "icon" in v_cols:
        fields.append("icon")
        vals.append(icon)
    if "created_time" in v_cols:
        fields.append("created_time")
        vals.append(now)
    if "updated_time" in v_cols:
        fields.append("updated_time")
        vals.append(now)
    cur.execute(
        "INSERT INTO vendors(%s) VALUES (%s)"
        % (",".join(fields), ",".join(["?"] * len(fields))),
        vals,
    )
    return cur.lastrowid


for model, (vendor, icon) in FIXES.items():
    vid = ensure_vendor(vendor, icon)
    sql = "SELECT id, icon FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    cur.execute(sql, (model,))
    row = cur.fetchone()
    if not row:
        print("missing model", model)
        continue
    sets = ["icon=?", "vendor_id=?"]
    vals = [icon, vid]
    if "updated_time" in m_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(row[0])
    cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
    print("fixed", model, row[1], "->", icon, vendor)

conn.commit()
conn.close()
print("DONE_FIX_BRAND_ICONS")
