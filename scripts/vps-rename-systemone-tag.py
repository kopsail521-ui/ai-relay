#!/usr/bin/env python3
"""Rename marketplace tag 系统一模型 → 决策模型. Public i18n: 决策模型 / Decision Model.

Usage: python3 vps-rename-systemone-tag.py [/path/to/one-api.db]
With DB arg: retags models table. Always patches both marketplace copy files
(KEYO_ROOT or /opt/ai-relay).
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys

NEW = "决策模型"
OLD = {"系统一模型"}
# The 5 models carrying this tag (Bespoke-Nimble-9B / jev-1.13.0 + the 3 new ones)
EXPECT = {
    "Bespoke-Nimble-9B",
    "jev-1.13.0",
    "SemIf-OpenJev-4B",
    "DiffusionGemma-26B-A4B-it-Jev",
    "laya-multilingual",
}

I18N = {
    "zhCN": "决策模型",
    "zhTW": "決策模型",
    "en": "Decision Model",
    "fr": "Modèle de décision",
    "ru": "Модель принятия решений",
    "ja": "意思決定モデル",
    "vi": "Mô hình quyết định",
}


def retag(raw: str) -> str:
    parts = [p.strip() for p in (raw or "").replace("，", ",").split(",")]
    out = []
    for p in parts:
        if p in OLD:
            p = NEW
        if p and p not in out:
            out.append(p)
    return ",".join(out)


def patch_copy(path):
    if not os.path.isfile(path):
        print("copy skip", path)
        return
    data = json.loads(open(path, encoding="utf-8").read())
    tags = data.setdefault("__tags__", {})
    tags.pop("系统一模型", None)
    tags[NEW] = dict(I18N)
    open(path, "w", encoding="utf-8").write(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    )
    print("copy", path)


def apply_db(db):
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    n = 0
    # fetchall first: updating rows via the same cursor mid-iteration skips rows
    rows = cur.execute("SELECT model_name, tags FROM models").fetchall()
    for (mid, tags) in rows:
        nxt = retag(tags or "")
        if nxt != (tags or ""):
            cur.execute("UPDATE models SET tags=? WHERE model_name=?", (nxt, mid))
            print("model", mid, ":", tags, "->", nxt)
            n += 1
    left = cur.execute(
        "SELECT COUNT(*) FROM models WHERE tags LIKE '%系统一模型%'"
    ).fetchone()[0]
    tagged = cur.execute(
        "SELECT COUNT(*) FROM models WHERE tags = ?", (NEW,)
    ).fetchone()[0]
    conn.commit()
    conn.close()
    print("updated", n, "| old_tag_left", left, "| models_tagged", tagged)
    if left:
        raise SystemExit("ERROR: old tag still present")


def main():
    if len(sys.argv) > 1:
        apply_db(sys.argv[1])
    root = os.environ.get("KEYO_ROOT") or "/opt/ai-relay"
    patch_copy(os.path.join(root, "config/marketplace-model-copy.json"))
    patch_copy(
        os.path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json")
    )
    print("DONE_RENAME_SYSTEMONE_TAG")


if __name__ == "__main__":
    main()
