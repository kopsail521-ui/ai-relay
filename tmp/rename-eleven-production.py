import json
import runpy
import urllib.request
from pathlib import Path

api = runpy.run_path('tmp/eleven-admin-client.py')['api']
renames = {'keyo-eleven-v4': 'eleven-v4', 'keyo-eleven-v4-turbo': 'eleven-v4-turbo'}
option_names = ('ModelRatio', 'CompletionRatio', 'AudioRatio', 'AudioCompletionRatio', 'ModelPrice')
channels = api('/api/channel/?p=1&page_size=100')['data']['items']
targets = [x for x in channels if x.get('name') == 'Keyo TTS']
assert len(targets) == 1, 'Expected one speech channel'
channel = targets[0]
assert channel['status'] == 1 and channel['type'] == 1
assert set(channel['models'].split(',')) == set(renames), 'Unexpected channel models'
original_mapping = json.loads(channel['model_mapping'])
assert set(original_mapping) == set(renames), 'Unexpected mapping'
models = api('/api/models/search?keyword=eleven')['data']['items']
metadata = [x for x in models if x.get('model_name') in renames]
assert len(metadata) == 2, 'Expected original metadata'
assert not any(x.get('model_name') in renames.values() for x in models), 'New IDs already present'
options = {x['key']: x['value'] for x in api('/api/option/')['data']}
originals = {key: json.loads(options.get(key, '{}')) for key in option_names}
assert json.loads(options.get('GroupRatio', '{}')).get('default', 1) == 1
for model_id, ratio in [('keyo-eleven-v4', 40), ('keyo-eleven-v4-turbo', 20)]:
    assert originals['ModelRatio'][model_id] == ratio
backup = {'options': originals, 'models': [{k: m.get(k) for k in ('id', 'model_name', 'description', 'icon', 'tags', 'vendor_id', 'endpoints', 'status', 'sync_official', 'name_rule')} for m in metadata], 'channel': {k: channel.get(k) for k in ('id', 'models', 'model_mapping')}}
Path('tmp/eleven-rename-before.json').write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding='utf-8')
# Price new IDs before enabling them; retain old prices until the route switch.
for key, original in originals.items():
    value = dict(original)
    for old, new in renames.items():
        assert new not in value, 'New model price already configured'
        if old in value:
            value[new] = value[old]
    api('/api/option/', 'PUT', {'key': key, 'value': json.dumps(value, ensure_ascii=False, separators=(',', ':'))})
for original in metadata:
    updated = dict(original)
    updated['model_name'] = renames[original['model_name']]
    updated['description'] = original.get('description', '').replace('Keyo Eleven', 'Eleven')
    api('/api/models/', 'PUT', updated)
    checked = api('/api/models/' + str(original['id']))['data']
    assert checked['model_name'] == updated['model_name']
    assert all(checked.get(k) == v for k, v in original.items() if k not in ('model_name', 'description', 'updated_time'))
api('/api/channel/', 'PUT', {'id': channel['id'], 'type': channel['type'], 'models': ','.join(renames[x] for x in channel['models'].split(',')), 'model_mapping': json.dumps({renames[k]: v for k, v in original_mapping.items()}, separators=(',', ':'))})
checked = api('/api/channel/' + str(channel['id']))['data']
assert set(checked['models'].split(',')) == set(renames.values())
assert json.loads(checked['model_mapping']) == {renames[k]: v for k, v in original_mapping.items()}
assert all(checked.get(k) == channel.get(k) for k in ('name', 'type', 'group', 'status', 'base_url', 'auto_ban', 'priority', 'weight'))
for key, original in originals.items():
    value = dict(original)
    for old, new in renames.items():
        if old in value:
            value[new] = value.pop(old)
    api('/api/option/', 'PUT', {'key': key, 'value': json.dumps(value, ensure_ascii=False, separators=(',', ':'))})
api('/api/models/?status_only=true', 'PUT', {'id': metadata[0]['id'], 'status': metadata[0]['status']})
current = {x['key']: x['value'] for x in api('/api/option/')['data']}
for key, original in originals.items():
    actual = json.loads(current[key])
    assert all(actual.get(k) == v for k, v in original.items() if k not in renames), 'Unrelated price changed'
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
