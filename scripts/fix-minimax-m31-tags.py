#!/usr/bin/env python3
"""Fix MiniMax-M3.1-Flash model tags to exactly 大语言模型.

The model carried extra tags (工具, 识图) that a previous change invented
without approval. Only this one model is affected; the tags column of every
other model is never touched. Options, quotas and balances are never touched.
Idempotent.
"""
import sqlite3
import sys

DB = sys.argv[1]
MODEL = "MiniMax-M3.1-Flash"
WANT = "大语言模型"

con = sqlite3.connect(DB, timeout=30)
con.row_factory = sqlite3.Row
cur = con.cursor()

rows = cur.execute(
    "SELECT model_name, tags FROM models WHERE model_name=?", (MODEL,)
).fetchall()
if not rows:
    print(f"ABORT: model {MODEL} not found in models table; nothing changed")
    sys.exit(1)
for r in rows:
    print(f"BEFORE {r['model_name']}: {r['tags']!r}")

with con:
    cur.execute("UPDATE models SET tags=? WHERE model_name=?", (WANT, MODEL))
    # Keep the tag-label metadata rows from advertising tags nothing uses.
    for tag in ("工具", "识图"):
        left = cur.execute(
            "SELECT COUNT(*) AS n FROM models WHERE tags LIKE ?", (f"%{tag}%",)
        ).fetchone()["n"]
        if left == 0:
            cur.execute("DELETE FROM options WHERE key=?", (f"model_tag:{tag}",))

after = cur.execute(
    "SELECT model_name, tags FROM models WHERE model_name=?", (MODEL,)
).fetchall()
for r in after:
    print(f"AFTER  {r['model_name']}: {r['tags']!r}")

if any(r["tags"] != WANT for r in after):
    print("VERIFY_FAILED")
    sys.exit(2)
print("TAGS_OK")