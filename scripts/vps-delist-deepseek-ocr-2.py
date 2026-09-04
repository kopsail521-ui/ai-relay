#!/usr/bin/env python3
"""Delist DeepSeek-OCR-2 from New API (abilities + channel model lists + option ratios)."""
import json
import sqlite3
import sys

MODEL = "DeepSeek-OCR-2"
DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

conn = sqlite3.connect(DB)
cur = conn.cursor()

# abilities
try:
    cur.execute("DELETE FROM abilities WHERE model = ?", (MODEL,))
    print(f"abilities_deleted={cur.rowcount}")
except Exception as e:
    print(f"abilities_skip={e}")

# channels.models (comma-separated)
cur.execute("SELECT id, models FROM channels")
for cid, models in cur.fetchall():
    if not models or MODEL not in models:
        continue
    parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
    new_parts = [p for p in parts if p != MODEL]
    if len(new_parts) != len(parts):
        cur.execute("UPDATE channels SET models = ? WHERE id = ?", (",".join(new_parts), cid))
        print(f"channel_{cid}_models_updated")

# options: ModelRatio / ModelPrice / CompletionRatio JSON maps
for key in ("ModelRatio", "ModelPrice", "CompletionRatio", "GroupRatio"):
    row = cur.execute("SELECT value FROM options WHERE key = ?", (key,)).fetchone()
    if not row or not row[0]:
        continue
    try:
        data = json.loads(row[0])
    except Exception:
        continue
    if isinstance(data, dict) and MODEL in data:
        del data[MODEL]
        cur.execute("UPDATE options SET value = ? WHERE key = ?", (json.dumps(data, ensure_ascii=False), key))
        print(f"option_{key}_removed")

conn.commit()
conn.close()
print("DONE_DELIST_DEEPSEEK_OCR_2")
