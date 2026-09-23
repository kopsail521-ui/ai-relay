#!/usr/bin/env python3
"""Retarget Keyo sell markups (OpenLux cost × N) for selected chat models.

  claude-fable-5-1 → cost × 5
  kimi-k3         → cost × 2
  glm-5.2         → cost × 2
  glm-5.3         → cost × 2

New API: sell_in = model_ratio × 2 ; sell_out = model_ratio × completion_ratio × 2
"""
from __future__ import annotations

import json
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"

# Costs from config/openlux-chat-catalog.json (fable-5-1 inferred from prior ×5 sell band).
MODELS = [
    {
        "id": "claude-fable-5-1",
        "cost_in": 1.4706,
        "cost_out": 7.353,
        "markup": 5.0,
    },
    {
        "id": "kimi-k3",
        "cost_in": 1.5,
        "cost_out": 7.5,
        "markup": 2.0,
    },
    {
        "id": "glm-5.2",
        "cost_in": 0.7,
        "cost_out": 2.2,
        "markup": 2.0,
    },
    {
        "id": "glm-5.3",
        "cost_in": 0.7,
        "cost_out": 2.2,
        "markup": 2.0,
    },
]


def get_opt(cur, key):
    row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    return row[0] if row else "{}"


def put_opt(cur, key, value):
    if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    for m in MODELS:
        mid = m["id"]
        sell_in = round(m["cost_in"] * m["markup"], 6)
        sell_out = round(m["cost_out"] * m["markup"], 6)
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
            m["markup"],
            "sell",
            sell_in,
            "/",
            sell_out,
            "ratio",
            ratio,
            "comp",
            comp,
            "was",
            old_r,
            "/",
            old_c,
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
    print("DONE_RETARGET_FABLE_KIMI_GLM")


if __name__ == "__main__":
    main()
