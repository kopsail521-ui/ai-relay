#!/usr/bin/env python3
"""Add gemini-4-argon / gemini-4-barium into New API sqlite:
channel models + pricing + vendor + marketplace metadata + abilities.
Sell = upstream cost × 5 → ~$0.7353 / $3.6765 per 1M in/out (ratio 0.36765, comp 5).
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
ABILITY_SRC = "gemini-3.8-flash"
CHANNEL_NEEDLES = ("openlux",)

MODELS = [
    {
        "id": "gemini-4-argon",
        "sell_in": 0.7353,
        "sell_out": 3.6765,
        "vendor": "Google",
        "icon": "Gemini.Color",
        "desc": "Gemini 4 Argon · 强编码·推理·多模态企业模型",
    },
    {
        "id": "gemini-4-barium",
        "sell_in": 0.7353,
        "sell_out": 3.6765,
        "vendor": "Google",
        "icon": "Gemini.Color",
        "desc": "Gemini 4 Barium · 百万上下文·法务金融漏洞推理原型",
    },
]


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def get_opt(cur, key):
    row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    return row[0] if row else "{}"


def put_opt(cur, key, value):
    if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))


def upsert_model(cur, m_cols, mid, desc, icon, tags, vid, now):
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (mid,),
        )
    row = cur.execute("SELECT id FROM models WHERE model_name=?", (mid,)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [mid, desc, icon, tags, vid, EP]
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
            "INSERT INTO models(%s) VALUES (%s)" % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        print("marketplace created", mid)
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
        vals = [desc, icon, tags, vid, EP]
        if "status" in m_cols:
            sets.append("status=1")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", mid)


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    target = None
    for cid, name, models, base in cur.execute(sql).fetchall():
        blob = ((name or "") + " " + (base or "")).lower()
        if any(n in blob for n in CHANNEL_NEEDLES):
            target = (cid, name, models or "")
            break
    if target is None:
        raise SystemExit("primary chat channel not found")

    cid, cname, models_s = target
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    ids = [m["id"] for m in MODELS]
    for mid in ids:
        if mid not in parts:
            parts.append(mid)
            print("channel_add", mid)
        else:
            print("channel_has", mid)
    merged = ",".join(parts)
    if "updated_time" in ch_cols:
        cur.execute("UPDATE channels SET models=?, updated_time=? WHERE id=?", (merged, now, cid))
    else:
        cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
    print("channel", cid, cname)

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    ab_src = []
    if "abilities" in tabs:
        ab_src = cur.execute(
            'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (ABILITY_SRC,),
        ).fetchall()

    for m in MODELS:
        mid = m["id"]
        sell_in = m["sell_in"]
        sell_out = m["sell_out"]
        ratio = round(sell_in / 2.0, 6)
        comp = round(sell_out / sell_in, 6) if sell_in else 1.0
        mr[mid] = ratio
        cr[mid] = comp
        mp.pop(mid, None)
        row = cur.execute("SELECT id FROM vendors WHERE name=?", (m["vendor"],)).fetchone()
        if row is None:
            fields = ["name"]
            values = [m["vendor"]]
            if "icon" in v_cols:
                fields.append("icon")
                values.append(m["icon"])
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
                "INSERT INTO vendors(%s) VALUES (%s)" % (",".join(fields), ",".join(["?"] * len(fields))),
                values,
            )
            vid = cur.lastrowid
        else:
            vid = row[0]
        upsert_model(cur, m_cols, mid, m["desc"], m["icon"], "大语言模型", vid, now)
        if "abilities" in tabs:
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            if ab_src:
                for g, ch, en, pri, w in ab_src:
                    cur.execute(
                        'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                        (g, mid, ch, en, pri, w),
                    )
            else:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    ("default", mid, cid, 1, 0, 1),
                )
        print("price", mid, "sell", sell_in, "/", sell_out, "ratio", ratio, "comp", comp)

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    con.commit()
    con.close()
    print("DONE_ADD_GEMINI4")


if __name__ == "__main__":
    main()
