#!/usr/bin/env python3
"""Add free chat models via Token Plan OpenAI-compatible endpoint into New API sqlite.

Public: ModelPrice=0, tags include 免费, channel name Keyo Free (no supplier).
API model ids stay without locale suffix; display names are i18n'd in moderation proxy.
"""
import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "config", "sensenova-free-models.json")
ENDPOINTS = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
CHANNEL_NAME = "Keyo Free"
BASE_URL = "https://token.sensenova.cn"


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def load_key():
    if len(sys.argv) > 2 and sys.argv[2].strip():
        return sys.argv[2].strip()
    env_key = os.environ.get("SENSENOVA_API_KEY") or os.environ.get("SENSENOVA_TOKEN")
    if env_key:
        return env_key.strip()
    env_path = os.path.join(ROOT, ".env")
    if os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8", errors="ignore"):
            t = line.strip()
            if not t or t.startswith("#") or "=" not in t:
                continue
            k, v = t.split("=", 1)
            if k.strip() in ("SENSENOVA_API_KEY", "SENSENOVA_TOKEN"):
                return v.strip().strip('"').strip("'")
    raise SystemExit("missing SENSENOVA_API_KEY (argv[2] or env /.env)")


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    cfg = json.load(open(CFG, encoding="utf-8"))
    models = cfg["models"]
    base = (cfg.get("base_url") or BASE_URL).rstrip("/").rstrip("/v1")
    key = load_key()
    now = int(time.time())

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    ch_cols = cols(cur, "channels")

    sql = "SELECT id, name, models, base_url, key FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    channels = cur.fetchall()

    target = None
    for cid, name, models_s, buri, _k in channels:
        blob = ((name or "") + " " + (buri or "")).lower()
        if "sensenova" in blob or name == CHANNEL_NAME or "token.sensenova" in blob:
            target = (cid, name, models_s or "")
            break

    model_ids = [m["id"] for m in models]
    models_csv = ",".join(model_ids)

    if target is None:
        fields = ["type", "key", "name", "base_url", "models", '"group"', "status"]
        values = [1, key, CHANNEL_NAME, base, models_csv, "default", 1]
        extras = [
            ("priority", 0),
            ("weight", 0),
            ("created_time", now),
            ("updated_time", now),
        ]
        for opt, val in extras:
            if opt in ch_cols:
                fields.append(opt)
                values.append(val)
        use_f, use_v = [], []
        for f, v in zip(fields, values):
            col = f.strip('"')
            if col in ch_cols:
                use_f.append(f)
                use_v.append(v)
        cur.execute(
            "INSERT INTO channels(%s) VALUES (%s)"
            % (",".join(use_f), ",".join(["?"] * len(use_f))),
            use_v,
        )
        cid = cur.lastrowid
        print("channel created", cid, CHANNEL_NAME)
    else:
        cid, cname, models_s = target
        parts = [p.strip() for p in (models_s or "").split(",") if p.strip()]
        for mid in model_ids:
            if mid not in parts:
                parts.insert(0, mid)
        merged = ",".join(parts)
        sets = ["models=?", "name=?", "base_url=?", "key=?"]
        vals = [merged, CHANNEL_NAME, base, key]
        if "status" in ch_cols:
            sets.append("status=1")
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("channel updated", cid, CHANNEL_NAME)

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

    m_cols = cols(cur, "models")

    def ensure_vendor(name):
        alias = {"ChatGLM": "智谱", "Zhipu": "智谱", "Other": "其他"}
        name = alias.get(name, name) or "其他"
        cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
        row = cur.fetchone()
        if row:
            return row[0]
        fields = ["name"]
        values = [name]
        if "created_time" in cols(cur, "vendors"):
            fields.append("created_time")
            values.append(now)
        if "updated_time" in cols(cur, "vendors"):
            fields.append("updated_time")
            values.append(now)
        cur.execute(
            "INSERT INTO vendors(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        return cur.lastrowid

    for m in models:
        mid = m["id"]
        mr.pop(mid, None)
        cr.pop(mid, None)
        mp[mid] = 0  # free
        vid = ensure_vendor(m["vendor"])
        tags = m.get("tags") or "大语言模型,免费"
        desc = m.get("desc_zh") or mid
        icon = m.get("icon") or m["vendor"]

        model_sql = "SELECT id FROM models WHERE model_name=?"
        if "deleted_at" in m_cols:
            model_sql += " AND deleted_at IS NULL"
        cur.execute(model_sql, (mid,))
        row = cur.fetchone()
        if row is None:
            fields = [
                "model_name",
                "description",
                "icon",
                "tags",
                "vendor_id",
                "endpoints",
            ]
            values = [mid, desc, icon, tags, vid, ENDPOINTS]
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
            sets = [
                "description=?",
                "icon=?",
                "tags=?",
                "vendor_id=?",
                "endpoints=?",
            ]
            vals = [desc, icon, tags, vid, ENDPOINTS]
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

        try:
            cur.execute("SELECT COUNT(*) FROM abilities WHERE model=?", (mid,))
            if cur.fetchone()[0] == 0:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    ("default", mid, cid, 1, 0, 1),
                )
                print("abilities", mid, "->", cid)
        except Exception as e:
            print("abilities skip", mid, e)

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":"))
    )
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing ModelPrice=0 for", model_ids)

    conn.commit()
    conn.close()
    print(json.dumps({"ok": True, "models": model_ids, "channel": CHANNEL_NAME}, ensure_ascii=False))


if __name__ == "__main__":
    main()
