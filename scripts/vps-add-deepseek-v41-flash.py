#!/usr/bin/env python3
"""Add OpenLux deepseek-v4.1-flash (sell = cost × 3) into New API sqlite.

OpenLux (Self-Deployed-2, ratio 0.5):
  model_ratio=0.15 completion=4 → cost $0.15 / $0.60 per MTok
  sell ×3 → $0.45 / $1.80 → ModelRatio=0.225 CompletionRatio=4
Public copy must NOT mention OpenLux / markup.
"""
import json
import os
import sqlite3
import sys
import time

MODEL = "deepseek-v4.1-flash"
OUR_MODEL_RATIO = 0.225  # sell_in $0.45 / MTok (baseline $2)
OUR_COMPLETION_RATIO = 4
SELL_IN = 0.45
SELL_OUT = 1.80
TAG = "大语言模型"
VENDOR = "DeepSeek"
ICON = "DeepSeek.Color"  # paid = blue
ENDPOINTS = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
DESC = (
    "DeepSeek V4.1 Flash：更快更省的对话与代码模型。"
    " 约 $%.2f / $%.2f 每百万 tokens。" % (SELL_IN, SELL_OUT)
)
ABILITY_SRC = "deepseek-v4-flash"


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
        if "openlux" in blob or "keyo primary" in (name or "").lower():
            target = (cid, name, models or "")
            break
    if target is None:
        for cid, name, models, base in channels:
            ms = [x.strip() for x in (models or "").split(",") if x.strip()]
            if ABILITY_SRC in ms:
                target = (cid, name, models or "")
                break
    if target is None:
        raise SystemExit("Keyo Primary / OpenLux channel not found")

    cid, cname, models_s = target
    new_name = cname
    if "openlux" in (cname or "").lower() or "上游" in (cname or ""):
        new_name = "Keyo Primary"
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    if MODEL not in parts:
        parts.insert(0, MODEL)
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
        print("channel", cid, new_name, "added", MODEL)
    else:
        if new_name != cname:
            if "updated_time" in ch_cols:
                cur.execute(
                    "UPDATE channels SET name=?, updated_time=? WHERE id=?",
                    (new_name, now, cid),
                )
            else:
                cur.execute("UPDATE channels SET name=? WHERE id=?", (new_name, cid))
        print("channel", cid, new_name, "already has", MODEL)

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
    mr[MODEL] = OUR_MODEL_RATIO
    cr[MODEL] = OUR_COMPLETION_RATIO
    mp.pop(MODEL, None)
    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":"))
    )
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing ratio", OUR_MODEL_RATIO, "comp", OUR_COMPLETION_RATIO)

    cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,))
    vrow = cur.fetchone()
    if vrow is None:
        raise SystemExit("vendor missing: " + VENDOR)
    vid = vrow[0]

    m_cols = cols(cur, "models")
    model_sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        model_sql += " AND deleted_at IS NULL"
    cur.execute(model_sql, (MODEL,))
    mrow = cur.fetchone()
    if mrow is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [MODEL, DESC, ICON, TAG, vid, ENDPOINTS]
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
        print("marketplace created", MODEL)
    else:
        sets = [
            "description=?",
            "icon=?",
            "tags=?",
            "vendor_id=?",
            "endpoints=?",
        ]
        vals = [DESC, ICON, TAG, vid, ENDPOINTS]
        if "status" in m_cols:
            sets.append("status=1")
        if "sync_official" in m_cols:
            sets.append("sync_official=0")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(mrow[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", MODEL)

    try:
        cur.execute(
            'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (ABILITY_SRC,),
        )
        ab_src = cur.fetchall()
        cur.execute("DELETE FROM abilities WHERE model=?", (MODEL,))
        if ab_src:
            for g, ch, en, pri, w in ab_src:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    (g, MODEL, ch, en, pri, w),
                )
            print("abilities copied from", ABILITY_SRC + ":", len(ab_src))
        else:
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                ("default", MODEL, cid, 1, 0, 1),
            )
            print("abilities ensured for default / channel", cid)
    except Exception as e:
        print("abilities skip:", e)

    conn.commit()
    conn.close()
    print(
        json.dumps(
            {
                "ok": True,
                "model": MODEL,
                "markup": 3,
                "cost_in_usd": 0.15,
                "cost_out_usd": 0.6,
                "sell_in_usd": SELL_IN,
                "sell_out_usd": SELL_OUT,
                "our_model_ratio": OUR_MODEL_RATIO,
                "our_completion_ratio": OUR_COMPLETION_RATIO,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
