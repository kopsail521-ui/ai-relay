#!/usr/bin/env python3
"""Set only the three GPT image 2.5 marketplace tags in an existing SQLite DB."""
import json
import sqlite3
import sys
from pathlib import Path

names = ('gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst')
path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ai-relay/data/new-api/one-api.db').resolve(strict=True)
with sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=30) as db:
    db.execute('BEGIN IMMEDIATE')
    rows = db.execute(
        'SELECT model_name, tags FROM models WHERE deleted_at IS NULL AND model_name IN (?,?,?)', names
    ).fetchall()
    if len(rows) != 3 or {row[0] for row in rows} != set(names):
        raise RuntimeError('Expected exactly one active metadata row for each of the three models')
    db.execute(
        'UPDATE models SET tags=? WHERE deleted_at IS NULL AND model_name IN (?,?,?)', ('图片', *names)
    )
    result = db.execute(
        'SELECT model_name, tags FROM models WHERE deleted_at IS NULL AND model_name IN (?,?,?) ORDER BY model_name', names
    ).fetchall()
print(json.dumps([{'model': name, 'tags': tags} for name, tags in result], ensure_ascii=False))
