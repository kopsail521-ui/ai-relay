#!/usr/bin/env python3
"""Read selected TTS protocol/mapping metadata; no keys, logs or model requests."""
import json
from pathlib import Path
import re
import sqlite3

MODELS = ('keyo-tts', 'Step-Audio-TTS-3B', 'GLM-TTS', 'IndexTTS-2',
          'eleven-v4', 'eleven-v4-turbo', 'Qwen3-TTS', 'CosyVoice3',
          'Spark-TTS-0.5B', 'laya-multilingual', 'InfiniteTalk',
          'MOSS-Audio-8B-Thinking', 'gemini-3.8-flash-tts')
FIELDS = ('voice', 'input', 'text', 'speed', 'prompt_audio', 'prompt_audio_url')


def object_or_empty(raw):
    try:
        parsed = json.loads(raw or '{}')
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def collect(path=Path('/opt/ai-relay/data/new-api/one-api.db')):
    path = Path(path)
    if not path.is_file():
        raise RuntimeError('Existing database required')
    connection = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=0.5)
    connection.execute('PRAGMA query_only=ON')
    result = {name: [] for name in MODELS}
    try:
        columns = {row[1] for row in connection.execute('PRAGMA table_info(channels)')}
        optional = [name for name in ('model_mapping', 'param_override', 'setting') if name in columns]
        rows = connection.execute('SELECT id,type,status,models' + ''.join(',' + name for name in optional) + ' FROM channels')
        for row in rows:
            channel_id, kind, status, names = row[:4]
            extra = dict(zip(optional, row[4:]))
            membership = {name.strip() for name in str(names or '').split(',')}
            mapping = object_or_empty(extra.get('model_mapping'))
            overrides = object_or_empty(extra.get('param_override'))
            setting = object_or_empty(extra.get('setting'))
            for name in MODELS:
                if name not in membership:
                    continue
                target = mapping.get(name, name)
                safe_target = target if isinstance(target, str) and re.fullmatch(r'[A-Za-z0-9_./:-]{1,160}', target) else '[non-model mapping omitted]'
                result[name].append({'channel_id': channel_id, 'channel_type': kind, 'status': status,
                                     'mapped_model': safe_target,
                                     'explicit_override_fields': [field for field in FIELDS if field in overrides],
                                     'pass_through_body_enabled': setting.get('pass_through_body_enabled') is True})
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='abilities'")}
        abilities = {}
        if 'abilities' in tables:
            for model in MODELS:
                abilities[model] = connection.execute('SELECT COUNT(*) FROM abilities a JOIN channels c ON a.channel_id=c.id WHERE a.model=? AND a.enabled=1 AND c.status=1', (model,)).fetchone()[0]
    finally:
        connection.close()
    return {'result': 'TTS_PROTOCOL_READONLY_OK', 'read_only': True,
            'model_calls': 0, 'channels': result, 'enabled_ability_rows': abilities}


if __name__ == '__main__':
    try:
        print(json.dumps(collect(), sort_keys=True))
    except Exception as error:
        print(json.dumps({'result': 'TTS_PROTOCOL_READONLY_FAILED', 'error_class': type(error).__name__}))
        raise SystemExit(1)
