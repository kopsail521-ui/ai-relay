#!/usr/bin/env python3
"""Retire the 免费 and 视频按次 tags (2026-10-10).

- 免费 is price-based (free pool shows $0) — never a model tag. Stripped everywhere.
- 视频按次 models are categorized under 视频模型.
- keyo-flash:free loses its lone 免费 tag and is categorized 大语言模型
  (same as keyo-flash2:free).

Only models.tags is touched. Idempotent.
"""
from __future__ import annotations

import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"

DROP = {"免费", "免費", "Free", "free"}
RENAME = {"视频按次": "视频模型", "视频·按次": "视频模型", "影片按次": "视频模型"}
# model -> tag list to force when the sweep leaves it empty
FALLBACK = {"keyo-flash:free": "大语言模型"}


def norm_tags(raw):
    if raw is None:
        return raw, False
    parts = [p.strip() for p in str(raw).replace("，", ",").split(",") if p.strip()]
    out = []
    for p in parts:
        if p in DROP:
            continue
        out.append(RENAME.get(p, p))
    new = ",".join(out)
    return new, new != str(raw)


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    now = int(time.time())
    m_cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}

    changed = 0
    for mid, raw in cur.execute(
        "SELECT model_name, tags FROM models WHERE tags IS NOT NULL"
    ).fetchall():
        new, touched = norm_tags(raw)
        if not touched:
            continue
        if not new and mid in FALLBACK:
            new = FALLBACK[mid]
        sets = ["tags=?"]
        vals = [new]
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        cur.execute(
            "UPDATE models SET %s WHERE model_name=?" % ",".join(sets),
            (*vals, mid),
        )
        changed += 1
        print("retag", mid, repr(raw), "->", repr(new))

    # self-check before commit
    bad = cur.execute(
        "SELECT model_name, tags FROM models WHERE tags LIKE '%免费%' OR tags LIKE '%视频按次%'"
    ).fetchall()
    assert not bad, "stale tags remain: %r" % (bad,)

    con.commit()
    con.close()
    print("changed", changed, "models")
    print("DONE_FIX_TAGS_20261010")


if __name__ == "__main__":
    main()
