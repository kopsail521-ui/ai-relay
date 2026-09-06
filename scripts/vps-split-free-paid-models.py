#!/usr/bin/env python3
"""Migrate free models to *-free IDs + ensure paid bare IDs on OpenLux.

Free (Keyo Free / Token Plan):
  deepseek-v4-pro-free  --map--> deepseek-v4-pro   ModelPrice=0
Paid (Keyo Primary / OpenLux):
  deepseek-v4-pro  ModelRatio from openlux-chat-catalog (×5 sell)
Same for flash / glm-5.2 / kimi-k3.
"""
import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FREE_CFG = os.path.join(ROOT, "config", "sensenova-free-models.json")
PAID_CATALOG = os.path.join(ROOT, "config", "openlux-chat-catalog.json")
ENDPOINTS = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
FREE_CHANNEL = "Keyo Free"
PAID_CHANNEL = "Keyo Primary"
FREE_BASE = "https://token.sensenova.cn"

# legacy bare IDs that were incorrectly used as free
LEGACY_BARE = [
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "glm-5.2",
    "kimi-k3",
]


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def load_key():
    if len(sys.argv) > 2 and sys.argv[2].strip():
        return sys.argv[2].strip()
    for k in ("SENSENOVA_API_KEY", "SENSENOVA_TOKEN"):
        if os.environ.get(k):
            return os.environ[k].strip()
    env_path = os.path.join(ROOT, ".env")
    if os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8", errors="ignore"):
            t = line.strip()
            if not t or t.startswith("#") or "=" not in t:
                continue
            a, b = t.split("=", 1)
            if a.strip() in ("SENSENOVA_API_KEY", "SENSENOVA_TOKEN"):
                return b.strip().strip('"').strip("'")
    raise SystemExit("missing SENSENOVA_API_KEY")


def get_opt(cur, k):
    cur.execute("SELECT value FROM options WHERE key=?", (k,))
    row = cur.fetchone()
    return row[0] if row else "{}"


def put_opt(cur, k, value):
    cur.execute("SELECT key FROM options WHERE key=?", (k,))
    if cur.fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (k, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, k))


def ensure_vendor(cur, v_cols, name, now):
    alias = {"ChatGLM": "智谱", "Zhipu": "智谱", "Other": "其他"}
    name = alias.get(name, name) or "其他"
    cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    fields, values = ["name"], [name]
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


def upsert_marketplace(cur, m_cols, model_name, desc, icon, tags, vid, now, status=1):
    sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    cur.execute(sql, (model_name,))
    row = cur.fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [model_name, desc, icon, tags, vid, ENDPOINTS]
        if "status" in m_cols:
            fields.append("status")
            values.append(status)
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
        print("marketplace created", model_name)
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
            sets.append("status=%d" % status)
        if "sync_official" in m_cols:
            sets.append("sync_official=0")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", model_name)


def set_abilities(cur, model, channel_id, only_this_channel=True):
    if only_this_channel:
        try:
            cur.execute("DELETE FROM abilities WHERE model=?", (model,))
        except Exception as e:
            print("abilities clear skip", model, e)
    cur.execute(
        'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
        ("default", model, channel_id, 1, 0, 1),
    )


def find_channel(cur, ch_cols, pred):
    sql = "SELECT id, name, models, base_url, key FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    if "model_mapping" in ch_cols:
        sql = sql.replace(
            "SELECT id, name, models, base_url, key",
            "SELECT id, name, models, base_url, key, model_mapping",
        )
    cur.execute(sql)
    rows = cur.fetchall()
    for row in rows:
        cid, name, models_s, buri, key = row[0], row[1], row[2], row[3], row[4]
        mapping = row[5] if len(row) > 5 else None
        if pred(cid, name, models_s, buri, key):
            return {
                "id": cid,
                "name": name,
                "models": models_s or "",
                "base_url": buri,
                "key": key,
                "mapping": mapping,
            }
    return None


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    free_cfg = json.load(open(FREE_CFG, encoding="utf-8"))
    free_models = free_cfg["models"]
    paid_by_id = {}
    if os.path.exists(PAID_CATALOG):
        cat = json.load(open(PAID_CATALOG, encoding="utf-8"))
        for m in cat.get("models") or []:
            paid_by_id[m.get("model")] = m

    key = load_key()
    now = int(time.time())
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    # ---------- Free channel ----------
    free_ch = find_channel(
        cur,
        ch_cols,
        lambda cid, name, models_s, buri, k: (
            name == FREE_CHANNEL
            or "sensenova" in ((name or "") + " " + (buri or "")).lower()
            or "token.sensenova" in ((buri or "").lower())
        ),
    )
    public_ids = [m["id"] for m in free_models]
    mapping = {m["id"]: m["upstream"] for m in free_models}
    mapping_json = json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))
    models_csv = ",".join(public_ids)
    free_base = (free_cfg.get("base_url") or FREE_BASE).rstrip("/").rstrip("/v1")

    if free_ch is None:
        fields = ["type", "key", "name", "base_url", "models", '"group"', "status"]
        values = [1, key, FREE_CHANNEL, free_base, models_csv, "default", 1]
        for opt, val in (
            ("priority", 0),
            ("weight", 0),
            ("created_time", now),
            ("updated_time", now),
            ("model_mapping", mapping_json),
        ):
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
        free_id = cur.lastrowid
        print("free channel created", free_id)
    else:
        free_id = free_ch["id"]
        sets = ["models=?", "name=?", "base_url=?", "key=?"]
        vals = [models_csv, FREE_CHANNEL, free_base, key]
        if "model_mapping" in ch_cols:
            sets.append("model_mapping=?")
            vals.append(mapping_json)
        if "status" in ch_cols:
            sets.append("status=1")
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(free_id)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("free channel updated", free_id, "mapping", mapping_json)

    # ---------- Paid OpenLux channel ----------
    paid_ch = find_channel(
        cur,
        ch_cols,
        lambda cid, name, models_s, buri, k: (
            name == PAID_CHANNEL
            or "openlux" in ((name or "") + " " + (buri or "")).lower()
            or any(
                x in (models_s or "")
                for x in ("gpt-5.6-luna", "gpt-6-astra", "claude-fable-5-1")
            )
        ),
    )
    if paid_ch is None:
        raise SystemExit("paid OpenLux / Keyo Primary channel not found")
    paid_id = paid_ch["id"]
    paid_parts = [p.strip() for p in (paid_ch["models"] or "").split(",") if p.strip()]
    # ensure bare paid IDs on paid channel; remove accidental *-free
    for bare in LEGACY_BARE:
        if bare not in paid_parts:
            paid_parts.insert(0, bare)
    paid_parts = [p for p in paid_parts if not p.endswith("-free")]
    # remove bare IDs from being ONLY on free — already free channel only has *-free
    paid_merged = ",".join(paid_parts)
    paid_sets = ["models=?", "name=?"]
    paid_vals = [paid_merged, PAID_CHANNEL]
    if "updated_time" in ch_cols:
        paid_sets.append("updated_time=?")
        paid_vals.append(now)
    paid_vals.append(paid_id)
    cur.execute(
        "UPDATE channels SET %s WHERE id=?" % ",".join(paid_sets), paid_vals
    )
    print("paid channel", paid_id, PAID_CHANNEL, "has bare twins")

    # ---------- Pricing + marketplace ----------
    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    meta = {
        "deepseek-v4-pro": ("DeepSeek", "DeepSeek", "DeepSeek V4 Pro 旗舰对话与推理（按量付费）。"),
        "deepseek-v4-flash": ("DeepSeek", "DeepSeek", "DeepSeek V4 Flash 高速对话（按量付费）。"),
        "glm-5.2": ("智谱", "ChatGLM.Color", "GLM 5.2 旗舰对话与编码（按量付费）。"),
        "kimi-k3": ("Moonshot", "Moonshot", "Kimi K3 长上下文对话（按量付费）。"),
    }

    for m in free_models:
        fid, up = m["id"], m["upstream"]
        # free pricing
        mr.pop(fid, None)
        cr.pop(fid, None)
        mp[fid] = 0
        # clear legacy free price on bare if we are converting bare to paid
        # (paid ratios set below)
        vid = ensure_vendor(cur, v_cols, m["vendor"], now)
        upsert_marketplace(
            cur,
            m_cols,
            fid,
            m.get("desc_zh") or fid,
            m.get("icon") or m["vendor"],
            m.get("tags") or "大语言模型,免费",
            vid,
            now,
        )
        set_abilities(cur, fid, free_id, only_this_channel=True)
        print("free ok", fid, "->", up)

        # paid twin
        cat = paid_by_id.get(up) or {}
        our_mr = float(cat.get("our_model_ratio") or 0)
        our_cr = float(cat.get("our_completion_ratio") or 1)
        if our_mr <= 0:
            # fallback: cost×5 / 2
            cost_in = float(cat.get("cost_in_usd") or 0)
            our_mr = (cost_in * 5 / 2) if cost_in else 1.0
            our_cr = float(cat.get("completion_ratio") or 1)
        mr[up] = our_mr
        cr[up] = our_cr
        mp.pop(up, None)
        vendor, icon, desc = meta.get(up, ("其他", "Other", up))
        vid2 = ensure_vendor(cur, v_cols, vendor, now)
        upsert_marketplace(
            cur,
            m_cols,
            up,
            desc,
            icon,
            "大语言模型",
            vid2,
            now,
        )
        set_abilities(cur, up, paid_id, only_this_channel=True)
        print(
            "paid ok",
            up,
            "ratio",
            our_mr,
            "comp",
            our_cr,
            "sell_in",
            our_mr * 2,
        )

    # remove abilities of legacy bare-on-free confusion already handled by set_abilities
    # soft-disable marketplace rows that are neither free nor paid twin? skip

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        cur,
        "CompletionRatio",
        json.dumps(cr, ensure_ascii=False, separators=(",", ":")),
    )
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    conn.commit()
    conn.close()
    print(
        json.dumps(
            {
                "ok": True,
                "free": public_ids,
                "paid": LEGACY_BARE,
                "mapping": mapping,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
