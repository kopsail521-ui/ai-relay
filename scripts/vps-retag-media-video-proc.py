#!/usr/bin/env python3
"""Retag subtitle-erase-pro / video-enhance-pro → 视频处理."""
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
MODELS = ("subtitle-erase-pro", "video-enhance-pro")
TAG = "视频处理"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}
now = int(time.time())
for mid in MODELS:
    q = "SELECT id, tags FROM models WHERE model_name=?"
    if "deleted_at" in cols:
        q += " AND deleted_at IS NULL"
    row = cur.execute(q, (mid,)).fetchone()
    if not row:
        print("missing", mid)
        continue
    sets = ["tags=?"]
    vals = [TAG]
    if "updated_time" in cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(row[0])
    cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
    print("retag", mid, row[1], "->", TAG)
conn.commit()
conn.close()
print("DONE_RETAG_VIDEO_PROC")
