#!/usr/bin/env python3
"""Hotfix: free *-free stay ModelPrice=0; paid bare get OpenLux×5 ratios (clear ModelPrice)."""
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

# sell = cost×5 → ModelRatio = sell_in/2
PAID = {
    "deepseek-v4-pro": (1.65, 3.0),  # $3.3 / $9.9
    "deepseek-v4-flash": (0.55, 3.0),  # $1.1 / $3.3
    "glm-5.2": (1.75, 3.142857),  # $3.5 / $11
    "kimi-k3": (3.75, 5.0),  # $7.5 / $37.5
}
FREE = [
    "deepseek-v4-pro-free",
    "deepseek-v4-flash-free",
    "glm-5.2-free",
    "kimi-k3-free",
]


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


conn = sqlite3.connect(DB)
cur = conn.cursor()
mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

for fid in FREE:
    mr.pop(fid, None)
    cr.pop(fid, None)
    mp[fid] = 0
    print("free", fid, "ModelPrice=0")

for mid, (ratio, comp) in PAID.items():
    mp.pop(mid, None)
    mr[mid] = ratio
    cr[mid] = comp
    print("paid", mid, "ratio", ratio, "comp", comp, "sell_in", ratio * 2)

put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
conn.commit()

# verify from DB
mr2 = json.loads(get_opt(cur, "ModelRatio") or "{}")
mp2 = json.loads(get_opt(cur, "ModelPrice") or "{}")
for mid in list(PAID) + FREE:
    print(
        "check",
        mid,
        "mp",
        mp2.get(mid, "<absent>"),
        "mr",
        mr2.get(mid, "<absent>"),
    )
conn.close()
print("DONE_FIX_FREE_PAID_PRICE")
