#!/usr/bin/env python3
"""Register UnoRouter paid chat models in New API (sell = cost × 2).

Key: UNOROUTER_API_KEY in /opt/ai-relay/.env (never print it).
Channel: \"Keyo Chat\" (separate from \"Keyo Chat Free\").
Public copy must NOT mention UnoRouter / cost / markup.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "config", "unorouter-paid-models.json")
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def read_key():
    k = os.environ.get("UNOROUTER_API_KEY", "").strip()
    if k:
        return k
    for p in ("/opt/ai-relay/.env", os.path.join(ROOT, ".env")):
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8", errors="ignore"):
            line = line.strip()
            if line.startswith("UNOROUTER_API_KEY=") and len(line) > 18:
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


def ensure_vendor(cur, v_cols, name, icon, now):
    row = cur.execute("SELECT id FROM vendors WHERE name=?", (name,)).fetchone()
    if row:
        if "icon" in v_cols and icon:
            cur.execute(
                "UPDATE vendors SET icon=? WHERE id=? AND (icon IS NULL OR icon='' OR icon='Custom')",
                (icon, row[0]),
            )
        return row[0]
    fields = ["name"]
    values = [name]
    if "icon" in v_cols:
        fields.append("icon")
        values.append(icon or "Custom")
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
    key = read_key()
    if not key.startswith("sk-"):
        raise SystemExit("set UNOROUTER_API_KEY in /opt/ai-relay/.env")
    cfg = json.load(open(CFG, encoding="utf-8"))
    models = cfg["models"]
    markup = float(cfg.get("markup") or 2)
    ch_name = cfg.get("channel_name") or "Keyo Chat"
    base_url = cfg["base_url"]
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    sql = "SELECT id, name, models FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    target = None
    for cid, name, models_s in cur.fetchall():
        if (name or "") == ch_name:
            target = (cid, name, models_s or "")
            break

    ids = [m["id"] for m in models]
    if target is None:
        fields = ["type", "key", "name", "base_url", "models", '"group"', "status"]
        values = [1, key, ch_name, base_url, ",".join(ids), "default", 1]
        use_f, use_v = [], []
        for f, v in zip(fields, values):
            col = f.strip('"')
            if col in ch_cols:
                use_f.append(f)
                use_v.append(v)
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
        print("channel created", cid, ch_name)
    else:
        cid, cname, models_s = target
        # Exact replace: Keyo Chat holds only models in this cfg (OpenLux-moved IDs stay off).
        old = [p.strip() for p in models_s.replace("\n", ",").split(",") if p.strip()]
        for mid in old:
            if mid not in ids:
                print("channel_drop", mid)
        for mid in ids:
            print("channel_set", mid)
        sets = ["models=?", "key=?", "base_url=?", "status=1"]
        vals = [",".join(ids), key, base_url]
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("channel updated", cid, cname, "models", len(ids))

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    for m in models:
        mid = m["id"]
        cost_in = float(m["cost_in"])
        cost_out = float(m["cost_out"])
        sell_in = round(cost_in * markup, 6)
        sell_out = round(cost_out * markup, 6)
        ratio = round(sell_in / 2.0, 6)
        comp = round(sell_out / sell_in, 6) if sell_in else 1.0
        mr[mid] = ratio
        cr[mid] = comp
        mp.pop(mid, None)
        vid = ensure_vendor(cur, v_cols, m["vendor"], m.get("icon") or "Custom", now)
        upsert_model(
            cur,
            m_cols,
            mid,
            m.get("desc_zh") or mid,
            m.get("icon") or "Custom",
            m.get("tags") or "大语言模型",
            vid,
            now,
        )
        if "abilities" in tabs:
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                ("default", mid, cid, 1, 0, 1),
            )
        print(
            "price",
            mid,
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
    conn.commit()
    conn.close()
    print("count", len(models))
    print("DONE_ADD_UNOROUTER_PAID")


if __name__ == "__main__":
    main()
