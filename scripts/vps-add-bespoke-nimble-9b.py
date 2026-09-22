#!/usr/bin/env python3
"""Add Bespoke-Nimble-9B (System One) to Gitee channel + marketplace.

Sell: $0.032 / $0 per 1M tokens → ModelRatio=0.016 CompletionRatio=0
Tag: 系统一模型 (single tag). Public copy must NOT name Gitee.
Endpoint: POST /v1/systemone (Caddy → gitee-passthrough :3010).
"""
import json
import os
import sqlite3
import sys
import time

MODEL = "Bespoke-Nimble-9B"
OUR_MODEL_RATIO = 0.016  # $0.032 / 2
OUR_COMPLETION_RATIO = 0
SELL_IN = 0.032
SELL_OUT = 0.0
TAG = "系统一模型"
VENDOR = "阿里巴巴"  # Qwen-based → Alibaba / Qwen.Color logo
ICON = "Qwen.Color"
ENDPOINTS = json.dumps(
    {"openai": {"path": "/v1/systemone", "method": "POST"}},
    separators=(",", ":"),
)
DESC = (
    "Bespoke Nimble 9B：System One 结构化决策模型。"
    "输入状态（state）与问题集（questions），一次返回 choice / score / noul 结构化答案（含选项概率），无需链式推理文本。"
    "计费：输入 $%.3f / 输出 $%.0f（每百万 tokens）。" % (SELL_IN, SELL_OUT)
)
ABILITY_SRC = "gemma-4-26B-A4B-it"


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")

    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    channels = cur.fetchall()

    target = None
    for cid, name, models, base in channels:
        blob = ((name or "") + " " + (base or "")).lower()
        if "gitee" in blob or "模力" in (name or "") or "ai.gitee.com" in (base or ""):
            target = (cid, name, models or "")
            break
    if target is None:
        for cid, name, models, base in channels:
            ms = [x.strip() for x in (models or "").split(",") if x.strip()]
            if ABILITY_SRC in ms or "Atria-dawn-v2" in ms:
                target = (cid, name, models or "")
                break
    if target is None:
        raise SystemExit("Gitee channel not found")

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

    def get_opt(key):
        cur.execute("SELECT value FROM options WHERE key=?", (key,))
        row = cur.fetchone()
        return row[0] if row else "{}"

    def put_opt(key, value):
        cur.execute("SELECT key FROM options WHERE key=?", (key,))
        if cur.fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))

    mr = json.loads(get_opt("ModelRatio") or "{}")
    cr = json.loads(get_opt("CompletionRatio") or "{}")
    mp = json.loads(get_opt("ModelPrice") or "{}")
    mr[MODEL] = OUR_MODEL_RATIO
    cr[MODEL] = OUR_COMPLETION_RATIO
    mp.pop(MODEL, None)
    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":"))
    )
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing ratio", OUR_MODEL_RATIO, "comp", OUR_COMPLETION_RATIO)

    cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,))
    vrow = cur.fetchone()
    if vrow is None:
        raise SystemExit("vendor missing: " + VENDOR)
    vid = vrow[0]

    m_cols = cols(cur, "models")
    model_sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        model_sql += " AND deleted_at IS NULL"
    cur.execute(model_sql, (MODEL,))
    mrow = cur.fetchone()
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
        q = "INSERT INTO models(%s) VALUES (%s)" % (
            ",".join(fields),
            ",".join(["?"] * len(fields)),
        )
        cur.execute(q, values)
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
        cur.execute(
            'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (ABILITY_SRC,),
        )
        ab_src = cur.fetchall()
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
    print(
        "DONE_ADD_BESPOKE_NIMBLE sell_in=$%.3f sell_out=$%.0f tag=%s"
        % (SELL_IN, SELL_OUT, TAG)
    )


if __name__ == "__main__":
    main()
