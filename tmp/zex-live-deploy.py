# -*- coding: utf-8 -*-
"""Live zex gpt-image onboarding via the admin API (no VPS shell needed).

Registers the GPT-Image-HD group, channel, per-call prices and model metadata,
then proves billing with two real tasks through the public /v1/videos route.
"""
import json
import math
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'https://www.keyoapi.xyz'
ZEX_KEY = values.get('ZEX_API_KEY', '')
if not ZEX_KEY:
    raise SystemExit('ZEX_API_KEY missing in .env')
GROUP = 'GPT-Image-HD'
RATIO = 13.140553
CHANNEL = 'Keyo Zex GPT Image'
UPSTREAM = 'https://zexapi.com'
QUOTA_PER_USD = 500000
MODELS = {
    'gpt-image-2': None,
    'gpt-image-2-2K': 0.011416,
    'gpt-image-2-4K': 0.011416,
    'gpt-image-2.5': None,
    'gpt-image-2.5-flare': None,
    'gpt-image-2.5-flare-vip': 0.0205471,
    'gpt-image-2.5-sunburst': None,
    'gpt-image-2.5-sunburst-vip': 0.0285377,
}

values = {}
for line in Path('.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        values[k.strip()] = v.strip().strip('"').strip("'")
TOKEN = values.get('NEW_API_ADMIN_TOKEN', '')
if not TOKEN:
    raise SystemExit('Local admin token missing')



def _open_with_retry(req, timeout):
    last = None
    for attempt in range(5):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError:
            raise
        except Exception as exc:
            last = exc
            time.sleep(2 + attempt * 3)
    raise last

def api(path, method='GET', body=None, timeout=60):
    headers = {'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'}
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8'), headers=headers, method=method)
    try:
        with _open_with_retry(req, timeout) as response:
            d = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = ''
        try:
            detail = exc.read(300).decode('utf-8', 'replace')
        except Exception:
            pass
        raise RuntimeError('%s %s -> HTTP %s %s' % (method, path, exc.code, re.sub(r'sk-[A-Za-z0-9_-]+', '[redacted]', detail))) from None
    if d.get('success') is not True:
        msg = re.sub(r'sk-[A-Za-z0-9_-]+', '[redacted]', str(d.get('message', 'unsuccessful')))
        raise RuntimeError(path + ': ' + msg[:300])
    return d


def public(path, method='GET', body=None, token='', timeout=90):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        with _open_with_retry(req, timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError('%s %s -> HTTP %s' % (method, path, exc.code)) from None


def put_option(key, mutate):
    rows = api('/api/option/').get('data', [])
    current = next((r['value'] for r in rows if r['key'] == key), None)
    data = json.loads(current) if current else {}
    assert isinstance(data, dict), key
    mutate(data)
    api('/api/option/', 'PUT', {'key': key, 'value': json.dumps(data, ensure_ascii=False, separators=(',', ':'))})
    return data


def step_options():
    mp = put_option('ModelPrice', lambda d: d.update({k: v for k, v in MODELS.items() if v is not None}))
    for legacy in ('gpt-image-2-1K', 'gpt-image-2.5-1K', 'gpt-image-2.5-flare-hd', 'gpt-image-2.5-sunburst-hd'):
        mp.pop(legacy, None)
    def set_usable(d):
        d.setdefault(GROUP, 'GPT Image HD ' + GROUP)
    def set_ratio(d):
        if float(d.get('default', 1)) != 1:
            raise RuntimeError('default GroupRatio must stay 1')
        d[GROUP] = RATIO
    put_option('UserUsableGroups', set_usable)
    rows = api('/api/option/').get('data', [])
    ratio_key = 'group_ratio_setting.group_ratio' if any(r['key'] == 'group_ratio_setting.group_ratio' for r in rows) else 'GroupRatio'
    put_option(ratio_key, set_ratio)
    print('OPTIONS_OK ratio_key=%s' % ratio_key)


def step_channel():
    channels = api('/api/channel/?page=1&page_size=100').get('data', [])
    items = channels if isinstance(channels, list) else channels.get('items', [])
    mine = [c for c in items if c.get('name') == CHANNEL]
    models_csv = ','.join(MODELS)
    spec = {
        'name': CHANNEL, 'type': 1, 'base_url': UPSTREAM, 'models': models_csv,
        'group': GROUP, 'status': 1, 'key': ZEX_KEY, 'model_mapping': '{}',
        'priority': 0, 'weight': 1,
    }
    def norm_models(v):
        if isinstance(v, list):
            return ','.join(sorted(v))
        return ','.join(sorted((v or '').split(',')))
    if mine:
        existing = mine[0]
        if (existing.get('base_url') != UPSTREAM or norm_models(existing.get('models')) != norm_models(models_csv)
                or (existing.get('group') or '') != GROUP):
            row = {'id': existing['id'], 'name': CHANNEL, 'type': 1, 'base_url': UPSTREAM,
                   'models': models_csv, 'group': GROUP, 'key': ZEX_KEY,
                   'model_mapping': '{}', 'priority': 0, 'weight': 1}
            api('/api/channel/', 'PUT', row)
        if existing.get('status') != 1:
            api('/api/channel/%d/status' % existing['id'], 'POST', {'status': 1})
        cid = existing['id']
    else:
        api('/api/channel/', 'POST', {'mode': 'single', 'channel': spec})
        items2 = api('/api/channel/?page=1&page_size=100').get('data', [])
        cid = next(c['id'] for c in (items2 if isinstance(items2, list) else items2.get('items', [])) if c.get('name') == CHANNEL)
    print('CHANNEL_OK id=%s' % cid)
    return cid


def step_models():
    models = api('/api/models/?page=1&page_size=200').get('data', [])
    items = models if isinstance(models, list) else models.get('items', [])
    by_name = {m.get('model_name'): m for m in items}
    vendors = api('/api/vendors/?page=1&page_size=100').get('data', [])
    vitems = vendors if isinstance(vendors, list) else vendors.get('items', [])
    vrow = next((v for v in vitems if v.get('name') == 'OpenAI'), None)
    vid = vrow['id'] if vrow else api('/api/vendors/', 'POST', {'name': 'OpenAI', 'icon': 'OpenAI', 'status': 1}).get('data')
    for name, base in MODELS.items():
        endpoints = {'openai-video': '/v1/videos'}
        existing = by_name.get(name)
        if existing:
            try:
                merged = json.loads(existing.get('endpoints') or '{}')
            except ValueError:
                merged = {}
            if isinstance(merged, dict):
                merged.update(endpoints)
                endpoints = merged
            row = dict(existing, endpoints=json.dumps(endpoints, separators=(',', ':')), deleted_at=None, status=1)
            api('/api/models/', 'PUT', row)
        else:
            effective = (base or 0) * RATIO
            spec = {
                'model_name': name,
                'description': 'GPT Image 异步图像生成（%s，分组 %s）。经 POST /v1/videos 提交，GET /v1/videos/{task_id} 轮询取图。本分组计费：$%.6g/次。' % (name, GROUP, effective),
                'icon': 'OpenAI', 'vendor_id': vid, 'tags': '图像生成',
                'endpoints': json.dumps({'openai-video': '/v1/videos'}, separators=(',', ':')),
                'status': 1, 'sync_official': 0,
            }
            api('/api/models/', 'POST', spec)
    print('MODELS_OK %d' % len(MODELS))


def disable_channel(cid):
    channels = api('/api/channel/?page=1&page_size=100').get('data', [])
    items = channels if isinstance(channels, list) else channels.get('items', [])
    row = next(c for c in items if c.get('name') == CHANNEL)
    api('/api/channel/%d/status' % row['id'], 'POST', {'status': 2})
    print('CHANNEL_DISABLED_AFTER_FAILED_PROBE')


def probe():
    """Real billed proof: an admin-owned token pinned to the GPT-Image-HD group."""
    now = int(time.time())
    tname = 'zexp' + secrets.token_hex(3)
    budget = 300000
    tid = None
    try:
        api('/api/token/', 'POST', {
            'name': tname, 'remain_quota': budget, 'expired_time': now + 900,
            'unlimited_quota': False, 'used_quota': 0, 'model_limits_enabled': True,
            'model_limits': ','.join(MODELS), 'group': GROUP,
        })
        tokens = api('/api/token/?page=1&page_size=20&keyword=' + tname).get('data', [])
        titems = tokens if isinstance(tokens, list) else tokens.get('items', [])
        trow = next(t for t in titems if t.get('name') == tname)
        tid = trow['id']
        key = api('/api/token/%d/key' % tid, 'POST').get('data', {}).get('key')
        if not key:
            raise RuntimeError('full token key unavailable')
        auth = key if key.startswith('sk-') else 'sk-' + key
        mp = json.loads(next(r['value'] for r in api('/api/option/').get('data', []) if r['key'] == 'ModelPrice'))
        jobs = [
            ('gpt-image-2', {'model': 'gpt-image-2', 'prompt': 'A simple red circle on a white background', 'aspect_ratio': '1:1'}, mp['gpt-image-2']),
            ('gpt-image-2.5-flare', {'model': 'gpt-image-2.5-flare', 'prompt': 'A blue square on a white background', 'aspect_ratio': '1:1', 'image_size': '4K'}, mp['gpt-image-2.5-flare']),
        ]
        cumulative = 0
        for model, payload, base_price in jobs:
            expected = math.floor(base_price * RATIO * QUOTA_PER_USD + 0.5)
            cumulative += expected
            submit = public('/v1/videos', 'POST', payload, auth)
            task_id = submit.get('id') or submit.get('task_id')
            if not task_id or submit.get('status') not in ('queued', 'in_progress', 'completed'):
                raise RuntimeError('submit %s -> %s' % (model, json.dumps(submit)[:200]))
            deadline = time.time() + 240
            url = None
            while time.time() < deadline:
                task = public('/v1/videos/' + task_id, 'GET', token=auth, timeout=30)
                status = task.get('status')
                if status == 'completed':
                    url = task.get('url') or (task.get('metadata') or {}).get('image_url')
                    break
                if status == 'failed':
                    raise RuntimeError('task failed: ' + json.dumps(task.get('error') or task)[:200])
                time.sleep(4)
            if not url:
                raise RuntimeError('task for %s not completed in time' % model)
            settled = False
            for _ in range(40):
                fresh = api('/api/token/%d' % tid).get('data', {})
                logs = api('/api/log/?page=1&page_size=20&token_name=' + tname + '&model_name=' + model + '&type=2').get('data', [])
                litems = logs if isinstance(logs, list) else (logs.get('items') or [])
                matches = [l for l in litems if l.get('model_name') == model and abs((l.get('quota') or 0) - expected) <= 2]
                if abs((fresh.get('used_quota') or 0) - cumulative) <= 2 and matches:
                    settled = True
                    break
                time.sleep(2)
            if not settled:
                raise RuntimeError('settlement for %s: expected quota %d cumulative %d, token used=%s' % (model, expected, cumulative, fresh.get('used_quota')))  # noqa
            print('PROBE_OK %s quota=%d($%g) url=yes' % (model, expected, base_price * RATIO))
    finally:
        if tid is not None:
            api('/api/token/%d' % tid, 'DELETE')

def check_public():
    d = public('/api/pricing')
    rows = {r.get('model_name'): r for r in d.get('data', []) if r.get('model_name') in MODELS}
    assert set(rows) == set(MODELS), 'missing: ' + ','.join(set(MODELS) - set(rows))
    for name, base in MODELS.items():
        row = rows[name]
        assert GROUP in row.get('enable_groups', []), name + ' missing group'
        assert 'openai-video' in row.get('supported_endpoint_types', []), name + ' missing endpoint'
        if base is not None:
            assert row.get('quota_type') == 1 and abs(float(row.get('model_price', -1)) - base) < 1e-9, name + ' price mismatch'
    ratio = (d.get('group_ratio') or {}).get(GROUP)
    assert ratio and abs(float(ratio) - RATIO) < 1e-6, 'group ratio %s' % ratio
    print('PUBLIC_OK group=%s ratio=%s' % (GROUP, ratio))


def main():
    check_env_patch_pending = '--register' in sys.argv or '--probe' in sys.argv or len(sys.argv) == 1
    if '--check' in sys.argv:
        check_public()
        return
    if '--disable' in sys.argv:
        channels = api('/api/channel/?page=1&page_size=100').get('data', [])
        items = channels if isinstance(channels, list) else channels.get('items', [])
        disable_channel(next(c['id'] for c in items if c.get('name') == CHANNEL))
        return
    step_options()
    step_models()
    cid = step_channel()
    try:
        probe()
    except Exception as exc:
        disable_channel(cid)
        print('PROBE_FAILED channel disabled: %s' % exc, file=sys.stderr)
        raise SystemExit(1)
    check_public()
    print('ZEX_LIVE_DEPLOY_OK')


if __name__ == '__main__':
    main()
