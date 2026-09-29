#!/usr/bin/env python3
"""Vendor / tag batch:
1) ling-3.0-flash-fin:free → 阿里巴巴
2) mimo-v2.6-pro/flash → 小米 + XiaomiMiMo
3) dots-3-note-preview:free → 小红书 (Custom; SPA inject SVG)
4) laguna-s-2.1:free → 其他 + Custom
5) retag 视频按秒 → 视频模型 (all models)
"""
from __future__ import annotations

import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

MODEL_VENDOR = {
    "ling-3.0-flash-fin:free": ("阿里巴巴", "Qwen.Color"),
    "mimo-v2.6-pro": ("小米", "XiaomiMiMo"),
    "mimo-v2.6-flash": ("小米", "XiaomiMiMo"),
    "dots-3-note-preview:free": ("小红书", "Custom"),
    "laguna-s-2.1:free": ("其他", "Custom"),
}


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    vc = cols(cur, "vendors")
    mc = cols(cur, "models")
    soft_v = "deleted_at" in vc
    soft_m = "deleted_at" in mc
    now = int(time.time())

    def find_vendor(name):
        q = "SELECT id FROM vendors WHERE name=?"
        if soft_v:
            q += " AND deleted_at IS NULL"
        row = cur.execute(q + " LIMIT 1", (name,)).fetchone()
        return row[0] if row else None

    def ensure_vendor(name, icon):
        vid = find_vendor(name)
        if vid:
            if icon and "icon" in vc:
                cur.execute("UPDATE vendors SET icon=? WHERE id=?", (icon, vid))
            return vid
        fields = ["name"]
        vals = [name]
        if "icon" in vc:
            fields.append("icon")
            vals.append(icon or "Custom")
        if "description" in vc:
            fields.append("description")
            vals.append("")
        if "status" in vc:
            fields.append("status")
            vals.append(1)
        for tcol in ("created_time", "updated_time", "created_at", "updated_at"):
            if tcol in vc:
                fields.append(tcol)
                vals.append(now)
        cur.execute(
            "INSERT INTO vendors(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            vals,
        )
        return cur.lastrowid

    for mid, (vname, icon) in MODEL_VENDOR.items():
        vid = ensure_vendor(vname, icon)
        q = "SELECT id, vendor_id, icon, tags FROM models WHERE model_name=?"
        if soft_m:
            q += " AND deleted_at IS NULL"
        row = cur.execute(q, (mid,)).fetchone()
        if not row:
            print("missing", mid)
            continue
        sets = ["vendor_id=?", "icon=?"]
        vals = [vid, icon]
        if "updated_time" in mc:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("vendor", mid, "->", vname, icon)

    # retag 视频按秒 → 视频模型
    q = "SELECT id, model_name, tags FROM models WHERE tags LIKE ?"
    if soft_m:
        q += " AND deleted_at IS NULL"
    rows = cur.execute(q, ("%视频按秒%",)).fetchall()
    n = 0
    for mid, name, tags in rows:
        parts = [p.strip() for p in str(tags or "").replace("，", ",").split(",") if p.strip()]
        out = []
        seen = set()
        changed = False
        for p in parts:
            t = "视频模型" if p in ("视频按秒", "影片按秒", "VideoSec") else p
            if t != p:
                changed = True
            if t in seen:
                continue
            seen.add(t)
            out.append(t)
        if not changed:
            continue
        new_tags = ",".join(out)
        sets = ["tags=?"]
        vals = [new_tags]
        if "updated_time" in mc:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(mid)
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("retag", name, tags, "->", new_tags)
        n += 1
    print("retag_count", n)

    conn.commit()
    conn.close()
    print("DONE_FIX_VENDOR_TAGS_BATCH")


if __name__ == "__main__":
    main()
