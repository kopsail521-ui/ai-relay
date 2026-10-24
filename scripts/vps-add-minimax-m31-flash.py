#!/usr/bin/env python3
"""Register MiniMax-M3.1-Flash on Keyo Primary (OpenLux).

Pricing:
  Upstream: OpenLux (Self-Deployed-1 cheapest enable_group, ratio = 0.3)
    Model ratio: 0.075
    Completion ratio: 4.0
    Cost In:  0.075 * 0.3 * $2.0 = $0.0450 / 1M tokens (¥0.315 / 1M)
    Cost Out: $0.0450 * 4.0 = $0.1800 / 1M tokens (¥1.260 / 1M)

  Keyo Selling Price (Markup: 2x cost):
    Sell In:  $0.0450 * 2 = $0.0900 / 1M tokens -> ModelRatio = 0.0450
    Sell Out: $0.1800 * 2 = $0.3600 / 1M tokens -> CompletionRatio = 4.0

Public copy must NOT mention OpenLux or upstream markup.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))

MODEL_CONFIG = {
    "id": "MiniMax-M3.1-Flash",
    "upstream": "MiniMax-M3.1-Flash",
    "ratio": 0.0450,  # 2x cost ($0.0900 / 1M)
    "comp": 4.0,      # 2x cost ($0.3600 / 1M)
    "desc": "MiniMax M3.1 Flash 原生多模态大语言模型。具备 1M 超长上下文与思考深度可调特性，在代码、复杂推理、工具调用与多模态视觉理解方面兼具高速响应与高性价比。支持文本与图像模态。",
    "vendor": "MiniMax",
    "icon": "Minimax.Color",
    "tags": "大语言模型,工具,识图",
}


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


def ensure_vendor(cur, v_cols, name, icon, now):
    cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        if "icon" in v_cols and icon:
            cur.execute(
                "UPDATE vendors SET icon=? WHERE id=? AND (icon IS NULL OR icon='' OR icon='Custom')",
                (icon, row[0]),
            )
        return row[0]
    fields = ["name"]
    values = [name]
    if "icon" in v_cols:
        fields.append("icon")
        values.append(icon or "Minimax.Color")
    if "description" in v_cols:
        fields.append("description")
        values.append("MiniMax")
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
    return cur.lastrowid


def upsert_model(cur, m_cols, mid, desc, icon, tags, vid, now):
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (mid,),
        )
    row = cur.execute("SELECT id FROM models WHERE model_name=?", (mid,)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [mid, desc, icon, tags, vid, EP]
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
        print("marketplace created", mid)
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
        vals = [desc, icon, tags, vid, EP]
        if "status" in m_cols:
            sets.append("status=1")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", mid)


def main():
    if not os.path.exists(DB):
        raise SystemExit("DB not found: " + DB)

    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    # 1. Locate channel for OpenLux / Keyo Primary
    sql = 'SELECT id, name, models, base_url, "group" FROM channels'
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    channels = cur.fetchall()

    target_channel = None
    # Prefer channel named 'Keyo Primary'
    for c in channels:
        if (c[1] or "") == "Keyo Primary":
            target_channel = c
            break
    # Or channel with openlux in base_url
    if not target_channel:
        for c in channels:
            if "openlux" in (c[3] or "").lower():
                target_channel = c
                break

    if not target_channel:
        raise SystemExit("Target channel (Keyo Primary / OpenLux) not found in channels table!")

    cid, cname, models_s, base_url, cgroup = target_channel
    print(f"Target channel: [{cid}] {cname} (base_url: {base_url})")

    # Update channel models
    current_models = [m.strip() for m in (models_s or "").split(",") if m.strip()]
    mid = MODEL_CONFIG["id"]
    if mid not in current_models:
        current_models.append(mid)

    sets = ["models=?"]
    vals = [",".join(current_models)]
    if "updated_time" in ch_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(cid)
    cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print(f"Channel updated with models: {len(current_models)}")

    # 2. Update marketplace models & abilities
    vid = ensure_vendor(cur, v_cols, MODEL_CONFIG["vendor"], MODEL_CONFIG["icon"], now)
    upsert_model(cur, m_cols, mid, MODEL_CONFIG["desc"], MODEL_CONFIG["icon"], MODEL_CONFIG["tags"], vid, now)

    if "abilities" in tabs:
        cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
        groups = [g.strip() for g in (cgroup or "default").split(",") if g.strip()]
        if not groups:
            groups = ["default"]
        for g in groups:
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                (g, mid, cid, 1, 0, 1),
            )
            print(f"Ability added: {mid} -> channel {cid} (group: {g})")

    # 3. Update ModelRatio, CompletionRatio, and clear from ModelPrice
    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    mr[mid] = MODEL_CONFIG["ratio"]
    cr[mid] = MODEL_CONFIG["comp"]
    mp.pop(mid, None)
    print(
        f"Pricing set for {mid}: ModelRatio={MODEL_CONFIG['ratio']} (input ${(MODEL_CONFIG['ratio']*2.0):.4f}/1M), "
        f"CompletionRatio={MODEL_CONFIG['comp']} (output ${(MODEL_CONFIG['ratio']*2.0*MODEL_CONFIG['comp']):.4f}/1M)"
    )

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    conn.commit()
    conn.close()
    print(f"SUCCESS: {mid} registered successfully!")


if __name__ == "__main__":
    main()
