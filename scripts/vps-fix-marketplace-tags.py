#!/usr/bin/env python3
"""Normalize marketplace tags: drop middle-dot / junk fragments that break New API sidebar."""
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

REPL = {
    "视频·按秒": "视频按秒",
    "视频·按次": "视频按次",
    "影片·按秒": "视频按秒",
    "影片·按次": "视频按次",
    "Video · per second": "视频按秒",
    "Video · per request": "视频按次",
}


def norm_tag(t):
    t = (t or "").strip()
    if not t or t in {".", "·", "•", "-", "—"}:
        return None
    if t in REPL:
        return REPL[t]
    # collapse middle-dot variants
    if "·" in t:
        t2 = t.replace("·", "")
        if t2 in ("视频按秒", "影片按秒"):
            return "视频按秒"
        if t2 in ("视频按次", "影片按次"):
            return "视频按次"
        t = t2
    return t


def norm_tags(raw):
    if raw is None:
        return raw
    parts = [p.strip() for p in str(raw).replace("，", ",").split(",")]
    out = []
    seen = set()
    for p in parts:
        n = norm_tag(p)
        if not n or n in seen:
            continue
        # drop English fragment leftovers if Chinese canonical present
        seen.add(n)
        out.append(n)
    # drop lone fragments when paired junk
    junk = {"per", "second", "request", "processing", "digital", "human", "Video", "video"}
    if any(x in ("视频按秒", "视频按次", "数字人", "图像处理") for x in out):
        out = [x for x in out if x not in junk]
    return ",".join(out)


conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("PRAGMA table_info(models)")
cols = {r[1] for r in cur.fetchall()}
sql = "SELECT id, model_name, tags FROM models"
if "deleted_at" in cols:
    sql += " WHERE deleted_at IS NULL"
cur.execute(sql)
now = int(time.time())
n = 0
for mid, name, tags in cur.fetchall():
    nt = norm_tags(tags)
    if nt == tags:
        continue
    if "updated_time" in cols:
        cur.execute(
            "UPDATE models SET tags=?, updated_time=? WHERE id=?", (nt, now, mid)
        )
    else:
        cur.execute("UPDATE models SET tags=? WHERE id=?", (nt, mid))
    print("tag", name, ":", tags, "->", nt)
    n += 1
conn.commit()
conn.close()
print("DONE_FIX_TAGS", n)
