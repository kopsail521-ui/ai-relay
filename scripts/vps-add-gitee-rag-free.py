#!/usr/bin/env python3
"""Add Gitee free chat + RAG models (embeddings/rerankers at cost×5).

Free (ModelPrice=0):
  Atria-dawn-v2, DeepSeek-Prover-V2-7B

RAG tag, sell = cost×5, FX=7.3 (token ModelRatio):
  WeMM-Embedding-9B  ¥0.9/M → sell ¥4.5/M
  WeMM-Embedding-4B  ¥0.8/M → sell ¥4.0/M
  WeMM-Embedding-2B  ¥0.7/M → sell ¥3.5/M
  Qwen3-VL-Reranker-2B ¥0.09/M → sell ¥0.45/M
  Qwen3-VL-Reranker-8B ¥0.35/M → sell ¥1.75/M
  Qwen3-VL-Embedding-8B free-upstream → floor ¥0.01/M ×5 = ¥0.05/M

Public copy must NOT mention Gitee / 模力方舟 / ×5.
"""
import json
import os
import sqlite3
import sys
import time

FX = 7.3
MARKUP = 5
FREE_FLOOR_CNY = 0.01

EP_CHAT = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
EP_EMBED = json.dumps({"openai": "/v1/embeddings"}, separators=(",", ":"))
EP_RERANK = json.dumps({"openai": "/v1/rerank"}, separators=(",", ":"))

FREE = [
    {
        "id": "Atria-dawn-v2",
        "vendor": "其他",
        "icon": "Custom",
        "tags": "大语言模型,免费",
        "endpoints": EP_CHAT,
        "desc": "Atria Dawn V2：科研向智能体对话模型（免费额度）。",
        "ability_src": "gemma-4-26B-A4B-it",
    },
    {
        "id": "DeepSeek-Prover-V2-7B",
        "vendor": "DeepSeek",
        "icon": "DeepSeek",  # free = mono
        "tags": "大语言模型,免费",
        "endpoints": EP_CHAT,
        "desc": "DeepSeek Prover V2 7B：Lean 4 形式化定理证明（免费额度）。",
        "ability_src": "gemma-4-26B-A4B-it",
    },
]

RAG = [
    {
        "id": "WeMM-Embedding-9B",
        "vendor": "腾讯",
        "icon": "Tencent.Color",
        "cost_in_cny": 0.9,
        "endpoints": EP_EMBED,
        "desc": "WeMM Embedding 9B：多模态向量化，适用于跨模态检索与 RAG。",
    },
    {
        "id": "WeMM-Embedding-4B",
        "vendor": "腾讯",
        "icon": "Tencent.Color",
        "cost_in_cny": 0.8,
        "endpoints": EP_EMBED,
        "desc": "WeMM Embedding 4B：多模态向量化，适用于跨模态检索与 RAG。",
    },
    {
        "id": "WeMM-Embedding-2B",
        "vendor": "腾讯",
        "icon": "Tencent.Color",
        "cost_in_cny": 0.7,
        "endpoints": EP_EMBED,
        "desc": "WeMM Embedding 2B：轻量多模态向量化，适用于检索与 RAG。",
    },
    {
        "id": "Qwen3-VL-Reranker-2B",
        "vendor": "阿里巴巴",
        "icon": "Qwen.Color",
        "cost_in_cny": 0.09,
        "endpoints": EP_RERANK,
        "desc": "Qwen3-VL Reranker 2B：多模态重排序，提升检索相关性。",
    },
    {
        "id": "Qwen3-VL-Reranker-8B",
        "vendor": "阿里巴巴",
        "icon": "Qwen.Color",
        "cost_in_cny": 0.35,
        "endpoints": EP_RERANK,
        "desc": "Qwen3-VL Reranker 8B：高精度多模态重排序。",
    },
    {
        "id": "Qwen3-VL-Embedding-8B",
        "vendor": "阿里巴巴",
        "icon": "Qwen.Color",
        "cost_in_cny": FREE_FLOOR_CNY,  # upstream free → floor
        "free_upstream": True,
        "endpoints": EP_EMBED,
        "desc": "Qwen3-VL Embedding 8B：多模态向量化，适用于跨模态检索与 RAG。",
    },
]


def sell_ratio(cost_in_cny):
    sell_cny = cost_in_cny * MARKUP
    sell_usd = sell_cny / FX
    return round(sell_usd / 2, 6), round(sell_usd, 6), round(sell_cny, 6)


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def ensure_vendor(cur, v_cols, name, icon, now):
    cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    fields = ["name", "icon", "description"]
    values = [name, icon or "Custom", ""]
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


def upsert_model(cur, m_cols, mid, desc, icon, tags, vid, endpoints, now):
    sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    cur.execute(sql, (mid,))
    row = cur.fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [mid, desc, icon, tags, vid, endpoints]
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
        vals = [desc, icon, tags, vid, endpoints]
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


def set_abilities(cur, mid, channel_id, ability_src=None):
    cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
    rows = []
    if ability_src:
        cur.execute(
            'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 30',
            (ability_src,),
        )
        rows = cur.fetchall()
    if rows:
        for g, ch, en, pri, w in rows:
            # keep group/priority/weight but force this channel
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                (g, mid, channel_id, en, pri, w),
            )
        print("abilities from", ability_src, "→", mid, len(rows))
    else:
        cur.execute(
            'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
            ("default", mid, channel_id, 1, 0, 1),
        )
        print("abilities default", mid, "channel", channel_id)


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
    cur.execute(sql)
    channels = cur.fetchall()

    target = None
    for cid, name, models, base in channels:
        blob = ((name or "") + " " + (base or "")).lower()
        if "gitee" in blob or "模力方舟" in (name or "") or "ai.gitee.com" in (base or "").lower():
            target = (cid, name, models or "")
            break
    if target is None:
        for cid, name, models, base in channels:
            ms = [x.strip() for x in (models or "").split(",") if x.strip()]
            if "gemma-4-26B-A4B-it" in ms:
                target = (cid, name, models or "")
                break
    if target is None:
        raise SystemExit("Gitee channel not found")

    cid, cname, models_s = target
    # keep admin channel name containing Gitee for passthrough lookup
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    all_ids = [m["id"] for m in FREE] + [m["id"] for m in RAG]
    added = []
    for mid in all_ids:
        if mid not in parts:
            parts.insert(0, mid)
            added.append(mid)
    merged = ",".join(parts)
    if "updated_time" in ch_cols:
        cur.execute(
            "UPDATE channels SET models=?, updated_time=? WHERE id=?",
            (merged, now, cid),
        )
    else:
        cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
    print("channel", cid, cname, "added", ",".join(added) or "(none)")

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

    priced = []

    for m in FREE:
        mid = m["id"]
        mr.pop(mid, None)
        cr.pop(mid, None)
        mp[mid] = 0
        vid = ensure_vendor(cur, v_cols, m["vendor"], m["icon"], now)
        upsert_model(
            cur, m_cols, mid, m["desc"], m["icon"], m["tags"], vid, m["endpoints"], now
        )
        set_abilities(cur, mid, cid, m.get("ability_src"))
        priced.append({"id": mid, "mode": "free", "model_price": 0})
        print("free", mid)

    for m in RAG:
        mid = m["id"]
        ratio, sell_usd, sell_cny = sell_ratio(m["cost_in_cny"])
        mr[mid] = ratio
        cr[mid] = 1
        mp.pop(mid, None)
        desc = m["desc"] + " 约 $%.4f / 百万 tokens。" % sell_usd
        vid = ensure_vendor(cur, v_cols, m["vendor"], m["icon"], now)
        upsert_model(cur, m_cols, mid, desc, m["icon"], "rag", vid, m["endpoints"], now)
        set_abilities(cur, mid, cid, "gemma-4-26B-A4B-it")
        priced.append(
            {
                "id": mid,
                "mode": "token",
                "cost_in_cny": m["cost_in_cny"],
                "sell_usd_per_m": sell_usd,
                "model_ratio": ratio,
                "free_upstream": bool(m.get("free_upstream")),
            }
        )
        print("rag", mid, "ratio", ratio, "sell_usd", sell_usd)

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":"))
    )
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    conn.commit()
    conn.close()
    print(
        json.dumps(
            {"ok": True, "markup": MARKUP, "fx": FX, "models": priced},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
