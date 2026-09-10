#!/usr/bin/env python3
"""Add Grsai gpt-image-2.5 / flare / sunburst onto Keyo Images channel.

Grsai cost (CNY / request, announcement 2026-09-10):
  gpt-image-2.5           ¥0.03
  gpt-image-2.5-flare     ¥0.10
  gpt-image-2.5-sunburst  ¥0.12
FX=7.3 · sell = cost × 1.5 → ModelPrice (USD / request)
Public copy must NOT mention Grsai / cost / markup.
"""
import json
import os
import sqlite3
import sys
import time

FX = 7.3
MARKUP = 1.5
TAG = "图片"
VENDOR = "OpenAI"
ICON = "OpenAI"
ENDPOINTS = json.dumps(
    {"image-generation": "/v1/images/generations"}, separators=(",", ":")
)
ABILITY_SRC = "gpt-image-2"

MODELS = [
    {
        "id": "gpt-image-2.5",
        "cost_cny": 0.03,
        "desc": "GPT Image 2.5：入门文生图 / 图生图（约 1K）。按张计费。",
    },
    {
        "id": "gpt-image-2.5-flare",
        "cost_cny": 0.10,
        "desc": "GPT Image 2.5 Flare：低延迟通用文生图 / 图生图，适合批量快速出图。按张计费。",
    },
    {
        "id": "gpt-image-2.5-sunburst",
        "cost_cny": 0.12,
        "desc": "GPT Image 2.5 Sunburst：高精度文生图 / 精细编辑，适合精品商业出图。按张计费。",
    },
]


def sell_usd(cost_cny):
    return (cost_cny / FX) * MARKUP


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")

    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    channels = cur.fetchall()

    target = None
    for cid, name, models, base in channels:
        blob = ((name or "") + " " + (base or "")).lower()
        if "grsai" in blob or "keyo images" in (name or "").lower():
            target = (cid, name, models or "")
            break
    if target is None:
        for cid, name, models, base in channels:
            ms = [x.strip() for x in (models or "").split(",") if x.strip()]
            if ABILITY_SRC in ms:
                target = (cid, name, models or "")
                break
    if target is None:
        raise SystemExit("Keyo Images / Grsai channel not found")

    cid, cname, models_s = target
    new_name = cname
    low = (cname or "").lower()
    if "grsai" in low or "上游" in (cname or "") or "透传" in (cname or ""):
        new_name = "Keyo Images"
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    added = []
    for m in MODELS:
        mid = m["id"]
        if mid not in parts:
            parts.insert(0, mid)
            added.append(mid)
    merged = ",".join(parts)
    if "updated_time" in ch_cols:
        cur.execute(
            "UPDATE channels SET models=?, name=?, updated_time=? WHERE id=?",
            (merged, new_name, now, cid),
        )
    else:
        cur.execute(
            "UPDATE channels SET models=?, name=? WHERE id=?",
            (merged, new_name, cid),
        )
    print("channel", cid, new_name, "added", ",".join(added) or "(none)")

    def get_opt(key):
        cur.execute("SELECT value FROM options WHERE key=?", (key,))
        row = cur.fetchone()
        return row[0] if row else "{}"

    def put_opt(key, value):
        cur.execute("SELECT key FROM options WHERE key=?", (key,))
        if cur.fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))

    mr = json.loads(get_opt("ModelRatio") or "{}")
    cr = json.loads(get_opt("CompletionRatio") or "{}")
    mp = json.loads(get_opt("ModelPrice") or "{}")
    ir = json.loads(get_opt("ImageRatio") or "{}")

    priced = []
    for m in MODELS:
        mid = m["id"]
        sell = sell_usd(m["cost_cny"])
        mp[mid] = sell
        mr.pop(mid, None)
        cr.pop(mid, None)
        ir.pop(mid, None)
        priced.append({"id": mid, "sell_usd": round(sell, 8), "cost_cny": m["cost_cny"]})
        print("price", mid, "sell_usd", round(sell, 6))

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":"))
    )
    put_opt("ImageRatio", json.dumps(ir, ensure_ascii=False, separators=(",", ":")))
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,))
    vrow = cur.fetchone()
    if vrow is None:
        raise SystemExit("vendor missing: " + VENDOR)
    vid = vrow[0]

    m_cols = cols(cur, "models")
    for m in MODELS:
        mid = m["id"]
        sell = sell_usd(m["cost_cny"])
        desc = m["desc"] + " 计费：$%.4f/次。" % sell
        model_sql = "SELECT id FROM models WHERE model_name=?"
        if "deleted_at" in m_cols:
            model_sql += " AND deleted_at IS NULL"
        cur.execute(model_sql, (mid,))
        mrow = cur.fetchone()
        if mrow is None:
            fields = [
                "model_name",
                "description",
                "icon",
                "tags",
                "vendor_id",
                "endpoints",
            ]
            values = [mid, desc, ICON, TAG, vid, ENDPOINTS]
            if "status" in m_cols:
                fields.append("status")
                values.append(1)
            if "sync_official" in m_cols:
                fields.append("sync_official")
                values.append(0)
            if "created_time" in m_cols:
                fields.append("created_time")
                values.append(now)
            if "updated_time" in m_cols:
                fields.append("updated_time")
                values.append(now)
            q = "INSERT INTO models(%s) VALUES (%s)" % (
                ",".join(fields),
                ",".join(["?"] * len(fields)),
            )
            cur.execute(q, values)
            print("marketplace created", mid)
        else:
            sets = [
                "description=?",
                "icon=?",
                "tags=?",
                "vendor_id=?",
                "endpoints=?",
            ]
            vals = [desc, ICON, TAG, vid, ENDPOINTS]
            if "status" in m_cols:
                sets.append("status=1")
            if "sync_official" in m_cols:
                sets.append("sync_official=0")
            if "updated_time" in m_cols:
                sets.append("updated_time=?")
                vals.append(now)
            vals.append(mrow[0])
            cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
            print("marketplace updated", mid)

        try:
            cur.execute(
                'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
                (ABILITY_SRC,),
            )
            ab_src = cur.fetchall()
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            if ab_src:
                for g, ch, en, pri, w in ab_src:
                    cur.execute(
                        'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                        (g, mid, ch, en, pri, w),
                    )
                print("abilities copied from", ABILITY_SRC, "for", mid, ":", len(ab_src))
            else:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    ("default", mid, cid, 1, 0, 1),
                )
                print("abilities ensured for", mid, "channel", cid)
        except Exception as e:
            print("abilities skip", mid, ":", e)

    conn.commit()
    conn.close()
    print(
        json.dumps(
            {"ok": True, "markup": MARKUP, "fx": FX, "models": priced},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
