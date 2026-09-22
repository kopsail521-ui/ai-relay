#!/usr/bin/env python3
"""Delist all DeepSeek-series models from New API (marketplace + channels + ratios)."""
from __future__ import annotations

import json
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"


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
    ch_cols = {r[1] for r in cur.execute("PRAGMA table_info(channels)")}
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    names = [
        r[0]
        for r in cur.execute(
            "SELECT model_name FROM models WHERE lower(model_name) LIKE '%deepseek%'"
        ).fetchall()
        if r[0]
    ]
    # also catch option keys / channel lists even if model row already gone
    extra = [
        "deepseek-v4-flash",
        "deepseek-v4-flash-free",
        "deepseek-v4-pro",
        "deepseek-v4-pro-0813",
        "deepseek-v4-pro-free",
        "deepseek-v4.1-flash",
        "DeepSeek-Prover-V2-7B",
        "deepseek-flash",
    ]
    DELIST = sorted(set(names) | set(extra))
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

    for cid, name, models, base in cur.execute(
        "SELECT id, name, models, base_url FROM channels"
    ).fetchall():
        blob = ((name or "") + " " + (base or "")).lower()
        is_ds_ch = "api.deepseek.com" in blob or "deepseek" in (name or "").lower()
        parts = []
        if models:
            parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
        new_parts = [p for p in parts if "deepseek" not in p.lower()]
        changed = len(new_parts) != len(parts)
        if is_ds_ch:
            sets = ["status=0", "models=?"]
            vals = [",".join(new_parts)]
            if "updated_time" in ch_cols:
                sets.append("updated_time=?")
                vals.append(now)
            vals.append(cid)
            cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
            print("channel_disable", cid, name or "", "kept_models", len(new_parts))
        elif changed:
            removed = [p for p in parts if p not in new_parts]
            if "updated_time" in ch_cols:
                cur.execute(
                    "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                    (",".join(new_parts), now, cid),
                )
            else:
                cur.execute(
                    "UPDATE channels SET models=? WHERE id=?",
                    (",".join(new_parts), cid),
                )
            print("channel_strip", cid, "removed", ",".join(removed))

    mr = load_map(cur, "ModelRatio")
    cr = load_map(cur, "CompletionRatio")
    mp = load_map(cur, "ModelPrice")
    for mid in sorted(set(mr) | set(cr) | set(mp)):
        if "deepseek" in str(mid).lower():
            if mid in mr:
                del mr[mid]
                print("option_ModelRatio_removed", mid)
            if mid in cr:
                del cr[mid]
                print("option_CompletionRatio_removed", mid)
            if mid in mp:
                del mp[mid]
                print("option_ModelPrice_removed", mid)

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        cur,
        "CompletionRatio",
        json.dumps(cr, ensure_ascii=False, separators=(",", ":")),
    )
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    con.commit()
    con.close()
    print("DONE_DELIST_DEEPSEEK")


if __name__ == "__main__":
    main()
