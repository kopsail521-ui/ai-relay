#!/usr/bin/env python3
"""Add OpenLux model claude-fable-5-1 into New API sqlite (channel + pricing + marketplace)."""
import json
import os
import sqlite3
import sys
import time

MODEL = "claude-fable-5-1"
OUR_MODEL_RATIO = 7.353
OUR_COMPLETION_RATIO = 5
TAG = "大语言模型"
VENDOR = "Anthropic"
ICON = "Claude.Color"
ENDPOINTS = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
DESC = "Claude 旗舰 5.1 · 长周期 Agent / 复杂编码 / 重度知识分析"


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
            if "claude-fable-5" in ms:
                target = (cid, name, models or "")
                break
    if target is None:
        raise SystemExit("OpenLux channel not found")

    cid, cname, models = target
    parts = [p.strip() for p in models.split(",") if p.strip()]
    if MODEL not in parts:
        parts.append(MODEL)
        merged = ",".join(parts)
        if "updated_time" in ch_cols:
            cur.execute(
                "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                (merged, now, cid),
            )
        else:
            cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
        print("channel", cid, cname, "added", MODEL)
    else:
        print("channel", cid, cname, "already has", MODEL)

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
            ("claude-fable-5",),
        )
        ab_src = cur.fetchall()
        cur.execute("SELECT COUNT(*) FROM abilities WHERE model=?", (MODEL,))
        if cur.fetchone()[0] == 0 and ab_src:
            for g, ch, en, pri, w in ab_src:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    (g, MODEL, ch, en, pri, w),
                )
            print("abilities copied from claude-fable-5:", len(ab_src))
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
                "sell_in_usd": 14.706,
                "sell_out_usd": 73.53,
                "our_model_ratio": OUR_MODEL_RATIO,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
