#!/usr/bin/env python3
"""Add gpt-image-2.5-sunburst / gpt-image-2.5-flare (OpenLux → Keyo Primary).

OpenLux pricing_new (quota_type=0):
  model_ratio=2.5, completion_ratio=6, image_ratio=1.6
Cheapest enable group: Azure-Gpt-5 (group_ratio≈0.44118)
  cost_in  = 2.5 * 0.44118 * 2 = $2.2059 / 1M
  cost_out = cost_in * 6       = $13.2354 / 1M
Sell = cost × 1.2 → $2.64708 / $15.88248
  ModelRatio = sell_in/2 = 1.32354
  CompletionRatio = 6
  ImageRatio = 1.6  (relative image-token weight; markup via ModelRatio)
Public copy must NOT mention OpenLux / cost / markup.
"""
import json
import os
import sqlite3
import sys
import time

MARKUP = 1.2
COST_IN = 2.2059
COST_OUT = 13.2354
SELL_IN = COST_IN * MARKUP
SELL_OUT = COST_OUT * MARKUP
OUR_MODEL_RATIO = SELL_IN / 2.0  # 1.32354
OUR_COMPLETION_RATIO = 6.0
IMAGE_RATIO = 1.6
TAG = "图片"
VENDOR = "OpenAI"
ICON = "OpenAI"
ENDPOINTS = json.dumps(
    {"image-generation": "/v1/images/generations"}, separators=(",", ":")
)
ABILITY_SRC = "gpt-5.6-luna"

MODELS = [
    {
        "id": "gpt-image-2.5-flare",
        "desc": "GPT Image 2.5 Flare：低延迟通用文生图 / 图生图，适合批量快速出图。按 Token 计费。",
    },
    {
        "id": "gpt-image-2.5-sunburst",
        "desc": "GPT Image 2.5 Sunburst：高精度文生图 / 精细编辑，适合精品商业出图。按 Token 计费。",
    },
]


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
        if "openlux" in blob:
            target = (cid, name, models or "")
            break
    if target is None:
        for cid, name, models, base in channels:
            ms = [x.strip() for x in (models or "").split(",") if x.strip()]
            if ABILITY_SRC in ms:
                target = (cid, name, models or "")
                break
    if target is None:
        raise SystemExit("primary OpenLux channel not found")

    cid, cname, models_s = target
    new_name = cname
    low = (cname or "").lower()
    if (
        "openlux" in low
        or "上游" in (cname or "")
        or "透传" in (cname or "")
        or "gitee" in low
        or "模力" in (cname or "")
    ):
        new_name = "Keyo Primary"
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

    for m in MODELS:
        mid = m["id"]
        mr[mid] = OUR_MODEL_RATIO
        cr[mid] = OUR_COMPLETION_RATIO
        ir[mid] = IMAGE_RATIO
        mp.pop(mid, None)

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":"))
    )
    put_opt("ImageRatio", json.dumps(ir, ensure_ascii=False, separators=(",", ":")))
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print(
        "pricing ratio",
        OUR_MODEL_RATIO,
        "comp",
        OUR_COMPLETION_RATIO,
        "image_ratio",
        IMAGE_RATIO,
        "→",
        "$%.4f / $%.4f per 1M" % (SELL_IN, SELL_OUT),
    )

    cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,))
    vrow = cur.fetchone()
    if vrow is None:
        raise SystemExit("vendor missing: " + VENDOR)
    vid = vrow[0]

    m_cols = cols(cur, "models")
    for m in MODELS:
        mid = m["id"]
        desc = m["desc"]
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
            cur.execute("SELECT COUNT(*) FROM abilities WHERE model=?", (mid,))
            if cur.fetchone()[0] == 0 and ab_src:
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
            {
                "ok": True,
                "models": [m["id"] for m in MODELS],
                "sell_in_usd_per_m": round(SELL_IN, 6),
                "sell_out_usd_per_m": round(SELL_OUT, 6),
                "our_model_ratio": OUR_MODEL_RATIO,
                "our_completion_ratio": OUR_COMPLETION_RATIO,
                "image_ratio": IMAGE_RATIO,
                "markup": MARKUP,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
