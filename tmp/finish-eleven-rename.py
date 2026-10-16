import json
import runpy
import urllib.request
from pathlib import Path

api = runpy.run_path('tmp/eleven-admin-client.py')['api']
backup = json.loads(Path('tmp/eleven-rename-before.json').read_text(encoding='utf-8'))
renames = {'keyo-eleven-v4': 'eleven-v4', 'keyo-eleven-v4-turbo': 'eleven-v4-turbo'}
for original in backup['models']:
    current = api('/api/models/' + str(original['id']))['data']
    assert current['model_name'] in (original['model_name'], renames[original['model_name']])
    assert all(current.get(k) == v for k, v in original.items() if k not in ('model_name', 'description'))
    current['model_name'] = renames[original['model_name']]
    current['description'] = original['description'].replace('Keyo Eleven', 'Eleven')
    api('/api/models/', 'PUT', current)
    checked = api('/api/models/' + str(original['id']))['data']
    assert all(checked.get(k) == v for k, v in original.items() if k not in ('model_name', 'description'))
    assert checked['model_name'] == renames[original['model_name']]
channel = api('/api/channel/' + str(backup['channel']['id']))['data']
assert channel['status'] == 1 and channel['type'] == 1
assert channel['models'] == backup['channel']['models']
original_mapping = json.loads(backup['channel']['model_mapping'])
api('/api/channel/', 'PUT', {'id': channel['id'], 'type': channel['type'], 'models': ','.join(renames[x] for x in channel['models'].split(',')), 'model_mapping': json.dumps({renames[k]: v for k, v in original_mapping.items()}, separators=(',', ':'))})
checked = api('/api/channel/' + str(channel['id']))['data']
assert set(checked['models'].split(',')) == set(renames.values())
assert json.loads(checked['model_mapping']) == {renames[k]: v for k, v in original_mapping.items()}
assert all(checked.get(k) == channel.get(k) for k in ('name', 'type', 'group', 'status', 'base_url', 'auto_ban', 'priority', 'weight'))
for key, original in backup['options'].items():
    value = dict(original)
    for old, new in renames.items():
        if old in value:
            value[new] = value.pop(old)
    api('/api/option/', 'PUT', {'key': key, 'value': json.dumps(value, ensure_ascii=False, separators=(',', ':'))})
api('/api/models/?status_only=true', 'PUT', {'id': backup['models'][0]['id'], 'status': backup['models'][0]['status']})
current_options = {x['key']: x['value'] for x in api('/api/option/')['data']}
for key, original in backup['options'].items():
    actual = json.loads(current_options[key])
    assert all(actual.get(k) == v for k, v in original.items() if k not in renames)
    assert not any(old in actual for old in renames)
with urllib.request.urlopen('https://www.keyoapi.xyz/api/pricing', timeout=25) as response:
    pricing = json.load(response)
public = {m['model_name']: m for m in pricing['data']}
assert not any(old in public for old in renames)
for new, ratio in [('eleven-v4', 40), ('eleven-v4-turbo', 20)]:
    m = public[new]
    assert m['model_ratio'] == ratio and m.get('icon') == 'ElevenLabs'
    assert m.get('quota_type') == 0 and 'default' in m.get('enable_groups', [])
    assert 'openai-audio' in m.get('supported_endpoint_types', [])
    assert all(m.get(key) == 0 for key in ('completion_ratio', 'audio_ratio', 'audio_completion_ratio'))
    print(json.dumps({'model': new, 'icon': m['icon'], 'ratio': ratio, 'enabled': True}))
print('PRODUCTION_MODEL_RENAME_OK_UNRELATED_PRICES_PRESERVED')
