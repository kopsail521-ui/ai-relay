#!/usr/bin/env python3
"""Add Claude-Code-2 / AWS-Bedrock-2 groups for listed Claude models.

Keyo GroupRatio is global. Ratios follow OpenLux Claude-Code-1 baseline:
  Claude-Code-2 = 0.29412 / 0.17647
  AWS-Bedrock-2 = 0.58824 / 0.17647
Sell = current default sell × that ratio (same markup vs Claude-Code-1).
claude-fable-5-1 has no AWS-Bedrock-2 on the source catalog — skip that group.
Public copy must not name the supplier.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

RATIO_CC2 = 0.29412 / 0.17647
RATIO_AB2 = 0.58824 / 0.17647

# live Keyo ModelRatio (sell_in = mr * 2, sell_out = sell_in * cr)
MODELS = [
    {"id": "claude-sonnet-5-5", "mr": 0.441175, "cr": 5.0, "ab2": True},
    {"id": "claude-opus-5-5", "mr": 0.88235, "cr": 5.0, "ab2": True},
    {"id": "claude-fable-5-1", "mr": 3.6765, "cr": 5.0, "ab2": False},
    {"id": "claude-sonnet-5", "mr": 0.2206, "cr": 5.0, "ab2": True},
    {"id": "claude-opus-5", "mr": 0.5515, "cr": 5.0, "ab2": True},
    {"id": "claude-fable-5", "mr": 2.205875, "cr": 5.0, "ab2": True},
]

GROUP_CC2 = "Claude-Code-2"
GROUP_AB2 = "AWS-Bedrock-2"

PT_COLS = {
    "zhCN": ["分组", "输入 / 输出 · 每 1M"],
    "zhTW": ["分組", "輸入 / 輸出 · 每 1M"],
    "en": ["Group", "In / Out per 1M"],
    "fr": ["Groupe", "Entrée / sortie / 1M"],
    "ru": ["Группа", "Вход / выход / 1M"],
    "ja": ["グループ", "入力 / 出力 · 1M"],
    "vi": ["Nhóm", "Vào / ra / 1M"],
}


def money(x: float) -> str:
    s = ("%.6f" % x).rstrip("0").rstrip(".")
    return "$" + s


def price_table(mr: float, cr: float, has_ab2: bool) -> dict:
    sell_in = round(mr * 2.0, 6)
    sell_out = round(sell_in * cr, 6)
    rows = [
        ["default", money(sell_in) + " / " + money(sell_out)],
        [GROUP_CC2, money(round(sell_in * RATIO_CC2, 6)) + " / " + money(round(sell_out * RATIO_CC2, 6))],
    ]
    if has_ab2:
        rows.append(
            [
                GROUP_AB2,
                money(round(sell_in * RATIO_AB2, 6))
                + " / "
                + money(round(sell_out * RATIO_AB2, 6)),
            ]
        )
    return {"columns": PT_COLS, "rows": rows}


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def get_opt(cur, key):
    row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    return row[0] if row else "{}"


def put_opt(cur, key, value):
    if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))


def csv_add(raw, names):
    parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
    seen = set(parts)
    for n in names:
        if n not in seen:
            parts.append(n)
            seen.add(n)
    return ",".join(parts)


def patch_copy(path):
    if not os.path.isfile(path):
        print("copy skip", path)
        return
    data = json.loads(open(path, encoding="utf-8").read())
    for m in MODELS:
        e = data.get(m["id"])
        if not isinstance(e, dict):
            print("copy missing", m["id"], path)
            continue
        e["price_table"] = price_table(m["mr"], m["cr"], m["ab2"])
        data[m["id"]] = e
    open(path, "w", encoding="utf-8").write(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    )
    print("copy patched", path)


def apply_db(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    gr = json.loads(get_opt(cur, "GroupRatio") or "{}")
    if not isinstance(gr, dict):
        gr = {}
    gr.setdefault("default", 1)
    gr.setdefault("vip", 1)
    gr[GROUP_CC2] = round(RATIO_CC2, 6)
    gr[GROUP_AB2] = round(RATIO_AB2, 6)
    put_opt(cur, "GroupRatio", json.dumps(gr, ensure_ascii=False, separators=(",", ":")))
    print("GroupRatio", gr)

    ug = json.loads(get_opt(cur, "UserUsableGroups") or "{}")
    if not isinstance(ug, dict):
        ug = {}
    ug.setdefault("default", "Default")
    ug.setdefault("vip", "VIP")
    ug[GROUP_CC2] = GROUP_CC2
    ug[GROUP_AB2] = GROUP_AB2
    put_opt(
        cur,
        "UserUsableGroups",
        json.dumps(ug, ensure_ascii=False, separators=(",", ":")),
    )

    ids = [m["id"] for m in MODELS]
    by_id = {m["id"]: m for m in MODELS}

    if "channels" in tabs and "group" in ch_cols:
        sql = "SELECT id, name, models, \"group\" FROM channels"
        if "deleted_at" in ch_cols:
            sql += " WHERE deleted_at IS NULL"
        for cid, name, models, grp in cur.execute(sql).fetchall():
            ms = {x.strip() for x in (models or "").split(",") if x.strip()}
            if not ms.intersection(ids):
                continue
            extra = [GROUP_CC2, GROUP_AB2]
            newg = csv_add(grp, extra)
            if newg != (grp or ""):
                sets = ['"group"=?']
                vals = [newg]
                if "updated_time" in ch_cols:
                    sets.append("updated_time=?")
                    vals.append(now)
                vals.append(cid)
                cur.execute(
                    "UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals
                )
                print("channel groups", cid, name, newg)

    if "abilities" in tabs:
        for mid in ids:
            rows = cur.execute(
                'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=?',
                (mid,),
            ).fetchall()
            if not rows:
                print("abilities missing", mid)
                continue
            want = [GROUP_CC2]
            if by_id[mid]["ab2"]:
                want.append(GROUP_AB2)
            have = {(g, cid) for g, cid, *_ in rows}
            template = [r for r in rows if (r[0] or "") == "default"] or rows
            for gnew in want:
                for g0, cid, enabled, priority, weight in template:
                    if (gnew, cid) in have:
                        continue
                    cur.execute(
                        'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                        (gnew, mid, cid, enabled, priority, weight),
                    )
                    have.add((gnew, cid))
                    print("ability", mid, gnew, "ch", cid)

    conn.commit()
    conn.close()
    print("db ok")


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else ""
    if db:
        apply_db(db)
    root = os.environ.get("KEYO_ROOT") or "/opt/ai-relay"
    for rel in (
        "config/marketplace-model-copy.json",
        "services/creem-moderation-proxy/marketplace-model-copy.json",
    ):
        patch_copy(os.path.join(root, rel))
    print("RATIO_CC2", round(RATIO_CC2, 6), "RATIO_AB2", round(RATIO_AB2, 6))
    print("DONE_ADD_CLAUDE_GROUPS")


if __name__ == "__main__":
    main()
