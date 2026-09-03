#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
模型广场排序：
1) 按供应商固定顺序
2) 同一供应商内新模型（更大 id）靠前
3) 「其他」排最后
依赖 New API 的 display_order（若无该列则报错提示需升级）
排序规则与上游一致：pinned DESC, display_order ASC, id DESC
"""
import json
import os
import sqlite3
import sys
import time

# 用户指定的供应商顺序（越靠前数字越小）
VENDOR_ORDER = [
    "OpenAI",
    "Anthropic",
    "Google",
    "DeepSeek",
    "xAI",
    "Grok",
    "Midjourney",
    "Moonshot",
    "MiniMax",
    "Minimax",
    "Ollama",
    "Flux",
    "Xiaomi",
    "Vidu",
    "Kling",
    "Doubao",
    "Qwen",
    "阿里巴巴",
    "Wenxin",
    "文心",
    "SiliconFlow",
    "Spark",
    "讯飞",
    "ChatGLM",
    "智谱",
    "Suno",
    "PixVerse",
]

# 别名归一到标准名（用于排序键）
VENDOR_ALIAS = {
    "Minimax": "MiniMax",
    "Grok": "xAI",
    "文心": "Wenxin",
    "讯飞": "Spark",
    "智谱": "ChatGLM",
    "阿里巴巴": "Qwen",
}


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def vendor_rank(name):
    if not name:
        return 9000
    if name == "其他":
        return 9500
    n = VENDOR_ALIAS.get(name, name)
    # 精确匹配
    for i, v in enumerate(VENDOR_ORDER):
        canon = VENDOR_ALIAS.get(v, v)
        if n == canon or n == v or name == v:
            return i
    # 前缀/包含（应对 OpenAI Compatible、Xiaomi… 截断名）
    lower = n.lower()
    for i, v in enumerate(VENDOR_ORDER):
        canon = VENDOR_ALIAS.get(v, v)
        if lower.startswith(canon.lower()) or canon.lower().startswith(lower):
            return i
        if canon.lower() in lower or lower in canon.lower():
            return i
    return 8000  # 未列出的供应商：其他之前、已知厂商之后


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    dry = "--dry" in sys.argv
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    mcols = cols(cur, "models")
    vcols = cols(cur, "vendors")

    if "display_order" not in mcols:
        # 尝试仅看 vendors 是否有排序字段
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "models.display_order 不存在",
                    "hint": "当前 New API 镜像不支持自定义展示顺序。需要升级到带 pinned/display_order 的版本，或改用删建模型的土办法。",
                    "model_columns": sorted(mcols),
                    "vendor_columns": sorted(vcols),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        conn.close()
        raise SystemExit(2)

    where = "deleted_at IS NULL" if "deleted_at" in mcols else "1=1"
    cur.execute(
        """
        SELECT m.id, m.model_name, m.vendor_id, v.name
        FROM models m
        LEFT JOIN vendors v ON v.id = m.vendor_id
        WHERE %s
        ORDER BY m.id DESC
        """
        % where
    )
    rows = cur.fetchall()

    # 按供应商分组，组内已是 id DESC（新→旧）
    by_vendor = {}
    for mid, mname, vid, vname in rows:
        key = vname or "其他"
        by_vendor.setdefault(key, []).append((mid, mname, vid, vname))

    # 供应商按 rank 排序；同 rank 按名
    vendor_names = sorted(by_vendor.keys(), key=lambda n: (vendor_rank(n), n))

    # 分配 display_order：全局递增，保证供应商顺序 + 组内新模型更小的 order
    # display_order ASC → 先出现
    updates = []
    order = 10
    plan = []
    for vname in vendor_names:
        models = by_vendor[vname]  # already id DESC
        for mid, mname, vid, _ in models:
            updates.append((order, mid))
            plan.append(
                {
                    "display_order": order,
                    "vendor": vname,
                    "vendor_rank": vendor_rank(vname),
                    "id": mid,
                    "model": mname,
                }
            )
            order += 10

    has_pinned = "pinned" in mcols
    now = int(time.time())

    if dry:
        print(
            json.dumps(
                {
                    "ok": True,
                    "dry": True,
                    "count": len(updates),
                    "vendors": [
                        {"name": n, "rank": vendor_rank(n), "count": len(by_vendor[n])}
                        for n in vendor_names
                    ],
                    "head": plan[:15],
                    "tail": plan[-10:],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        conn.close()
        return

    for disp, mid in updates:
        if has_pinned and "updated_time" in mcols:
            cur.execute(
                "UPDATE models SET display_order=?, pinned=0, updated_time=? WHERE id=?",
                (disp, now, mid),
            )
        elif "updated_time" in mcols:
            cur.execute(
                "UPDATE models SET display_order=?, updated_time=? WHERE id=?",
                (disp, now, mid),
            )
        else:
            cur.execute(
                "UPDATE models SET display_order=? WHERE id=?",
                (disp, mid),
            )

    conn.commit()
    conn.close()
    print(
        json.dumps(
            {
                "ok": True,
                "updated": len(updates),
                "vendors": [
                    {"name": n, "rank": vendor_rank(n), "count": len(by_vendor[n])}
                    for n in vendor_names
                ],
                "sample_head": plan[:8],
                "sample_other_or_tail": [p for p in plan if p["vendor"] == "其他"][:5]
                or plan[-5:],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
