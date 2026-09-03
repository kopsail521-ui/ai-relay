#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
当前 New API 无 display_order 时：通过「软删 + 按目标顺序重建」让 id DESC
呈现为：供应商固定顺序 + 同供应商新模型靠前 +「其他」最后。

注意：会改 models.id（自增重排）。abilities 按 model 名关联，一般不受影响。
"""
import json
import os
import sqlite3
import sys
import time

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
    for i, v in enumerate(VENDOR_ORDER):
        canon = VENDOR_ALIAS.get(v, v)
        if n == canon or n == v or name == v:
            return i
    lower = (n or "").lower()
    for i, v in enumerate(VENDOR_ORDER):
        canon = VENDOR_ALIAS.get(v, v)
        cl = canon.lower()
        if lower.startswith(cl) or cl.startswith(lower) or cl in lower or lower in cl:
            return i
    return 8000


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    dry = "--dry" in sys.argv
    apply = "--apply" in sys.argv
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    if not dry and not apply:
        raise SystemExit("用法: ... --dry  或  ... --apply")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    mcols = cols(cur, "models")
    if "deleted_at" not in mcols:
        raise SystemExit("models.deleted_at missing, abort")

    cur.execute(
        """
        SELECT m.*, v.name AS vendor_name
        FROM models m
        LEFT JOIN vendors v ON v.id = m.vendor_id
        WHERE m.deleted_at IS NULL
        ORDER BY m.id DESC
        """
    )
    rows = [dict(r) for r in cur.fetchall()]

    def sort_key(r):
        return (vendor_rank(r.get("vendor_name")), -int(r["id"]))

    desired = sorted(rows, key=sort_key)  # 展示顺序：先→后
    plan = [
        {
            "pos": i + 1,
            "old_id": r["id"],
            "model": r["model_name"],
            "vendor": r.get("vendor_name"),
            "rank": vendor_rank(r.get("vendor_name")),
        }
        for i, r in enumerate(desired)
    ]

    if dry:
        print(
            json.dumps(
                {
                    "ok": True,
                    "mode": "dry",
                    "count": len(plan),
                    "note": "将软删后重建，使 id DESC ≈ 下列顺序",
                    "head": plan[:12],
                    "tail": plan[-8:],
                    "vendors": _vendor_summary(desired),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        conn.close()
        return

    # apply
    now = int(time.time())
    keep_fields = [
        c
        for c in [
            "model_name",
            "description",
            "icon",
            "tags",
            "vendor_id",
            "endpoints",
            "status",
            "sync_official",
            "name_rule",
        ]
        if c in mcols
    ]

    # 软删全部现行
    cur.execute(
        "UPDATE models SET deleted_at=?, updated_time=? WHERE deleted_at IS NULL",
        (now, now),
    )

    # 倒序插入：最后插入的 id 最大 → 广场最前
    inserted = []
    for r in reversed(desired):
        fields = list(keep_fields)
        values = [r[f] for f in keep_fields]
        if "created_time" in mcols:
            fields.append("created_time")
            values.append(r.get("created_time") or now)
        if "updated_time" in mcols:
            fields.append("updated_time")
            values.append(now)
        # deleted_at 不写 = NULL
        q = "INSERT INTO models(%s) VALUES (%s)" % (
            ",".join(fields),
            ",".join(["?"] * len(fields)),
        )
        cur.execute(q, values)
        new_id = cur.lastrowid
        inserted.append(
            {
                "new_id": new_id,
                "old_id": r["id"],
                "model": r["model_name"],
                "vendor": r.get("vendor_name"),
            }
        )

    conn.commit()
    conn.close()
    # inserted 是倒序构建的；展示顺序 = reversed(inserted)
    display = list(reversed(inserted))
    print(
        json.dumps(
            {
                "ok": True,
                "mode": "apply",
                "rebuilt": len(display),
                "head": display[:10],
                "tail": display[-5:],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def _vendor_summary(desired):
    out = []
    cur = None
    for r in desired:
        n = r.get("vendor_name") or "其他"
        if not out or out[-1]["name"] != n:
            out.append({"name": n, "rank": vendor_rank(n), "count": 0})
        out[-1]["count"] += 1
    return out


if __name__ == "__main__":
    main()
