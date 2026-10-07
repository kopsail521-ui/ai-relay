#!/usr/bin/env python3
"""Add Grsai nano-banana-2.1 onto the Keyo Images channel.

Grsai cost (CNY / request, operator-confirmed 2026-10-06): ¥0.06
FX=7.3 · sell = cost × 1.5 → $0.012329 / request → ModelPrice
Public copy must NOT mention Grsai / cost / markup.
"""
import json
import os
import sqlite3
import sys
import time

FX = 7.3
COST_CNY = 0.06
MARKUP = 1.5
TAG = "图片"
VENDOR = "Google"
ICON = "Gemini.Color"
ENDPOINTS = json.dumps(
    {"image-generation": "/v1/images/generations"}, separators=(",", ":")
)
ABILITY_SRC = "nano-banana-2"
MODEL_ID = "nano-banana-2.1"
SELL_USD = round(COST_CNY / FX * MARKUP, 6)
DESC = "Nano Banana 2.1：新一代出图模型，速度快、效果好，按张计费。 计费：$0.0123/次。"


def sell_usd(cost_cny):
    return (cost_cny / FX) * MARKUP


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    target = None
    for cid, name, models, base in cur.execute(sql).fetchall():
        blob = ((name or "") + " " + (base or "")).lower()
        if "grsai" in blob or "keyo images" in (name or "").lower():
            target = (cid, name, models or "")
            break
    if target is None:
        for cid, name, models, base in cur.execute(sql).fetchall():
            ms = [x.strip() for x in (models or "").split(",") if x.strip()]
            if ABILITY_SRC in ms:
                target = (cid, name, models or "")
                break
    if target is None:
        raise SystemExit("Grsai/Keyo Images channel not found")

    cid, cname, models_s = target
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    if MODEL_ID not in parts:
        parts.insert(0, MODEL_ID)
        merged = ",".join(parts)
        if "updated_time" in ch_cols:
            cur.execute(
                "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                (merged, now, cid),
            )
        else:
            cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
        print("channel", cid, cname, "added", MODEL_ID)
    else:
        print("channel", cid, cname, "already has", MODEL_ID)

    def get_opt(key):
        row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
        return row[0] if row else "{}"

    def put_opt(key, value):
        if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))

    sell = SELL_USD if SELL_USD else sell_usd(COST_CNY)
    mr = json.loads(get_opt("ModelRatio") or "{}")
    cr = json.loads(get_opt("CompletionRatio") or "{}")
    mp = json.loads(get_opt("ModelPrice") or "{}")
    mr.pop(MODEL_ID, None)
    cr.pop(MODEL_ID, None)
    mp[MODEL_ID] = sell
    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt("CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing: ModelPrice", MODEL_ID, "= $%s / request" % sell)

    row = cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,)).fetchone()
    if row:
        vid = row[0]
    else:
        fields = ["name"]
        values = [VENDOR]
        if "icon" in v_cols:
            fields.append("icon")
            values.append(ICON)
        if "status" in v_cols:
            fields.append("status")
            values.append(1)
        if "created_time" in v_cols:
            fields.append("created_time")
            values.append(now)
        if "updated_time" in v_cols:
            fields.append("updated_time")
            values.append(now)
        cur.execute(
            "INSERT INTO vendors(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        vid = cur.lastrowid
        print("vendor created", VENDOR)

    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (MODEL_ID,),
        )
    model_sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        model_sql += " AND deleted_at IS NULL"
    mrow = cur.execute(model_sql, (MODEL_ID,)).fetchone()
    if mrow is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [MODEL_ID, DESC, ICON, TAG, vid, ENDPOINTS]
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
        cur.execute(
            "INSERT INTO models(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        print("marketplace created", MODEL_ID)
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
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
        print("marketplace updated", MODEL_ID)

    try:
        ab_src = cur.execute(
            'SELECT "group", enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (ABILITY_SRC,),
        ).fetchall()
        cur.execute("DELETE FROM abilities WHERE model=?", (MODEL_ID,))
        if ab_src:
            for g, en, pri, w in ab_src:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    (g, MODEL_ID, cid, en, pri, w),
                )
            print("abilities copied from", ABILITY_SRC, "-> channel", cid, ":", len(ab_src))
        else:
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                ("default", MODEL_ID, cid, 1, 0, 1),
            )
            print("abilities ensured default / channel", cid)
    except Exception as e:
        print("abilities skip:", e)

    conn.commit()
    conn.close()
    print(
        "DONE_ADD_GRSAI_NANO21 sell=$%s cost_cny=%s markup=%s"
        % (sell, COST_CNY, MARKUP)
    )


if __name__ == "__main__":
    main()
