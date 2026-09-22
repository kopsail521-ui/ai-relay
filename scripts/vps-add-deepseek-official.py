#!/usr/bin/env python3
"""
List DeepSeek official API models on Keyo (New API sqlite).

Public IDs (Keyo):
  deepseek-v4.1-flash  → upstream deepseek-flash
  deepseek-v4-pro-0813 → upstream deepseek-v4-pro

Sell = official peak (cache-miss) × 1.2
  Flash peak $0.30 / $1.20 → sell $0.36 / $1.44
  Pro   peak $1.32 / $3.96 → sell $1.584 / $4.752

Key: DEEPSEEK_API_KEY in env or /opt/ai-relay/.env (never print it).
Docs: https://api-docs.deepseek.com/zh-cn/
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

CHANNEL_NAME = "Keyo DeepSeek"
BASE_URL = "https://api.deepseek.com"
TAG = "大语言模型"
VENDOR = "DeepSeek"
ICON = "DeepSeek.Color"
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
MARKUP = 1.2

# peak cache-miss USD / 1M from https://api-docs.deepseek.com/quick_start/pricing
MODELS = [
    {
        "id": "deepseek-v4.1-flash",
        "upstream": "deepseek-flash",
        "peak_in": 0.30,
        "peak_out": 1.20,
        "desc": "DeepSeek V4.1 Flash · 官方高峰价×1.2 · 1M 上下文",
    },
    {
        "id": "deepseek-v4-pro-0813",
        "upstream": "deepseek-v4-pro",
        "peak_in": 1.32,
        "peak_out": 3.96,
        "desc": "DeepSeek V4 Pro 0813 · 官方高峰价×1.2 · 1M 上下文",
    },
]


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def read_key():
    k = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    if k:
        return k
    for p in ("/opt/ai-relay/.env",):
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8", errors="ignore"):
            line = line.strip()
            if line.startswith("DEEPSEEK_API_KEY=") and len(line) > 18:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def get_opt(cur, key):
    row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    return row[0] if row else "{}"


def put_opt(cur, key, value):
    if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))


def ensure_vendor(cur, v_cols, now):
    row = cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,)).fetchone()
    if row:
        if "icon" in v_cols:
            cur.execute(
                "UPDATE vendors SET icon=? WHERE id=? AND (icon IS NULL OR icon='' OR icon='Custom')",
                (ICON, row[0]),
            )
        return row[0]
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
    return cur.lastrowid


def upsert_model(cur, m_cols, mid, desc, vid, now):
    # revive soft-deleted
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (mid,),
        )
        if cur.rowcount:
            print("undelete", mid, cur.rowcount)
    row = cur.execute("SELECT id FROM models WHERE model_name=?", (mid,)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [mid, desc, ICON, TAG, vid, EP]
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
        vals = [desc, ICON, TAG, vid, EP]
        if "status" in m_cols:
            sets.append("status=1")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "sync_official" in m_cols:
            sets.append("sync_official=0")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", mid)


def main():
    key = read_key()
    if not key.startswith("sk-"):
        raise SystemExit("set DEEPSEEK_API_KEY in /opt/ai-relay/.env")

    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    con = sqlite3.connect(db_path)
    cur = con.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    ids = [m["id"] for m in MODELS]
    mapping = {m["id"]: m["upstream"] for m in MODELS}
    mapping_json = json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))

    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    target = None
    for cid, name, models_s, base in cur.fetchall():
        blob = ((name or "") + " " + (base or "")).lower()
        if "api.deepseek.com" in blob or (name or "") == CHANNEL_NAME:
            target = cid
            break

    if target is None:
        fields = ['type', "key", "name", "base_url", "models", '"group"', "status"]
        values = [1, key, CHANNEL_NAME, BASE_URL, ",".join(ids), "default", 1]
        use_f, use_v = [], []
        for f, v in zip(fields, values):
            col = f.strip('"')
            if col in ch_cols:
                use_f.append(f)
                use_v.append(v)
        if "model_mapping" in ch_cols:
            use_f.append("model_mapping")
            use_v.append(mapping_json)
        if "created_time" in ch_cols:
            use_f.append("created_time")
            use_v.append(now)
        if "updated_time" in ch_cols:
            use_f.append("updated_time")
            use_v.append(now)
        cur.execute(
            "INSERT INTO channels(%s) VALUES (%s)"
            % (",".join(use_f), ",".join(["?"] * len(use_f))),
            use_v,
        )
        cid = cur.lastrowid
        print("channel created", cid)
    else:
        cid = target
        sets = ["models=?", "key=?", "base_url=?", "name=?", "status=1"]
        vals = [",".join(ids), key, BASE_URL, CHANNEL_NAME]
        if "model_mapping" in ch_cols:
            sets.append("model_mapping=?")
            vals.append(mapping_json)
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("channel updated", cid)

    vid = ensure_vendor(cur, v_cols, now)

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    for m in MODELS:
        mid = m["id"]
        sell_in = round(m["peak_in"] * MARKUP, 6)
        sell_out = round(m["peak_out"] * MARKUP, 6)
        ratio = round(sell_in / 2.0, 6)
        comp = round(sell_out / sell_in, 6) if sell_in else 1.0
        mr[mid] = ratio
        cr[mid] = comp
        mp.pop(mid, None)
        upsert_model(cur, m_cols, mid, m["desc"], vid, now)
        if "abilities" in tabs:
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                ("default", mid, cid, 1, 0, 1),
            )
        print(
            "price",
            mid,
            "→",
            m["upstream"],
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
    print("DONE_ADD_DEEPSEEK_OFFICIAL")


if __name__ == "__main__":
    main()
