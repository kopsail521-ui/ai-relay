#!/usr/bin/env python3
"""Rename marketplace tag rag → 嵌入模型. Public i18n: 嵌入模型 / Embedding."""
from __future__ import annotations

import json
import os
import sqlite3
import sys

NEW = "嵌入模型"
OLD = {"rag", "RAG", "embedding", "Embedding"}


def retag(raw: str) -> str:
    parts = [p.strip() for p in (raw or "").replace("，", ",").split(",")]
    out = []
    for p in parts:
        if p in OLD or p.lower() == "rag":
            p = NEW
        if p and p not in out:
            out.append(p)
    return ",".join(out)


def patch_copy(path):
    if not os.path.isfile(path):
        print("copy skip", path)
        return
    data = json.loads(open(path, encoding="utf-8").read())
    bag = {
        "zhCN": NEW,
        "zhTW": NEW,
        "en": "Embedding",
        "fr": "Embedding",
        "ru": "Эмбеддинг",
        "ja": "埋め込みモデル",
        "vi": "Embedding",
    }
    tags = data.setdefault("__tags__", {})
    for k in (NEW, "rag", "RAG", "Embedding"):
        tags[k] = bag
    open(path, "w", encoding="utf-8").write(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    )
    print("copy", path)


def apply_db(db):
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    n = 0
    for (mid, tags) in cur.execute("SELECT model_name, tags FROM models"):
        nxt = retag(tags or "")
        if nxt != (tags or ""):
            cur.execute("UPDATE models SET tags=? WHERE model_name=?", (nxt, mid))
            print("model", mid, tags, "->", nxt)
            n += 1
    conn.commit()
    conn.close()
    print("updated", n)


def main():
    if len(sys.argv) > 1:
        apply_db(sys.argv[1])
    root = os.environ.get("KEYO_ROOT") or "/opt/ai-relay"
    patch_copy(os.path.join(root, "config/marketplace-model-copy.json"))
    patch_copy(
        os.path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json")
    )
    print("DONE_RENAME_RAG_TAG")


if __name__ == "__main__":
    main()
