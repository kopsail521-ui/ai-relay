#!/usr/bin/env python3
"""Halve ModelRatio for selected LLM families in New API options."""
import json
import sqlite3
import sys

TARGETS = {
    "claude-fable-5",
    "claude-fable-5-1",
    "claude-opus-5",
    "claude-sonnet-5",
    "deepseek-v4-flash",
    "deepseek-v4-pro-0813",
    "kimi-k3",
    "MiniMax-M3",
    "glm-5.3",
    "gemma-4-26B-A4B-it",
}

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()
row = cur.execute("SELECT value FROM options WHERE key = ?", ("ModelRatio",)).fetchone()
if not row or not row[0]:
    print("ERR: ModelRatio missing")
    sys.exit(1)

data = json.loads(row[0])
changed = 0
for name in sorted(TARGETS):
    if name not in data:
        print(f"skip_missing={name}")
        continue
    old = float(data[name])
    new = round(old / 2, 6)
    data[name] = new
    print(f"{name}: {old} -> {new}")
    changed += 1

cur.execute(
    "UPDATE options SET value = ? WHERE key = ?",
    (json.dumps(data, ensure_ascii=False, separators=(",", ":")), "ModelRatio"),
)
conn.commit()
conn.close()
print(f"changed={changed}")
print("DONE_HALVE_LLM_PRICES")
