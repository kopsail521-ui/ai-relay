import json
import re
import subprocess
import urllib.request
from pathlib import Path

BASE = 'https://www.keyoapi.xyz'
values = {}
for line in Path('.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        values[k.strip()] = v.strip().strip('\"').strip("'")
TOKEN = values.get('NEW_API_ADMIN_TOKEN', '')
if not TOKEN:
    raise SystemExit('Local admin token missing')

def api(path, method='GET', body=None):
    headers = {'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'}
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8'), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            d = json.load(response)
    except Exception as e:
        raise RuntimeError('Admin request failed: ' + path + ' ' + type(e).__name__) from None
    if d.get('success') is not True:
        msg = str(d.get('message', 'request unsuccessful'))
        msg = re.sub(r'sk-[A-Za-z0-9_-]+', '[redacted]', msg)
        raise RuntimeError(path + ': ' + msg[:300])
    return d

if __name__ == '__main__':
    d = api('/api/user/self')
    print(json.dumps({'admin_access': True, 'id': d.get('data', {}).get('id'), 'role': d.get('data', {}).get('role')}))
    d = api('/api/option/')
    opts = {x['key']: x['value'] for x in d.get('data', [])}
    print(json.dumps({'options_access': True, 'pricing_keys': [k for k in ('ModelRatio', 'CompletionRatio', 'AudioRatio', 'AudioCompletionRatio', 'ModelPrice') if k in opts], 'group_ratio': json.loads(opts.get('GroupRatio', '{}')).get('default')}))
