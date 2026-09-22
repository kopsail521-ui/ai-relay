#!/usr/bin/env python3
"""
Keyo ops 2026-09-22:
1) Delist all DeepSeek-series models
2) glm-5.2 / glm-5.3 sell = cost × 1.2
3) kimi-k3 / MiniMax-M3 sell = cost × 1.5
4) Fix tags: gpt-image-2.5* → 图片; grok-1.5-video → 视频按次; Qwen3-VL-Embedding-8B → rag

New API: sell_usd_in = model_ratio × 2; sell_usd_out = sell_in × completion_ratio
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

# Explicit IDs + any model_name matching deepseek (case-insensitive)
DELIST_EXPLICIT = [
    "deepseek-v4-flash",
    "deepseek-v4-flash-free",
    "deepseek-v4-pro",
    "deepseek-v4-pro-0813",
    "deepseek-v4-pro-free",
    "deepseek-v4.1-flash",
    "DeepSeek-Prover-V2-7B",
]

# cost_in_usd, cost_out_usd, markup → model_ratio / completion_ratio
PRICE = {
    # cost 0.7 / 2.2 → sell 0.84 / 2.64 → ratio 0.42, comp 3.142857
    "glm-5.2": {"cost_in": 0.7, "cost_out": 2.2, "markup": 1.2},
    "glm-5.3": {"cost_in": 0.7, "cost_out": 2.2, "markup": 1.2},
    # cost 1.5 / 7.5 → sell 2.25 / 11.25 → ratio 1.125, comp 5
    "kimi-k3": {"cost_in": 1.5, "cost_out": 7.5, "markup": 1.5},
    # cost 0.15 / 0.6 → sell 0.225 / 0.9 → ratio 0.1125, comp 4
    "MiniMax-M3": {"cost_in": 0.15, "cost_out": 0.6, "markup": 1.5},
}

TAGS = {
    "gpt-image-2.5": "图片",
    "gpt-image-2.5-flare": "图片",
    "gpt-image-2.5-sunburst": "图片",
    "grok-1.5-video": "视频按次",
    "Qwen3-VL-Embedding-8B": "rag",
}


def get_opt(cur, key):
    row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    return row[0] if row else None


def put_opt(cur, key, value):
    if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
        cur.execute("INSERT INTO options(key, value) VALUES(?,?)", (key, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))


def load_map(cur, key):
    raw = get_opt(cur, key)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def main():
    now = int(time.time())
    con = sqlite3.connect(DB)
    cur = con.cursor()
    m_cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    # ---- 1) Delist DeepSeek (all series) ----
    db_ds = [
        r[0]
        for r in cur.execute(
            "SELECT model_name FROM models WHERE lower(model_name) LIKE '%deepseek%'"
        ).fetchall()
        if r[0]
    ]
    DELIST = sorted(set(DELIST_EXPLICIT) | set(db_ds))
    print("delist_targets", ",".join(DELIST) or "(none)")

    for mid in DELIST:
        if "deleted_at" in m_cols:
            cur.execute(
                "UPDATE models SET deleted_at=? WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
                (now, mid),
            )
            print("soft_delete", mid, cur.rowcount)
        if "status" in m_cols:
            cur.execute("UPDATE models SET status=0 WHERE model_name=?", (mid,))
            print("status0", mid, cur.rowcount)
        if "abilities" in tabs:
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            print("abilities_del", mid, cur.rowcount)

    for cid, models in cur.execute("SELECT id, models FROM channels").fetchall():
        if not models:
            continue
        parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
        new_parts = [
            p for p in parts if p not in DELIST and "deepseek" not in p.lower()
        ]
        if len(new_parts) != len(parts):
            removed = [p for p in parts if p not in new_parts]
            cur.execute(
                "UPDATE channels SET models=? WHERE id=?",
                (",".join(new_parts), cid),
            )
            print("channel_strip", cid, "removed", ",".join(removed))

    mr = load_map(cur, "ModelRatio")
    cr = load_map(cur, "CompletionRatio")
    mp = load_map(cur, "ModelPrice")
    for mid in sorted(set(mr) | set(cr) | set(mp)):
        if mid in DELIST or "deepseek" in str(mid).lower():
            if mid in mr:
                del mr[mid]
                print("option_ModelRatio_removed", mid)
            if mid in cr:
                del cr[mid]
                print("option_CompletionRatio_removed", mid)
            if mid in mp:
                del mp[mid]
                print("option_ModelPrice_removed", mid)

    # ---- 2/3) Price markups ----
    for mid, spec in PRICE.items():
        sell_in = round(spec["cost_in"] * spec["markup"], 6)
        sell_out = round(spec["cost_out"] * spec["markup"], 6)
        ratio = round(sell_in / 2.0, 6)
        comp = round(sell_out / sell_in, 6) if sell_in else 1.0
        old_r = mr.get(mid)
        old_c = cr.get(mid)
        mr[mid] = ratio
        cr[mid] = comp
        mp.pop(mid, None)
        print(
            "price",
            mid,
            "markup",
            spec["markup"],
            "ratio",
            old_r,
            "->",
            ratio,
            "comp",
            old_c,
            "->",
            comp,
            "sell",
            sell_in,
            "/",
            sell_out,
        )

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        cur,
        "CompletionRatio",
        json.dumps(cr, ensure_ascii=False, separators=(",", ":")),
    )
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    # ---- 4) Tags ----
    for mid, tag in TAGS.items():
        if "updated_time" in m_cols:
            cur.execute(
                "UPDATE models SET tags=?, updated_time=? WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
                (tag, now, mid),
            )
        else:
            cur.execute(
                "UPDATE models SET tags=? WHERE model_name=?",
                (tag, mid),
            )
        print("tag", mid, "->", tag, "rows", cur.rowcount)

    con.commit()
    con.close()
    print("DONE_PRICE_TAG_OPS_20260922")


if __name__ == "__main__":
    main()
