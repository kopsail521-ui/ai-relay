#!/usr/bin/env python3
"""Add 3 Gitee System One models to New API channel + marketplace.

SemIf-OpenJev-4B / DiffusionGemma-26B-A4B-it-Jev / laya-multilingual
Sell = upstream cost x2 (FX 7.3), output free:
  SemIf           cost ¥0.1/M  -> sell $0.027397/M -> ModelRatio=0.013699 CompletionRatio=0
  DiffusionGemma  cost ¥0.3/M  -> sell $0.082192/M -> ModelRatio=0.041096 CompletionRatio=0
  laya            cost ¥0.01/M -> sell $0.00274/M  -> ModelRatio=0.00137  CompletionRatio=0
Tag: 决策模型 (single tag). Public copy must NOT name Gitee.
Endpoint: POST /v1/systemone (Caddy -> gitee-passthrough :3010).
Abilities copied from Bespoke-Nimble-9B (gitee channel groups).
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

ABILITY_SRC = "Bespoke-Nimble-9B"
TAG = "决策模型"
ENDPOINTS = json.dumps(
    {"openai": {"path": "/v1/systemone", "method": "POST"}},
    separators=(",", ":"),
)

MODELS = [
    {
        "name": "SemIf-OpenJev-4B",
        "ratio": 0.013699,
        "comp": 0,
        "sell_in": 0.027397,
        "sell_out": 0.0,
        "vendor": "阿里巴巴",  # Qwen3.5-4B base
        "icon": "Qwen.Color",
        "desc": (
            "SemIf-OpenJev-4B：SemIf（原 OpenJev）项目的 4B 语义决策模型（System One，"
            "底座 Qwen3.5-4B，128K 上下文）。输入上下文 + 决策条件 + 候选选项，直接读取候选选项 "
            "Logits 概率返回结构化决策，不生成自然语言回答、无需 JSON 解析，适合 Agent 路由、分类、"
            "重试与完成判断等高频语义 if/else。计费：输入 $0.0274 / 输出 $0（每百万 tokens）。"
        ),
    },
    {
        "name": "DiffusionGemma-26B-A4B-it-Jev",
        "ratio": 0.041096,
        "comp": 0,
        "sell_in": 0.082192,
        "sell_out": 0.0,
        "vendor": "Google",  # Google DeepMind DiffusionGemma 26B A4B IT
        "icon": "Gemini.Color",
        "desc": (
            "DiffusionGemma-26B-A4B-it-Jev：基于 Google DeepMind DiffusionGemma 26B A4B IT 的"
            "块扩散语言模型（System One 决策，MoE 架构，总参约 25.2B、激活约 3.8B，NVFP4 量化，"
            "64K 上下文）。区别于逐 token 自回归生成，模型在固定 Token Canvas 上迭代去噪、可并行生成，"
            "直接读取预定义候选答案的概率分布，无需生成自由文本再解析，适用于 Agent 路由、工具选择、"
            "条件判断与分类评估。计费：输入 $0.0822 / 输出 $0（每百万 tokens）。"
        ),
    },
    {
        "name": "laya-multilingual",
        "ratio": 0.00137,
        "comp": 0,
        "sell_in": 0.00274,
        "sell_out": 0.0,
        "vendor": "其他",  # Convai Innovations（无内置图标，用 Custom）
        "icon": "Custom",
        "desc": (
            "Laya Multilingual：Convai Innovations 开源的多语言文本决策模型（System One，"
            "基于 mmBERT，约 322M 参数，8K 上下文，支持 100+ 语言）。非自回归架构一次前向完成判断，"
            "返回 choice（分类选择）/ score（等级评分）/ noul（条件判断）及对应概率；单次请求最多 "
            "16 道问题、每题 ≤8192 tokens、选择题 ≤20 个候选、请求体 ≤1 MiB。适用于工单分流、"
            "意图识别、内容审核与智能体路由。计费：输入 $0.00274 / 输出 $0（每百万 tokens）。"
        ),
    },
]


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


def find_gitee_channel(cur, ch_cols):
    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    rows = cur.execute(sql).fetchall()
    for cid, name, models, base in rows:
        blob = ((name or "") + " " + (base or "")).lower()
        if "gitee" in blob or "模力" in (name or "") or "ai.gitee.com" in (base or ""):
            return cid, name, models or ""
    for cid, name, models, base in rows:
        ms = [x.strip() for x in (models or "").split(",") if x.strip()]
        if ABILITY_SRC in ms:
            return cid, name, models or ""
    return None


def ensure_vendor(cur, v_cols, name, icon, now):
    row = cur.execute("SELECT id FROM vendors WHERE name=?", (name,)).fetchone()
    if row:
        return row[0]
    fields = ["name"]
    values = [name]
    if "icon" in v_cols:
        fields.append("icon")
        values.append(icon)
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
    print("vendor created", name)
    return cur.lastrowid


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")

    target = find_gitee_channel(cur, ch_cols)
    if target is None:
        raise SystemExit("Gitee channel not found")
    cid, cname, models_s = target
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    added = []
    for m in MODELS:
        if m["name"] not in parts:
            parts.insert(0, m["name"])
            added.append(m["name"])
    if added:
        merged = ",".join(parts)
        if "updated_time" in ch_cols:
            cur.execute(
                "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                (merged, now, cid),
            )
        else:
            cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
        print("channel", cid, cname, "added", ",".join(added))
    else:
        print("channel", cid, cname, "already has all models")

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    for m in MODELS:
        mr[m["name"]] = m["ratio"]
        cr[m["name"]] = m["comp"]
        mp.pop(m["name"], None)
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        cur,
        "CompletionRatio",
        json.dumps(cr, ensure_ascii=False, separators=(",", ":")),
    )
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing set for", len(MODELS), "models")

    v_cols = cols(cur, "vendors")
    vendor_ids = {}
    for m in MODELS:
        if m["vendor"] not in vendor_ids:
            vendor_ids[m["vendor"]] = ensure_vendor(
                cur, v_cols, m["vendor"], m["icon"], now
            )

    m_cols = cols(cur, "models")
    for m in MODELS:
        name = m["name"]
        if "deleted_at" in m_cols:
            cur.execute(
                "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
                (name,),
            )
        model_sql = "SELECT id FROM models WHERE model_name=?"
        if "deleted_at" in m_cols:
            model_sql += " AND deleted_at IS NULL"
        mrow = cur.execute(model_sql, (name,)).fetchone()
        if mrow is None:
            fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
            values = [name, m["desc"], m["icon"], TAG, vendor_ids[m["vendor"]], ENDPOINTS]
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
            print("marketplace created", name)
        else:
            sets = [
                "description=?",
                "icon=?",
                "tags=?",
                "vendor_id=?",
                "endpoints=?",
            ]
            vals = [m["desc"], m["icon"], TAG, vendor_ids[m["vendor"]], ENDPOINTS]
            if "status" in m_cols:
                sets.append("status=1")
            if "sync_official" in m_cols:
                sets.append("sync_official=0")
            if "updated_time" in m_cols:
                sets.append("updated_time=?")
                vals.append(now)
            vals.append(mrow[0])
            cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
            print("marketplace updated", name)

    try:
        ab_src = cur.execute(
            'SELECT "group", enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (ABILITY_SRC,),
        ).fetchall()
        for m in MODELS:
            cur.execute("DELETE FROM abilities WHERE model=?", (m["name"],))
            if ab_src:
                for g, en, pri, w in ab_src:
                    cur.execute(
                        'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                        (g, m["name"], cid, en, pri, w),
                    )
            else:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    ("default", m["name"], cid, 1, 0, 1),
                )
        print("abilities ensured from", ABILITY_SRC, "for", len(MODELS), "models / channel", cid)
    except Exception as e:
        print("abilities skip:", e)

    conn.commit()
    conn.close()
    print("DONE_ADD_GITEE_SYSTEMONE3")


if __name__ == "__main__":
    main()
