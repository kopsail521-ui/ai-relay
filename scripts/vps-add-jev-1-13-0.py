#!/usr/bin/env python3
"""Add jev-1.13.0 (System One) via OpenLux cost×2.

OpenLux: model_ratio=0.021, group jev-1 ratio=0.4
  cost_in = 0.021 * 0.4 * 2 = $0.0168 / 1M ; output free
  sell ×2 → $0.0336 / $0 → ModelRatio=0.0168 CompletionRatio=0

Traffic: Caddy /v1/systemone* → gitee-passthrough → OpenLux (relay=openlux_passthrough).
Public copy must NOT name OpenLux.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

MODEL = "jev-1.13.0"
OUR_MODEL_RATIO = 0.0168  # $0.0336 / 2
OUR_COMPLETION_RATIO = 0
SELL_IN = 0.0336
SELL_OUT = 0.0
TAG = "系统一模型"
VENDOR = "其他"
ICON = "Custom"
ENDPOINTS = json.dumps(
    {"openai": {"path": "/v1/systemone", "method": "POST"}},
    separators=(",", ":"),
)
DESC = (
    "TypeSafe Jev 1.13.0：System One 结构化决策模型（不生成自由文本），"
    "用于程序内分类、工单分诊、风险打分与路由。输入 state + questions，返回 choice / score / noul；"
    "上下文约 32k tokens。计费：输入 $%.4f / 输出 $%.0f（每百万 tokens）。" % (SELL_IN, SELL_OUT)
)
ABILITY_SRC = "gpt-5.6-luna"


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


def find_openlux_channel(cur, ch_cols):
    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    rows = cur.execute(sql).fetchall()
    for cid, name, models, base in rows:
        blob = ((name or "") + " " + (base or "")).lower()
        if "openlux" in blob or "openlux.ai" in (base or "").lower():
            return cid, name, models or ""
    return None


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")

    target = find_openlux_channel(cur, ch_cols)
    if target is None:
        raise SystemExit("OpenLux channel not found")
    cid, cname, models_s = target
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    if MODEL not in parts:
        parts.insert(0, MODEL)
        merged = ",".join(parts)
        if "updated_time" in ch_cols:
            cur.execute(
                "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                (merged, now, cid),
            )
        else:
            cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
        print("channel", cid, cname, "added", MODEL)
    else:
        print("channel", cid, cname, "already has", MODEL)

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    mr[MODEL] = OUR_MODEL_RATIO
    cr[MODEL] = OUR_COMPLETION_RATIO
    mp.pop(MODEL, None)
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        cur,
        "CompletionRatio",
        json.dumps(cr, ensure_ascii=False, separators=(",", ":")),
    )
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing ratio", OUR_MODEL_RATIO, "comp", OUR_COMPLETION_RATIO, "sell_in", SELL_IN)

    v_cols = cols(cur, "vendors")
    row = cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,)).fetchone()
    if row is None:
        fields = ["name"]
        values = [VENDOR]
        if "icon" in v_cols:
            fields.append("icon")
            values.append(ICON)
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
        print("vendor created", VENDOR, vid)
    else:
        vid = row[0]

    m_cols = cols(cur, "models")
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (MODEL,),
        )
    model_sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        model_sql += " AND deleted_at IS NULL"
    mrow = cur.execute(model_sql, (MODEL,)).fetchone()
    if mrow is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [MODEL, DESC, ICON, TAG, vid, ENDPOINTS]
        if "status" in m_cols:
            fields.append("status")
            values.append(1)
        if "sync_official" in m_cols:
            fields.append("sync_official")
            values.append(0)
        if "created_time" in m_cols:
            fields.append("created_time")
            values.append(now)
        if "updated_time" in m_cols:
            fields.append("updated_time")
            values.append(now)
        cur.execute(
            "INSERT INTO models(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        print("marketplace created", MODEL)
    else:
        sets = [
            "description=?",
            "icon=?",
            "tags=?",
            "vendor_id=?",
            "endpoints=?",
        ]
        vals = [DESC, ICON, TAG, vid, ENDPOINTS]
        if "status" in m_cols:
            sets.append("status=1")
        if "sync_official" in m_cols:
            sets.append("sync_official=0")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(mrow[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", MODEL)

    try:
        ab_src = cur.execute(
            'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (ABILITY_SRC,),
        ).fetchall()
        cur.execute("DELETE FROM abilities WHERE model=?", (MODEL,))
        if ab_src:
            for g, ch, en, pri, w in ab_src:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    (g, MODEL, cid, en, pri, w),
                )
            print("abilities copied from", ABILITY_SRC, "→ channel", cid, ":", len(ab_src))
        else:
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                ("default", MODEL, cid, 1, 0, 1),
            )
            print("abilities ensured for default / channel", cid)
    except Exception as e:
        print("abilities skip:", e)

    conn.commit()
    conn.close()
    print("DONE_ADD_JEV_113")


if __name__ == "__main__":
    main()
