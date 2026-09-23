#!/usr/bin/env python3
"""List OpenLux chat models on Keyo:

  gpt-6-sol / gpt-6-luna → cost × 5
  claude-opus-5-5        → cost × 2.5

Costs = cheapest OpenLux enable_group (model_ratio × group_ratio × 2).
New API: sell_in = model_ratio × 2 ; sell_out = sell_in × completion_ratio
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))

MODELS = [
    {
        "id": "gpt-6-sol",
        "cost_in": 0.07354,
        "cost_out": 0.3677,
        "markup": 5.0,
        "vendor": "OpenAI",
        "icon": "OpenAI",
        "desc": "GPT-6 Sol 高档对话模型，更强推理与复杂任务表现。",
        "ability_src": "gpt-6-astra",
    },
    {
        "id": "gpt-6-luna",
        "cost_in": 0.005883,
        "cost_out": 0.029415,
        "markup": 5.0,
        "vendor": "OpenAI",
        "icon": "OpenAI",
        "desc": "GPT-6 Luna 轻量高性价比对话模型，适合高频低成本场景。",
        "ability_src": "gpt-6-astra",
    },
    {
        "id": "claude-opus-5-5",
        "cost_in": 0.70588,
        "cost_out": 3.5294,
        "markup": 2.5,
        "vendor": "Anthropic",
        "icon": "Claude.Color",
        "desc": "Claude Opus 5.5：强力代理与编程，适合高难度任务。",
        "ability_src": "claude-opus-5",
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


def ensure_vendor(cur, v_cols, name, icon, now):
    row = cur.execute("SELECT id FROM vendors WHERE name=?", (name,)).fetchone()
    if row:
        return row[0]
    fields = ["name"]
    values = [name]
    if "icon" in v_cols:
        fields.append("icon")
        values.append(icon)
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
    return cur.lastrowid


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
            "INSERT INTO models(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
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
    cur.execute(sql)
    channels = cur.fetchall()

    target = None
    for cid, name, models, base in channels:
        blob = ((name or "") + " " + (base or "")).lower()
        if "openlux" in blob:
            target = (cid, name, models or "")
            break
    if target is None:
        raise SystemExit("OpenLux channel not found")

    cid, cname, models_s = target
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    for m in MODELS:
        mid = m["id"]
        if mid not in parts:
            parts.append(mid)
            print("channel_add", mid)
        else:
            print("channel_has", mid)
    merged = ",".join(parts)
    if "updated_time" in ch_cols:
        cur.execute(
            "UPDATE channels SET models=?, updated_time=? WHERE id=?",
            (merged, now, cid),
        )
    else:
        cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
    print("channel", cid, cname)

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    for m in MODELS:
        mid = m["id"]
        sell_in = round(m["cost_in"] * m["markup"], 6)
        sell_out = round(m["cost_out"] * m["markup"], 6)
        ratio = round(sell_in / 2.0, 6)
        comp = round(sell_out / sell_in, 6) if sell_in else 1.0
        mr[mid] = ratio
        cr[mid] = comp
        mp.pop(mid, None)
        vid = ensure_vendor(cur, v_cols, m["vendor"], m["icon"], now)
        upsert_model(cur, m_cols, mid, m["desc"], m["icon"], "大语言模型", vid, now)

        if "abilities" in tabs:
            ab_src = cur.execute(
                'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
                (m["ability_src"],),
            ).fetchall()
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            if ab_src:
                for g, _ch, en, pri, w in ab_src:
                    cur.execute(
                        'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                        (g, mid, cid, en, pri, w),
                    )
            else:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    ("default", mid, cid, 1, 0, 1),
                )
        print(
            "price",
            mid,
            "markup",
            m["markup"],
            "sell",
            sell_in,
            "/",
            sell_out,
            "ratio",
            ratio,
            "comp",
            comp,
        )

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        cur,
        "CompletionRatio",
        json.dumps(cr, ensure_ascii=False, separators=(",", ":")),
    )
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    con.commit()
    con.close()
    print("DONE_ADD_OPENLUX_GPT6_OPUS55")


if __name__ == "__main__":
    main()
