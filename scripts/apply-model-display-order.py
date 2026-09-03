#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
按供应商优先级 + 同供应商新模型靠前，写 models.display_order / pinned。
若无 display_order 列则退出并提示升级。
排序键越小越靠前（与 new-api PR#5090: pinned DESC, display_order ASC, id DESC 对齐）。
"""
import json
import os
import sqlite3
import sys
import time

# 用户指定的供应商顺序（截图）；其它未列出的插在「其他」之前
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
    "SiliconFlow",
    "Spark",
    "ChatGLM",
    "智谱",
    "Suno",
    "PixVerse",
]

# 别名归一
VENDOR_ALIAS = {
    "Grok": "xAI",
    "Minimax": "MiniMax",
    "ChatGLM": "智谱",
    "Zhipu": "智谱",
    "Qwen": "阿里巴巴",
    "Alibaba": "阿里巴巴",
}


def normalize(name):
    if not name:
        return "其他"
    n = name.strip()
    return VENDOR_ALIAS.get(n, n)


def vendor_rank(name):
    n = normalize(name)
    if n == "其他" or n.lower() in ("other", "custom", "未知"):
        return 10_000
    # preferred list order (dedupe logical names)
    preferred = []
    seen = set()
    for x in VENDOR_ORDER:
        nx = normalize(x)
        if nx not in seen and nx != "其他":
            seen.add(nx)
            preferred.append(nx)
    if n in preferred:
        return preferred.index(n)
    return 5_000  # unknown vendors before 其他


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    mcols = cols(cur, "models")
    if "display_order" not in mcols:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "models 表没有 display_order 列",
                    "hint": "当前 New API 版本不支持自定义展示顺序。可升级到带 pinned/display_order 的版本，或只能靠 id 倒序。",
                    "columns": sorted(mcols),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        conn.close()
        raise SystemExit(2)

    now = int(time.time())
    where = "WHERE deleted_at IS NULL" if "deleted_at" in mcols else ""
    cur.execute(
        """
        SELECT m.id, m.model_name, m.vendor_id, v.name
        FROM models m
        LEFT JOIN vendors v ON v.id = m.vendor_id
        %s
        ORDER BY m.id DESC
        """
        % where
    )
    rows = cur.fetchall()

    # 同供应商内：id 越大越新 → 组内序号越小
    by_vendor = {}
    for mid, mname, vid, vname in rows:
        by_vendor.setdefault(vid, []).append((mid, mname, vname))

    within_rank = {}  # model_id -> 0,1,2... within vendor (0 = newest)
    for vid, items in by_vendor.items():
        items_sorted = sorted(items, key=lambda x: x[0], reverse=True)
        for i, (mid, _, _) in enumerate(items_sorted):
            within_rank[mid] = i

    updated = []
    has_pinned = "pinned" in mcols
    has_updated = "updated_time" in mcols

    for mid, mname, vid, vname in rows:
        vr = vendor_rank(vname)
        wr = within_rank.get(mid, 0)
        # display_order ASC：供应商越靠前数字越小；同供应商内越新越小
        display_order = vr * 1000 + wr
        pinned = 1 if vr == 0 and wr == 0 else 0  # 可选：不强制置顶
        pinned = 0  # 不自动置顶，只靠 display_order

        if has_pinned and has_updated:
            cur.execute(
                "UPDATE models SET display_order=?, pinned=?, updated_time=? WHERE id=?",
                (display_order, pinned, now, mid),
            )
        elif has_pinned:
            cur.execute(
                "UPDATE models SET display_order=?, pinned=? WHERE id=?",
                (display_order, pinned, mid),
            )
        elif has_updated:
            cur.execute(
                "UPDATE models SET display_order=?, updated_time=? WHERE id=?",
                (display_order, now, mid),
            )
        else:
            cur.execute(
                "UPDATE models SET display_order=? WHERE id=?",
                (display_order, mid),
            )
        updated.append(
            {
                "id": mid,
                "model": mname,
                "vendor": vname,
                "vendor_rank": vr,
                "within": wr,
                "display_order": display_order,
            }
        )

    # 尝试给 vendors 也写顺序（若有字段）
    vcols = cols(cur, "vendors")
    vendor_order_applied = False
    if "display_order" in vcols or "sort" in vcols or "sort_order" in vcols:
        field = (
            "display_order"
            if "display_order" in vcols
            else ("sort" if "sort" in vcols else "sort_order")
        )
        cur.execute("SELECT id, name FROM vendors")
        for vid, vname in cur.fetchall():
            cur.execute(
                "UPDATE vendors SET %s=? WHERE id=?" % field,
                (vendor_rank(vname), vid),
            )
        vendor_order_applied = True

    conn.commit()
    conn.close()

    # preview first 20
    preview = sorted(updated, key=lambda x: (x["display_order"], -x["id"]))[:20]
    print(
        json.dumps(
            {
                "ok": True,
                "updated": len(updated),
                "vendor_order_applied": vendor_order_applied,
                "preview": preview,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
