#!/usr/bin/env python3
"""Admin-API production activation for gemini-4-argon and gemini-4-barium.
   售价 = 上游成本 × 5（上游 eff=$0.14706/1M in, $0.7353/1M out → 卖 $0.7353/$3.6765）
"""
import json
import re
import urllib.request
import time
import runpy
from pathlib import Path

api = runpy.run_path('tmp/eleven-admin-client.py')['api']

MODELS = [
    {
        'id': 'gemini-4-argon',
        'desc': 'Gemini 4 Argon · 强编码·推理·多模态企业模型',
    },
    {
        'id': 'gemini-4-barium',
        'desc': 'Gemini 4 Barium · 百万上下文·法务金融漏洞推理原型',
    },
]

MODEL_RATIO = 0.36765
COMPLETION_RATIO = 5.0
ICON = 'Gemini.Color'
TAG = '大语言模型'
VENDOR = 'Google'
ENDPOINT = json.dumps({'openai': '/v1/chat/completions'})


def main():
    # 1. 验证 admin 权限
    d = api('/api/user/self')
    print(json.dumps({'admin_access': True, 'role': d.get('data', {}).get('role')}))

    # 2. 获取当前定价
    d = api('/api/option/')
    opts = {x['key']: x['value'] for x in d.get('data', [])}
    mr = json.loads(opts.get('ModelRatio', '{}'))
    cr = json.loads(opts.get('CompletionRatio', '{}'))
    mp = json.loads(opts.get('ModelPrice', '{}'))
    print('group_ratio default:', json.loads(opts.get('GroupRatio', '{}')).get('default'))

    # 3. 写入定价
    for m in MODELS:
        mid = m['id']
        mr[mid] = MODEL_RATIO
        cr[mid] = COMPLETION_RATIO
        mp.pop(mid, None)

    for key, val in [('ModelRatio', mr), ('CompletionRatio', cr), ('ModelPrice', mp)]:
        api('/api/option/', 'PUT', {
            'key': key,
            'value': json.dumps(val, ensure_ascii=False, separators=(',', ':')),
        })
    print('pricing written OK')

    # 4. 找 Keyo Primary openlux 渠道
    d = api('/api/channel/')
    target = None
    for ch in d.get('data', {}).get('items', []):
        blob = ((ch.get('name', '') or '') + ' ' + (ch.get('base_url') or '')).lower()
        if 'openlux' in blob and ch.get('type') == 1:
            target = ch
            break
    if target is None:
        raise SystemExit('Keyo Primary openlux channel not found')
    print(f'channel: id={target["id"]} name={target["name"]}')

    # 5. 更新渠道模型列表（最小 body：id, type, models, model_mapping）
    current = [x.strip() for x in (target.get('models') or '').split(',') if x.strip()]
    added = []
    for m in MODELS:
        if m['id'] not in current:
            current.append(m['id'])
            added.append(m['id'])
    if added:
        model_mapping = json.loads(target.get('model_mapping', '{}') or '{}')
        api('/api/channel/', 'PUT', {
            'id': target['id'],
            'type': target['type'],
            'models': ','.join(current),
            'model_mapping': json.dumps(model_mapping, separators=(',', ':')),
        })
        print('channel updated, added:', added)
    else:
        print('channel already has all models')

    # 6. 找 vendor Google
    d = api('/api/vendors/')
    vendor_id = None
    for v in d.get('data', {}).get('items', []) if isinstance(d.get('data'), dict) else d.get('data', []):
        if v.get('name') == VENDOR:
            vendor_id = v['id']
            break
    if vendor_id is None:
        raise SystemExit('vendor Google not found')
    print('vendor Google id:', vendor_id)

    # 7. 创建 marketplace 元数据
    for m in MODELS:
        mid = m['id']
        d = api('/api/models/')
        existing = None
        items = d.get('data', {}).get('items', []) if isinstance(d.get('data'), dict) else d.get('data', [])
        for mo in items:
            if mo.get('model_name') == mid:
                existing = mo
                break
        body = {
            'model_name': mid,
            'description': m['desc'],
            'icon': ICON,
            'tags': TAG,
            'vendor_id': vendor_id,
            'endpoints': ENDPOINT,
            'status': 1,
            'sync_official': 0,
        }
        if existing:
            body['id'] = existing['id']
            api(f'/api/models/{existing["id"]}', 'PUT', body)
            print('marketplace updated', mid)
        else:
            api('/api/models/', 'POST', body)
            print('marketplace created', mid)

    # 8. 刷新缓存
    try:
        api('/api/models/', 'GET')
    except Exception:
        pass
    time.sleep(2)

    # 9. 验证定价
    d = api('/api/pricing')
    arr = d.get('data', [])
    for m in MODELS:
        mid = m['id']
        pm = next((x for x in arr if x.get('model_name') == mid), None)
        if not pm:
            print(mid, 'MISSING in /api/pricing')
        else:
            mr_val = pm.get('model_ratio') or 0
            cr_val = pm.get('completion_ratio') or 1
            print(mid, json.dumps({
                'model_ratio': mr_val,
                'completion_ratio': cr_val,
                'sell_in': round(mr_val * 2, 6),
                'sell_out': round(mr_val * 2 * cr_val, 6),
                'quota_type': pm.get('quota_type'),
                'vendor': pm.get('vendor_id'),
                'tags': pm.get('tags'),
            }))
    print('GEMINI4_ACTIVATION_OK')


if __name__ == '__main__':
    main()
