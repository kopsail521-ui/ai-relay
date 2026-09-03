#!/usr/bin/env python3
"""Update models.description in New API SQLite (no RMB; clearer copy)."""
import json
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
COPY_PATH = sys.argv[2] if len(sys.argv) > 2 else "/opt/ai-relay/config/marketplace-model-copy.json"

with open(COPY_PATH, "r", encoding="utf-8") as f:
    COPY = json.load(f)

con = sqlite3.connect(DB)
cur = con.cursor()
now = int(time.time())
updated = 0
for name, meta in COPY.items():
    if name.startswith("__"):
        continue
    desc = ""
    if isinstance(meta, dict):
        descs = meta.get("descriptions") or {}
        desc = (
            descs.get("zhCN")
            or meta.get("description_zh")
            or meta.get("description")
            or ""
        )
    if not desc:
        continue
    cur.execute(
        "UPDATE models SET description = ?, updated_time = ? WHERE model_name = ? AND deleted_at IS NULL",
        (desc, now, name),
    )
    updated += cur.rowcount

# Strip leftover RMB phrases on any model
cur.execute(
    "SELECT id, model_name, description FROM models WHERE deleted_at IS NULL AND description IS NOT NULL"
)
import re

pat = re.compile(
    r"(售\s*¥[\d.]+/[^\s（。]*)|（成本×5）|成本×5|¥[\d.]+"
)
scrubbed = 0
for mid, name, desc in cur.fetchall():
    if name in COPY:
        continue
    if not desc or ("¥" not in desc and "成本×" not in desc):
        continue
    new = pat.sub("", desc)
    new = re.sub(r"\s{2,}", " ", new).strip(" ·。")
    if new != desc:
        cur.execute(
            "UPDATE models SET description = ?, updated_time = ? WHERE id = ?",
            (new + ("。" if new and not new.endswith(".") else ""), now, mid),
        )
        scrubbed += 1

con.commit()
con.close()
print(json.dumps({"updated": updated, "scrubbed": scrubbed}, ensure_ascii=False))
