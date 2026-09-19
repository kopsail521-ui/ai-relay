#!/usr/bin/env python3
"""Register UnoRouter free chat models in New API.

Key: UNOROUTER_API_KEY in env or /opt/ai-relay/.env (never print it).
Public price: $0. Upstream name must not appear in marketplace copy.
"""
import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "config", "unorouter-free-models.json")
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


def ensure_vendor(cur, v_cols, name, icon, now):
    cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
    row = cur.fetchone()
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
    if "description" in v_cols:
        fields.append("description")
        values.append("")
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
    sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    cur.execute(sql, (mid,))
    row = cur.fetchone()
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
        raise SystemExit("set UNOROUTER_API_KEY in /opt/ai-relay/.env")
    cfg = json.load(open(CFG, encoding="utf-8"))
    models = cfg["models"]
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    sql = "SELECT id, name, models, base_url, key FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    target = None
    for cid, name, models_s, base, ckey in cur.fetchall():
        blob = ((name or "") + " " + (base or "")).lower()
        if "unorouter" in blob or (name or "") == cfg.get("channel_name"):
            target = (cid, name, models_s or "")
            break

    ids = [m["id"] for m in models]
    if target is None:
        fields = ["type", "key", "name", "base_url", "models", '"group"', "status"]
        values = [1, key, cfg.get("channel_name") or "Keyo Chat Free", cfg["base_url"], ",".join(ids), "default", 1]
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
        print("channel created", cid)
    else:
        cid, cname, models_s = target
        parts = [p.strip() for p in models_s.split(",") if p.strip()]
        for mid in ids:
            if mid not in parts:
                parts.append(mid)
        sets = ["models=?", "key=?", "base_url=?", "status=1"]
        vals = [",".join(parts), key, cfg["base_url"]]
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("channel updated", cid, cname, "models", len(parts))

    def get_opt(k):
        cur.execute("SELECT value FROM options WHERE key=?", (k,))
        row = cur.fetchone()
        return row[0] if row else "{}"

    def put_opt(k, value):
        cur.execute("SELECT key FROM options WHERE key=?", (k,))
        if cur.fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (k, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, k))

    mr = json.loads(get_opt("ModelRatio") or "{}")
    cr = json.loads(get_opt("CompletionRatio") or "{}")
    mp = json.loads(get_opt("ModelPrice") or "{}")

    for m in models:
        mid = m["id"]
        mr.pop(mid, None)
        cr.pop(mid, None)
        mp[mid] = 0
        vid = ensure_vendor(cur, v_cols, m["vendor"], m["icon"], now)
        upsert_model(cur, m_cols, mid, m.get("desc_zh") or mid, m["icon"], m.get("tags") or "大语言模型,免费", vid, now)
        cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
        cur.execute(
            'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
            ("default", mid, cid, 1, 0, 1),
        )
        print("free", mid)

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt("CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    conn.commit()
    conn.close()
    print("count", len(models))
    print("DONE_ADD_UNOROUTER_FREE")


if __name__ == "__main__":
    main()
