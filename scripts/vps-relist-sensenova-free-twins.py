#!/usr/bin/env python3
"""Relist the 4 SenseNova free twins on the Keyo Free channel (ModelPrice=0).

  glm-5.2:free          -> glm-5.2        (智谱 / ChatGLM.Color)
  kimi-k3:free          -> kimi-k3        (Moonshot / Moonshot)
  deepseek-v4-pro:free  -> deepseek-v4-pro   (DeepSeek / DeepSeek)
  deepseek-v4-flash:free -> deepseek-v4-flash (DeepSeek / DeepSeek)

The ":free" suffix is required: new-api's FreeModelTwin (model/gift_models.go)
only strips ":free" to find the paid twin, which is what routes these IDs into
the gift-credit billing path. A "-free" suffix is not recognised. Any legacy
"-free" rows are retired by this script (see LEGACY_FREE).

Tags follow the new convention: 大语言模型 only (free = price-based filter).
Key: SENSENOVA_API_KEY / SENSENOVA_TOKEN in env or /opt/ai-relay/.env, or argv[2].
Public copy must NOT name SenseNova.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "config", "sensenova-free-models.json")
CHANNEL_NAME = "Keyo Free"
FREE_BASE = "https://token.sensenova.cn"
ENDPOINTS = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))

# The 2026-10-06 relist used a "-free" suffix, which new-api's FreeModelTwin
# (model/gift_models.go) does not recognise -- it only strips ":free". Those IDs
# were billed off the 37.5 fallback ratio and never entered the gift-credit path.
# They are retired here so the ":free" IDs are the only free entries in the DB.
LEGACY_FREE = [
    "glm-5.2-free",
    "kimi-k3-free",
    "deepseek-v4-pro-free",
    "deepseek-v4-flash-free",
]


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def load_key():
    if len(sys.argv) > 2 and sys.argv[2].strip():
        return sys.argv[2].strip()
    for k in ("SENSENOVA_API_KEY", "SENSENOVA_TOKEN"):
        if os.environ.get(k):
            return os.environ[k].strip()
    for p in ("/opt/ai-relay/.env", os.path.join(ROOT, ".env")):
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8", errors="ignore"):
            t = line.strip()
            if not t or t.startswith("#") or "=" not in t:
                continue
            a, b = t.split("=", 1)
            if a.strip() in ("SENSENOVA_API_KEY", "SENSENOVA_TOKEN"):
                return b.strip().strip('"').strip("'")
    raise SystemExit("missing SENSENOVA_API_KEY (add it to /opt/ai-relay/.env)")


def ensure_vendor(cur, v_cols, name, icon, now):
    alias = {"GLM": "智谱", "ChatGLM": "智谱", "Zhipu": "智谱"}
    name = alias.get(name, name) or "其他"
    cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    fields, values = ["name"], [name]
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
    print("vendor created", name)
    return cur.lastrowid


def main():
    key = load_key()
    cfg = json.load(open(CFG, encoding="utf-8"))
    models = cfg["models"]
    free_base = (cfg.get("base_url") or FREE_BASE).rstrip("/")
    if free_base.endswith("/v1"):
        free_base = free_base[: -len("/v1")]
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    ids = [m["id"] for m in models]
    mapping = {m["id"]: m["upstream"] for m in models}
    mapping_json = json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))

    free_ch = None
    sql = "SELECT id, name, models FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    for cid, name, models_s in cur.execute(sql).fetchall():
        if name == CHANNEL_NAME or "sensenova" in (name or "").lower():
            free_ch = (cid, name, models_s or "")
            break

    if free_ch is None:
        fields = ["type", "key", "name", "base_url", "models", '"group"', "status"]
        values = [1, key, CHANNEL_NAME, free_base, ",".join(ids), "default", 1]
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
        print("channel created", cid, CHANNEL_NAME)
    else:
        cid, cname, models_s = free_ch
        parts = [p.strip() for p in models_s.split(",") if p.strip()]
        dropped = [p for p in parts if p in LEGACY_FREE]
        parts = [p for p in parts if p not in LEGACY_FREE]
        for mid in ids:
            if mid not in parts:
                parts.append(mid)
        sets = ["models=?", "key=?", "base_url=?", "status=1"]
        vals = [",".join(parts), key, free_base]
        if "model_mapping" in ch_cols:
            sets.append("model_mapping=?")
            vals.append(mapping_json)
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("channel updated", cid, cname, "models", len(parts))
        if dropped:
            print("legacy dropped from channel:", ",".join(dropped))

    def get_opt(k):
        row = cur.execute("SELECT value FROM options WHERE key=?", (k,)).fetchone()
        return row[0] if row else "{}"

    def put_opt(k, value):
        if cur.execute("SELECT key FROM options WHERE key=?", (k,)).fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (k, value))
        else:
            # Must bind k, not `key`: `key` here resolves to main()'s local
            # (the SenseNova API key), so the UPDATE matched zero rows and every
            # existing option silently kept its old value. That is why ModelPrice
            # never gained the free IDs and they fell back to ratio 37.5.
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, k))

    mr = json.loads(get_opt("ModelRatio") or "{}")
    cr = json.loads(get_opt("CompletionRatio") or "{}")
    mp = json.loads(get_opt("ModelPrice") or "{}")

    # Retire the legacy "-free" IDs: abilities, marketplace rows, ratio/price entries.
    for legacy in LEGACY_FREE:
        cur.execute("DELETE FROM abilities WHERE model=?", (legacy,))
        if "deleted_at" in m_cols:
            cur.execute("DELETE FROM models WHERE model_name=? AND deleted_at IS NOT NULL", (legacy,))
            cur.execute(
                "UPDATE models SET deleted_at=? WHERE model_name=? AND deleted_at IS NULL",
                (now, legacy),
            )
        else:
            cur.execute("DELETE FROM models WHERE model_name=?", (legacy,))
        mr.pop(legacy, None)
        cr.pop(legacy, None)
        mp.pop(legacy, None)
        print("legacy retired", legacy)

    for m in models:
        mid = m["id"]
        mr.pop(mid, None)
        cr.pop(mid, None)
        mp[mid] = 0
        vid = ensure_vendor(cur, v_cols, m.get("vendor") or "其他", m.get("icon"), now)
        desc = m.get("desc_zh") or mid
        if "deleted_at" in m_cols:
            cur.execute(
                "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
                (mid,),
            )
        model_sql = "SELECT id FROM models WHERE model_name=?"
        if "deleted_at" in m_cols:
            model_sql += " AND deleted_at IS NULL"
        mrow = cur.execute(model_sql, (mid,)).fetchone()
        if mrow is None:
            fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
            values = [mid, desc, m.get("icon") or "Custom", m.get("tags") or "大语言模型", vid, ENDPOINTS]
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
            vals = [desc, m.get("icon") or "Custom", m.get("tags") or "大语言模型", vid, ENDPOINTS]
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

        cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
        cur.execute(
            'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
            ("default", mid, cid, 1, 0, 1),
        )
        print("free", mid, "-> upstream", mapping.get(mid))

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt("CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    conn.commit()
    conn.close()
    print("count", len(models))
    print("DONE_RELIST_SENSENOVA_FREE_TWINS")


if __name__ == "__main__":
    main()
