#!/usr/bin/env python3
"""Delist glm-5.2 / glm-5.3 series from New API (marketplace + channels + ratios)."""
from __future__ import annotations

import json
import re
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

PAT = re.compile(r"^glm-5\.[23]([:-]|$)", re.I)

EXTRA = [
    "glm-5.2",
    "glm-5.2-free",
    "glm-5.3",
    "glm-5.3-flash:free",
    "glm-5.3-flash-thinking:free",
    "glm-5.3-flash-search:free",
    "glm-5.3-flash-think-search:free",
    "glm-5.3-thinking:free",
    "glm-5.3-search:free",
    "glm-5.3-think-search:free",
    "glm-5.3:free",
    "glm-5.2:free",
    "glm-5.2-thinking:free",
]


def is_target(name: str) -> bool:
    n = (name or "").strip()
    if not n:
        return False
    if PAT.match(n):
        return True
    low = n.lower()
    return low.startswith("glm-5.2") or low.startswith("glm-5.3")


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


def strip_mapping(raw: str | None) -> tuple[str | None, list[str]]:
    if not raw or not str(raw).strip():
        return raw, []
    try:
        obj = json.loads(raw)
    except Exception:
        return raw, []
    if not isinstance(obj, dict):
        return raw, []
    removed = []
    for k in list(obj.keys()):
        v = obj.get(k)
        if is_target(str(k)) or is_target(str(v)):
            removed.append(f"{k}->{v}")
            del obj[k]
    if not removed:
        return raw, []
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")), removed


def main():
    now = int(time.time())
    con = sqlite3.connect(DB)
    cur = con.cursor()
    m_cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}
    ch_cols = {r[1] for r in cur.execute("PRAGMA table_info(channels)")}
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    names = [
        r[0]
        for r in cur.execute("SELECT model_name FROM models").fetchall()
        if r[0] and is_target(r[0])
    ]
    DELIST = sorted(set(names) | {x for x in EXTRA if is_target(x)})
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

    ch_sel = "SELECT id, name, models, base_url"
    if "model_mapping" in ch_cols:
        ch_sel += ", model_mapping"
    for row in cur.execute(ch_sel + " FROM channels").fetchall():
        if "model_mapping" in ch_cols:
            cid, name, models, base, mapping = row
        else:
            cid, name, models, base = row
            mapping = None
        parts = []
        if models:
            parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
        new_parts = [p for p in parts if not is_target(p)]
        changed = len(new_parts) != len(parts)
        new_map, map_removed = strip_mapping(mapping) if "model_mapping" in ch_cols else (mapping, [])
        if not changed and not map_removed:
            continue
        sets = []
        vals = []
        if changed:
            sets.append("models=?")
            vals.append(",".join(new_parts))
        if map_removed:
            sets.append("model_mapping=?")
            vals.append(new_map)
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        removed = [p for p in parts if p not in new_parts]
        print(
            "channel_strip",
            cid,
            name or "",
            "removed",
            ",".join(removed) or "-",
            "map_removed",
            ",".join(map_removed) or "-",
        )

    for key in ("ModelRatio", "CompletionRatio", "ModelPrice"):
        mp = load_map(cur, key)
        hit = [mid for mid in list(mp) if is_target(str(mid))]
        for mid in hit:
            del mp[mid]
            print(f"option_{key}_removed", mid)
        put_opt(cur, key, json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    con.commit()
    con.close()
    print("DONE_DELIST_GLM52_53")


if __name__ == "__main__":
    main()
