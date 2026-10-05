#!/usr/bin/env python3
"""Strip the 免费 tag from all models' tags (marketplace sidebar).

免费 is now the price-based 定价类型 filter in the pricing page (Free models,
price==0), not a capability tag. This script is the DB-side cleaner; the
gitee-passthrough boot heal (RULES) no longer re-adds it.

Usage: python3 vps-strip-free-tag.py [/path/to/one-api.db]
"""
from __future__ import annotations

import sqlite3
import sys

TAG = "免费"


def strip(raw: str) -> str:
    parts = [p.strip() for p in (raw or "").replace("，", ",").split(",")]
    out = [p for p in parts if p and p != TAG]
    return ",".join(out)


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    n = 0
    # fetchall first: do not update while iterating the same cursor
    rows = cur.execute(
        "SELECT id, model_name, tags FROM models WHERE tags LIKE ?",
        ("%免费%",),
    ).fetchall()
    for mid, name, tags in rows:
        nxt = strip(tags)
        cur.execute("UPDATE models SET tags=? WHERE id=?", (nxt, mid))
        print("model", name, ":", tags, "->", nxt or "(empty)")
        n += 1
    left = cur.execute(
        "SELECT COUNT(*) FROM models WHERE tags LIKE ?", ("%免费%",)
    ).fetchone()[0]
    conn.commit()
    conn.close()
    print("stripped", n, "| free_tag_left", left)
    if left:
        raise SystemExit("ERROR: 免费 tag still present")
    print("DONE_STRIP_FREE_TAG")


if __name__ == "__main__":
    main()
