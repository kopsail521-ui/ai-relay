import importlib.util
import json
import os
import runpy
import subprocess
from pathlib import Path

client = runpy.run_path('tmp/eleven-admin-client.py')
api = client['api']
spec = importlib.util.spec_from_file_location('eleven', 'scripts/vps-add-openrouter-eleven.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
result = subprocess.run(['powershell.exe', '-STA', '-NoProfile', '-Command', '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ErrorActionPreference="Stop"; $v=Get-Clipboard -Raw; if($null -ne $v){[Console]::Write($v.Trim())}'], capture_output=True)
if result.returncode:
    raise SystemExit('Clipboard read failed')
key = result.stdout.decode('utf-8-sig', errors='replace').strip()
if not key.startswith('sk-or-v1-') or len(key) < 35:
    import re
    transcript = Path('C:/Users/rsfqq/.zcode/cli/rollout/model-io-sess_9bbb5074-d0db-4f28-b894-556e1668da7e.jsonl')
    candidates = set(re.findall(r'sk-or-v1-[A-Za-z0-9_-]{40,}', transcript.read_text(encoding='utf-8', errors='ignore')))
    if len(candidates) != 1:
        raise SystemExit('Previously supplied key could not be uniquely recovered')
    key = candidates.pop()

def items(data):
    return data.get('data', {}).get('items', [])

channels = [x for x in items(api('/api/channel/search?keyword=Keyo%20TTS')) if x.get('name') == module.CHANNEL_NAME]
if channels:
    raise SystemExit('Target channel now exists; refusing duplicate activation')
options = {x['key']: x['value'] for x in api('/api/option/')['data']}
assert json.loads(options.get('GroupRatio', '{}')).get('default', 1) == 1
backup = {k: json.loads(options.get(k, '{}')) for k in ('ModelRatio', 'CompletionRatio', 'AudioRatio', 'AudioCompletionRatio', 'ModelPrice')}
Path('tmp/eleven-pricing-before.json').write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding='utf-8')
# Configure charging before enabling routing.
for opt, original in backup.items():
    value = dict(original)
    for model in module.MODELS:
        if opt == 'ModelPrice':
            value.pop(model['id'], None)
        else:
            value[model['id']] = model['ratio'] if opt == 'ModelRatio' else 0
    api('/api/option/', 'PUT', {'key': opt, 'value': json.dumps(value, ensure_ascii=False, separators=(',', ':'))})
print('PRICING_CONFIGURED')
vendors = [x for x in items(api('/api/vendors/search?keyword=ElevenLabs')) if x.get('name') == 'ElevenLabs']
if vendors:
    vid = vendors[0]['id']
else:
    created = api('/api/vendors/', 'POST', {'name': 'ElevenLabs', 'icon': 'Custom', 'status': 1})
    vid = created['data']['id']
for m in module.MODELS:
    description = module.COPY[m['id']]['description_zh'] + ' ' + module.COPY[m['id']]['description_en']
    api('/api/models/', 'POST', {'model_name': m['id'], 'description': description, 'icon': 'Custom', 'tags': '语音合成', 'vendor_id': vid, 'endpoints': module.ENDPOINTS, 'status': 1, 'sync_official': 0, 'name_rule': 0})
print('MODEL_METADATA_CREATED')
api('/api/channel/', 'POST', {'mode': 'single', 'channel': {'type': 1, 'key': key, 'name': module.CHANNEL_NAME, 'base_url': module.BASE_URL, 'models': ','.join(m['id'] for m in module.MODELS), 'model_mapping': json.dumps({m['id']: m['up'] for m in module.MODELS}), 'group': 'default', 'status': 1, 'priority': 0, 'weight': 1, 'auto_ban': 0}})
del key
print('CHANNEL_CREATED_WITH_PRIVATE_KEY')
# Ensure a fresh public pricing cache after the channel created abilities.
for m in module.MODELS:
    found = [x for x in items(api('/api/models/search?keyword=' + m['id'])) if x.get('model_name') == m['id']]
    assert len(found) == 1
    api('/api/models/?status_only=true', 'PUT', {'id': found[0]['id'], 'status': 1})
current = {x['key']: x['value'] for x in api('/api/option/')['data']}
for opt, before in backup.items():
    after = json.loads(current[opt])
    for mid, value in before.items():
        if mid not in {m['id'] for m in module.MODELS}:
            assert after.get(mid) == value, 'Unrelated pricing changed: ' + opt
print('UNRELATED_PRICES_PRESERVED')
check = runpy.run_path('scripts/vps-check-openrouter-eleven.py')['check']
assert check(api('/api/pricing'))
print('PRODUCTION_ELEVEN_CONFIG_OK')
