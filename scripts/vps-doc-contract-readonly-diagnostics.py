#!/usr/bin/env python3
"""Read-only Gemini TTS channel membership; no credentials or model requests."""
import json
from pathlib import Path
import sqlite3

DB_PATH = Path('/opt/ai-relay/data/new-api/one-api.db')
MODELS = ('gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview')


def collect(db_path=DB_PATH):
    db_path = Path(db_path)
    if not db_path.is_file():
        raise RuntimeError('Required existing SQLite database is unavailable')
    result = {model: [] for model in MODELS}
    connection = sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True, timeout=3)
    try:
        for channel_id, channel_type, status, raw_models in connection.execute('SELECT id, type, status, models FROM channels'):
            memberships = {model.strip() for model in str(raw_models or '').split(',')}
            for model in MODELS:
                if model in memberships:
                    result[model].append({'channel_id': int(channel_id), 'type': int(channel_type), 'status': int(status)})
    finally:
        connection.close()
    return {'result': 'DOC_CONTRACT_READONLY_OK', 'read_only': True, 'models': result}


if __name__ == '__main__':
    try:
        print(json.dumps(collect(), sort_keys=True))
    except Exception:
        raise SystemExit('Read-only contract diagnostics failed; no configuration values were printed') from None
