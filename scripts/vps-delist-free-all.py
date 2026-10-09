#!/usr/bin/env python3
"""Delist all free models from the SenseNova (Keyo Free) and UnoRouter
(Keyo Chat Free) channels.

Removes each model's:
  - abilities rows (every group)
  - marketplace row (soft-delete if deleted_at column exists, else hard delete)
  - channel membership (strips from the channel's models CSV and group field)
  - ModelPrice / ModelRatio / CompletionRatio option entries

After this, the only free models left on the catalog are the ones explicitly
kept (none — the user asked to delist ALL of these two channels' free models).
The Atria / DeepSeek-Prover free models from other channels are untouched.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

DELIST = [
    # SenseNova / Keyo Free
    "glm-5.2:free",
    "kimi-k3:free",
    "deepseek-v4-pro:free",
    "deepseek-v4-flash:free",
    # UnoRouter / Keyo Chat Free
    "k2-horizon:free",
    "space-bunny-alpha:free",
    "nemotron-3-ultra-550b-a55b:free",
    "gemma-4-26b:free",
    "laguna-s-2.1:free",
    "qwen3.6-35b-a3b:free",
    "nemotron-3-super-120b-a12b:free",
    "ling-3.0-flash-fin:free",
    "qwen3.8-27b:free",
    "nemotron-3.5-lightning-30b-a3b:free",
    "gemini-robotics-er-2-preview:free",
    "nemotron-3.5-lightning:free",
    "dots-3-note-preview:free",
    "gemma-4-31b-it:free",
    "step-3.7-flash:free",
    "mistral-large-3-675b:free",
    "muse-glimmer-30b:free",
]


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def get_opt(cur, key):
    row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    return row[0] if row else "{}"


def put_opt(cur, key, value):
    if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db):
        raise SystemExit("DB not found: " + db)

    con = sqlite3.connect(db)
    cur = con.cursor()
    now = int(time.time())
    m_cols = cols(cur, "models")
    ch_cols = cols(cur, "channels")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    want = set(DELIST)

    print("delist_targets", len(want))

    # 1) abilities
    if "abilities" in tabs:
        for mid in sorted(want):
            n = cur.execute("DELETE FROM abilities WHERE model=?", (mid,)).rowcount
            if n:
                print("abilities_del", mid, n)

    # 2) models table (soft-delete or hard delete)
    for mid in sorted(want):
        if "deleted_at" in m_cols:
            # purge old soft-deleted dupes first (UNIQUE constraint safety)
            cur.execute(
                "DELETE FROM models WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
                (mid,),
            )
            n = cur.execute(
                "UPDATE models SET deleted_at=?, status=0 WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
                (now, mid),
            ).rowcount
        else:
            n = cur.execute("DELETE FROM models WHERE model_name=?", (mid,)).rowcount
        if n:
            print("model_del", mid, n)

    # 3) channel membership: strip from every channel's models CSV
    for cid, name, models in cur.execute("SELECT id, name, models FROM channels").fetchall():
        if not models:
            continue
        parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
        new_parts = [p for p in parts if p not in want]
        if len(new_parts) == len(parts):
            continue
        removed = [p for p in parts if p not in new_parts]
        if "updated_time" in ch_cols:
            cur.execute("UPDATE channels SET models=?, updated_time=? WHERE id=?",
                        (",".join(new_parts), now, cid))
        else:
            cur.execute("UPDATE channels SET models=? WHERE id=?", (",".join(new_parts), cid))
        print("channel_strip", cid, name or "", "removed", len(removed))

    # 4) options: ModelPrice / ModelRatio / CompletionRatio
    for key in ("ModelRatio", "CompletionRatio", "ModelPrice"):
        m = json.loads(get_opt(cur, key) or "{}")
        changed = False
        for mid in list(m.keys()):
            if mid in want:
                del m[mid]
                changed = True
                print("option_%s_removed" % key, mid)
        if changed:
            put_opt(cur, key, json.dumps(m, ensure_ascii=False, separators=(",", ":")))

    # 5) self-check before commit
    problems = []
    if "abilities" in tabs:
        for mid in want:
            n = cur.execute("SELECT count(*) FROM abilities WHERE model=?", (mid,)).fetchone()[0]
            if n:
                problems.append("abilities still has %s (%d)" % (mid, n))
    for key in ("ModelPrice", "ModelRatio"):
        m = json.loads(get_opt(cur, key) or "{}")
        for mid in want:
            if mid in m:
                problems.append("%s still has %s" % (key, mid))
    if problems:
        con.rollback()
        con.close()
        raise SystemExit("ABORT: " + "; ".join(problems))

    con.commit()
    con.close()
    print("count", len(want))
    print("DONE_DELIST_FREE_ALL")


if __name__ == "__main__":
    main()
