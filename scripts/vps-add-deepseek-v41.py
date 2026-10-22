#!/usr/bin/env python3
"""Register DeepSeek V4.1 Flash 1017 (paid) and DeepSeek V4.1 Flash 1017:free (gift credit).

Pricing:
  Upstream (UnoRouter):
    Input:  $0.220 / 1M tokens (model_ratio = 0.11)
    Output: $0.600 / 1M tokens (completion_ratio = 2.7273)

  Paid (deepseek-v4.1-flash-1017):
    Markup: 3x cost
    Input:  $0.660 / 1M tokens -> ModelRatio = 0.33
    Output: $1.800 / 1M tokens -> CompletionRatio = 2.7273

  Gift credit (deepseek-v4.1-flash-1017:free):
    Markup: 10x cost
    Input:  $2.200 / 1M tokens -> ModelRatio = 1.10
    Output: $6.000 / 1M tokens -> CompletionRatio = 2.7273
    Prioritizes gift_quota over recharge balance.

Public copy must NOT mention UnoRouter or upstream markup.
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

MODELS_CONFIG = [
    {
        "id": "deepseek-v4.1-flash-1017",
        "upstream": "deepseek-v4.1-flash-1017",
        "ratio": 0.33,    # 3x cost ($0.660 / 1M)
        "comp": 2.7273,   # 3x cost ($1.800 / 1M)
        "desc": "DeepSeek V4.1 Flash 1017 快照版对话与推理模型。基于 CED 因果编码器-解码器架构，具备原生多模态视觉理解能力与 1M 超长上下文，在代码辅助、复杂 Agent 与推理任务上速度与吞吐全面提升。支持文本与图像模态。",
        "vendor": "DeepSeek",
        "icon": "DeepSeek.Color",
        "tags": "大语言模型",
    },
    {
        "id": "deepseek-v4.1-flash-1017:free",
        "upstream": "deepseek-v4.1-flash-1017",
        "ratio": 1.10,    # 10x cost ($2.200 / 1M)
        "comp": 2.7273,   # 10x cost ($6.000 / 1M)
        "desc": "DeepSeek V4.1 Flash 1017 赠送金模型。基于 CED 架构与 1M 上下文，具备原生多模态视觉理解能力。可用赠送金调用（按对应费率计费，输入 $2.20 / 输出 $6.00 每 100 万 tokens），优先扣减赠送金，赠送金不足时扣充值余额。支持文本与图像模态。",
        "vendor": "DeepSeek",
        "icon": "DeepSeek.Color",
        "tags": "大语言模型",
    },
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
        values.append(icon or "DeepSeek.Color")
    if "description" in v_cols:
        fields.append("description")
        values.append("DeepSeek")
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

    # 1. Locate channel for UnoRouter / Keyo Chat
    sql = "SELECT id, name, models, base_url, model_mapping FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    channels = cur.fetchall()

    target_channel = None
    # Prefer channel named 'Keyo Chat'
    for c in channels:
        if (c[1] or "") == "Keyo Chat":
            target_channel = c
            break
    # Or channel with unorouter in base_url
    if not target_channel:
        for c in channels:
            if "unorouter" in (c[3] or ""):
                target_channel = c
                break

    if not target_channel:
        raise SystemExit("Target channel (Keyo Chat / UnoRouter) not found in channels table!")

    cid, cname, models_s, base_url, mapping_s = target_channel
    print(f"Target channel: [{cid}] {cname} (base_url: {base_url})")

    # Update channel models
    current_models = [m.strip() for m in (models_s or "").split(",") if m.strip()]
    mapping = json.loads(mapping_s or "{}") if mapping_s else {}

    for item in MODELS_CONFIG:
        mid = item["id"]
        up = item["upstream"]
        if mid not in current_models:
            current_models.append(mid)
        if mid != up:
            mapping[mid] = up

    sets = ["models=?", "model_mapping=?"]
    vals = [",".join(current_models), json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))]
    if "updated_time" in ch_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(cid)
    cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print(f"Channel updated with models: {len(current_models)}")

    # 2. Update marketplace models & abilities
    for item in MODELS_CONFIG:
        mid = item["id"]
        vid = ensure_vendor(cur, v_cols, item["vendor"], item["icon"], now)
        upsert_model(cur, m_cols, mid, item["desc"], item["icon"], item["tags"], vid, now)
        if "abilities" in tabs:
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                ("default", mid, cid, 1, 0, 1),
            )
            print(f"Ability added: {mid} -> channel {cid} (group: default)")

    # 3. Update ModelRatio, CompletionRatio, and clear from ModelPrice
    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    for item in MODELS_CONFIG:
        mid = item["id"]
        mr[mid] = item["ratio"]
        cr[mid] = item["comp"]
        mp.pop(mid, None)
        print(
            f"Pricing set for {mid}: ModelRatio={item['ratio']} (input ${(item['ratio']*2.0):.4f}/1M), "
            f"CompletionRatio={item['comp']} (output ${(item['ratio']*2.0*item['comp']):.4f}/1M)"
        )

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    conn.commit()
    conn.close()
    print("SUCCESS: deepseek-v4.1-flash-1017 and deepseek-v4.1-flash-1017:free registered successfully!")


if __name__ == "__main__":
    main()
