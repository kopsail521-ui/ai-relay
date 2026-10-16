#!/usr/bin/env python3
"""agnes-video-2.5 生产激活（new-api 侧）：
   ModelPrice=$0.020548/秒（默认档 720p 展示价），真实计费在直通服务（预扣+按上游实际成本×1.5 结算）。
"""
import json
import runpy
import time

api = runpy.run_path('tmp/eleven-admin-client.py')['api']

MODEL = 'agnes-video-2.5'
DISPLAY_PRICE = 0.020548
VENDOR = 'Agnes AI'
ICON = 'Custom'
TAG = '视频按秒'
DESC = 'Agnes Video 2.5：文生视频/图生视频，720p/1080p/2k，最长 12 秒，按秒计费（720p $0.020548/秒、1080p $0.034932/秒、2k $0.047260/秒）。'
ENDPOINTS = json.dumps({'openai-video': '/v1/videos/generations'}, separators=(',', ':'))
CHANNEL_ID = 4  # Keyo Video Gen（占位渠道，真实流量走 Caddy→3011 直通）


def main():
    # 1. 定价：ModelPrice 展示价；从 ratio 表移除
    d = api('/api/option/')
    opts = {x['key']: x['value'] for x in d.get('data', [])}
    mr = json.loads(opts.get('ModelRatio', '{}'))
    cr = json.loads(opts.get('CompletionRatio', '{}'))
    mp = json.loads(opts.get('ModelPrice', '{}'))
    mr.pop(MODEL, None)
    cr.pop(MODEL, None)
    mp[MODEL] = DISPLAY_PRICE
    for key, val in (('ModelRatio', mr), ('CompletionRatio', cr), ('ModelPrice', mp)):
        api('/api/option/', 'PUT', {'key': key, 'value': json.dumps(val, ensure_ascii=False, separators=(',', ':'))})
    print('pricing written:', MODEL, '=', DISPLAY_PRICE, '/request (display)')

    # 2. 渠道挂载（占位渠道，仅目录展示）
    ch = api('/api/channel/4')['data']
    assert ch['name'] == 'Keyo Video Gen', ch['name']
    models = [x.strip() for x in ch['models'].split(',') if x.strip()]
    if MODEL not in models:
        models.append(MODEL)
        api('/api/channel/', 'PUT', {
            'id': ch['id'],
            'type': ch['type'],
            'models': ','.join(models),
            'model_mapping': ch.get('model_mapping') or '{}',
        })
        print('channel updated: added', MODEL)
    else:
        print('channel already has', MODEL)

    # 3. 供应商
    d = api('/api/vendors/')
    items = d.get('data', {}).get('items', []) if isinstance(d.get('data'), dict) else d.get('data', [])
    vid = None
    for v in items:
        if v.get('name') == VENDOR:
            vid = v['id']
            break
    if vid is None:
        r = api('/api/vendors/', 'POST', {'name': VENDOR, 'icon': ICON, 'status': 1})
        d2 = api('/api/vendors/')
        items2 = d2.get('data', {}).get('items', []) if isinstance(d2.get('data'), dict) else d2.get('data', [])
        for v in items2:
            if v.get('name') == VENDOR:
                vid = v['id']
        print('vendor created:', VENDOR, vid)
    else:
        print('vendor exists:', VENDOR, vid)

    # 4. 模型元数据
    d = api('/api/models/')
    items = d.get('data', {}).get('items', []) if isinstance(d.get('data'), dict) else d.get('data', [])
    existing = next((m for m in items if m.get('model_name') == MODEL), None)
    body = {
        'model_name': MODEL,
        'description': DESC,
        'icon': ICON,
        'tags': TAG,
        'vendor_id': vid,
        'endpoints': ENDPOINTS,
        'status': 1,
        'sync_official': 0,
    }
    if existing:
        body['id'] = existing['id']
        api(f"/api/models/{existing['id']}", 'PUT', body)
        print('marketplace updated', MODEL)
    else:
        api('/api/models/', 'POST', body)
        print('marketplace created', MODEL)

    time.sleep(2)

    # 5. 验证
    d = api('/api/pricing')
    arr = d.get('data', [])
    m = next((x for x in arr if x.get('model_name') == MODEL), None)
    assert m, MODEL + ' missing in pricing'
    print(MODEL, json.dumps({
        'model_price': m.get('model_price'),
        'quota_type': m.get('quota_type'),
        'tags': m.get('tags'),
        'groups': m.get('enable_groups'),
        'endpoints': m.get('supported_endpoint_types'),
    }))
    blob = json.dumps(m, ensure_ascii=False).lower()
    for banned in ('grsai', 'apimart', 'openlux', 'aicopy'):
        assert banned not in blob, 'upstream trace: ' + banned
    print('AGNES_ACTIVATION_OK')


if __name__ == '__main__':
    main()
