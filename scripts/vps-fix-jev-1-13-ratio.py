#!/usr/bin/env python3
"""Hotfix jev-1.13.0 sell ratios: $0.0336 in / $0 out → ModelRatio=0.0168 CompletionRatio=0."""
import json
import sqlite3
import sys

MODEL = "jev-1.13.0"
MR = 0.0168
CR = 0.0


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    conn = sqlite3.connect(db)
    cur = conn.cursor()

    def get(key):
        row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
        return row[0] if row else "{}"

    def put(key, value):
        if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))

    mr = json.loads(get("ModelRatio") or "{}")
    cr = json.loads(get("CompletionRatio") or "{}")
    mp = json.loads(get("ModelPrice") or "{}")
    print("before", mr.get(MODEL), cr.get(MODEL), mp.get(MODEL))
    mr[MODEL] = MR
    cr[MODEL] = CR
    mp.pop(MODEL, None)
    put("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put("CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    conn.commit()
    conn.close()
    print("after", MR, CR)
    print("DONE_FIX_JEV_RATIO")


if __name__ == "__main__":
    main()
