#!/usr/bin/env python3
"""Rename grok-imagine-video-1.5 -> grok-video-1.5 in the DB, rewrite its
description (bash $0-expansion mojibake guard), and correct mis-tagged models:
  UVDoc                    tags 图像处理 -> OCR
  gemini-embedding-2-preview  tags -> 嵌入模型 (+ embed endpoint, Google vendor)
Prints a full live model->tag audit at the end for review.
Usage: python3 vps-grok-video-rename-fix.py [/path/to/one-api.db]
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

OLD_ID = "grok-imagine-video-1.5"
NEW_ID = "grok-video-1.5"
UPSTREAM_ID = "grok-1.5-官转接口"
SELL_USD = 0.30822
CHANNEL_NAME = "Keyo Video"
DESC = (
    "xAI Grok Imagine Video 1.5：文生 / 单图 / 首尾帧 / 多参考图一个接口全支持，"
    "可调时长、分辨率与画幅，内置音频。计费：$0.3082/次。"
)
EP_CHAT = json.dumps(
    {"openai": {"path": "/v1/chat/completions", "method": "POST"}},
    separators=(",", ":"),
)
EP_EMBED = json.dumps({"openai": "/v1/embeddings"}, separators=(",", ":"))
EP_UVDOC = json.dumps(
    {"image-generation": {"path": "/v1/images/unwarping", "method": "POST"}},
    separators=(",", ":"),
)


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    # 1) rename across models / abilities / channels / options / mapping
    cur.execute(
        "UPDATE models SET model_name=?, description=?, updated_time=? WHERE model_name=?",
        (NEW_ID, DESC, now, OLD_ID),
    )
    print("models renamed:", cur.rowcount)
    cur.execute("UPDATE abilities SET model=? WHERE model=?", (NEW_ID, OLD_ID))
    print("abilities renamed:", cur.rowcount)
    cur.execute("SELECT id, models FROM channels")
    for cid, models in cur.fetchall():
        if models and OLD_ID in models:
            parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
            new_parts = [NEW_ID if p == OLD_ID else p for p in parts]
            if "updated_time" in ch_cols:
                cur.execute(
                    "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                    (",".join(new_parts), now, cid),
                )
            else:
                cur.execute(
                    "UPDATE channels SET models=? WHERE id=?", (",".join(new_parts), cid)
                )
            print("channel", cid, "models updated")
    if "model_mapping" in ch_cols:
        cur.execute(
            "SELECT id, model_mapping FROM channels WHERE model_mapping LIKE ?",
            ("%" + OLD_ID + "%",),
        )
        for cid, mapping in cur.fetchall():
            try:
                mm = json.loads(mapping or "{}")
            except Exception:
                continue
            if OLD_ID in mm:
                mm[NEW_ID] = mm.pop(OLD_ID)
                cur.execute(
                    "UPDATE channels SET model_mapping=? WHERE id=?",
                    (json.dumps(mm, ensure_ascii=False, separators=(",", ":")), cid),
                )
                print("channel", cid, "model_mapping updated ->", json.dumps(mm, ensure_ascii=False))

    mr = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0] or "{}")
    cr = json.loads(cur.execute("SELECT value FROM options WHERE key='CompletionRatio'").fetchone()[0] or "{}")
    mp_row = cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()
    mp = json.loads(mp_row[0] or "{}")
    changed = False
    if OLD_ID in mp:
        mp[NEW_ID] = SELL_USD
        del mp[OLD_ID]
        changed = True
    elif NEW_ID not in mp:
        mp[NEW_ID] = SELL_USD
        changed = True
    for mid in (OLD_ID, NEW_ID):
        if mid in mr:
            del mr[mid]
            changed = True
        if mid in cr:
            del cr[mid]
            changed = True
    if changed:
        cur.execute(
            "UPDATE options SET value=? WHERE key='ModelPrice'",
            (json.dumps(mp, ensure_ascii=False, separators=(",", ":")),),
        )
        cur.execute(
            "UPDATE options SET value=? WHERE key='ModelRatio'",
            (json.dumps(mr, ensure_ascii=False, separators=(",", ":")),),
        )
        cur.execute(
            "UPDATE options SET value=? WHERE key='CompletionRatio'",
            (json.dumps(cr, ensure_ascii=False, separators=(",", ":")),),
        )
    print("pricing:", NEW_ID, "= $%s / request" % SELL_USD)

    # 2) tag corrections
    fixes = [
        ("UVDoc", "OCR", EP_UVDOC, None),
        ("gemini-embedding-2-preview", "嵌入模型", EP_EMBED, "Google"),
    ]
    for mid, tag, endpoints, vendor in fixes:
        vid = None
        if vendor:
            row = cur.execute("SELECT id FROM vendors WHERE name=?", (vendor,)).fetchone()
            if row:
                vid = row[0]
            else:
                fields = ["name"]
                values = [vendor]
                if "icon" in v_cols:
                    fields.append("icon")
                    values.append("Gemini.Color" if vendor == "Google" else "Custom")
                if "status" in v_cols:
                    fields.append("status")
                    values.append(1)
                if "created_time" in v_cols:
                    fields.append("created_time")
                    values.append(now)
                if "updated_time" in v_cols:
                    fields.append("updated_time")
                    values.append(now)
                cur.execute(
                    "INSERT INTO vendors(%s) VALUES (%s)"
                    % (",".join(fields), ",".join(["?"] * len(fields))),
                    values,
                )
                vid = cur.lastrowid
                print("vendor created", vendor)
        if "deleted_at" in m_cols:
            cur.execute(
                "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
                (mid,),
            )
        if vid:
            cur.execute(
                "UPDATE models SET tags=?, endpoints=?, vendor_id=?, status=1, updated_time=? WHERE model_name=?",
                (tag, endpoints, vid, now, mid),
            )
        else:
            cur.execute(
                "UPDATE models SET tags=?, endpoints=?, status=1, updated_time=? WHERE model_name=?",
                (tag, endpoints, now, mid),
            )
        print("tag fix:", mid, "->", tag, "(rows:", cur.rowcount, ")")

    conn.commit()

    # 3) full audit: every live model with its tag
    print("--- model tag audit ---")
    rows = cur.execute(
        "SELECT model_name, tags FROM models WHERE deleted_at IS NULL OR deleted_at=0 ORDER BY tags, model_name"
    ).fetchall()
    by_tag = {}
    for name, tags in rows:
        by_tag.setdefault(tags or "(empty)", []).append(name)
    for tag in sorted(by_tag):
        print(tag, ":", ", ".join(by_tag[tag]))
    print("total live models:", len(rows))
    conn.close()
    print("DONE_GROK_VIDEO_RENAME_FIX")


if __name__ == "__main__":
    main()
