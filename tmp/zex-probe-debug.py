# -*- coding: utf-8 -*-
import importlib.util, json, secrets, time
from pathlib import Path

spec = importlib.util.spec_from_file_location('live', Path('tmp/zex-live-deploy.py').resolve())
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

now = int(time.time())
uname = 'zx' + secrets.token_hex(3)
budget = 300000
uid = tid = None
try:
    d = m.api('/api/user/', 'POST', {'username': uname, 'password': '!' + secrets.token_hex(8), 'display_name': uname})
    print('user POST data:', d)
    users = m.api('/api/user/?page=1&page_size=20&keyword=' + uname).get('data', [])
    uitems = users if isinstance(users, list) else users.get('items', [])
    urow = next(u for u in uitems if u['username'] == uname)
    uid = urow['id']
    print('user row:', json.dumps({k: urow.get(k) for k in ('id', 'group', 'quota', 'status')}, ensure_ascii=False))
    m.api('/api/user/', 'PUT', dict(urow, group=m.GROUP, quota=budget))
    m.api('/api/token/', 'POST', {
        'name': uname, 'user_id': uid, 'remain_quota': budget, 'expired_time': now + 900,
        'unlimited_quota': False, 'used_quota': 0, 'model_limits_enabled': True,
        'model_limits': ','.join(m.MODELS), 'group': '',
    })
    tokens = m.api('/api/token/?page=1&page_size=20&keyword=' + uname).get('data', [])
    titems = tokens if isinstance(tokens, list) else tokens.get('items', [])
    trow = next(t for t in titems if t.get('name') == uname)
    tid = trow['id']
    print('token row:', json.dumps({k: trow.get(k) for k in ('id', 'status', 'group', 'remain_quota', 'model_limits_enabled', 'model_limits', 'expired_time')}, ensure_ascii=False))
    print('key len:', len(trow.get('key') or ''))
    single = m.api('/api/token/%d' % tid).get('data', {})
    print('single key len:', len(single.get('key') or ''), '| fields:', sorted(single.keys()))
    key = single.get('key') or trow.get('key')
    import urllib.request, urllib.error
    for header_key in ('sk-' + key, key):
        req = urllib.request.Request('https://www.keyoapi.xyz/v1/videos', data=json.dumps({'model': 'gpt-image-2', 'prompt': 'red circle', 'aspect_ratio': '1:1'}).encode(), headers={'Authorization': 'Bearer ' + header_key, 'Content-Type': 'application/json'}, method='POST')
        try:
            with m._open_with_retry(req, 60) as r:
                print('prefix %r -> HTTP %d' % (header_key[:5], r.status), r.read(300).decode('utf-8', 'replace'))
                break
        except urllib.error.HTTPError as exc:
            print('prefix %r -> HTTP %d' % (header_key[:5], exc.code), exc.read(300).decode('utf-8', 'replace'))
finally:
    if tid is not None:
        m.api('/api/token/%d' % tid, 'DELETE')
    if uid is not None:
        m.api('/api/user/%d' % uid, 'DELETE')
    print('cleaned up')
