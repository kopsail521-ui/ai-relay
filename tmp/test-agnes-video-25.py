#!/usr/bin/env python3
"""agnes-video-2.5 真实视频生成 + 预扣/结算验证。
   720p 5s → 预扣 5 × $0.020548 = $0.10274 → 51370 quota（×500000/USD）
   出片后按上游实际 ×1.5 多退少补；失败退款。
"""
import json
import runpy
import time
import urllib.request
import urllib.error
from pathlib import Path

api = runpy.run_path('tmp/eleven-admin-client.py')['api']
MODEL = 'agnes-video-2.5'
BASE = 'https://www.keyoapi.xyz'
QUOTA_PER_USD = 500000
SELL_PER_SEC_720P = 0.020548


def create_token():
    name = 'tmp-agnes-' + str(int(time.time()))
    api('/api/token/', 'POST', {
        'name': name,
        'remain_quota': 200000,
        'expired_time': int(time.time()) + 600,
        'unlimited_quota': False,
        'model_limits_enabled': True,
        'model_limits': MODEL,
        'group': 'default',
    })
    found = [x for x in api('/api/token/search?keyword=' + name)['data']['items'] if x['name'] == name]
    assert len(found) == 1
    tok = found[0]
    key = api('/api/token/' + str(tok['id']) + '/key', 'POST')['data']['key']
    return tok['id'], name, (key if key.startswith('sk-') else 'sk-' + key)


def submit_video(key):
    body = json.dumps({
        'model': MODEL,
        'prompt': 'A serene drone shot over a misty mountain lake at dawn, cinematic, slow pan',
        'duration': 5,
        'resolution': '720p',
        'aspectRatio': 'landscape',
    }).encode('utf-8')
    req = urllib.request.Request(
        BASE + '/v1/videos/generations',
        data=body,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code


def poll_task(key, task_id):
    for i in range(60):
        time.sleep(5)
        req = urllib.request.Request(
            BASE + '/v1/videos/' + task_id,
            headers={'Authorization': 'Bearer ' + key},
            method='GET',
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                d = json.load(resp)
        except urllib.error.HTTPError as e:
            d = json.loads(e.read())
        status = d.get('status') or d.get('data', {}).get('status', '')
        print(f'  poll {i+1}: status={status}')
        if status in ('completed', 'succeeded', 'success', 'done', 'failed', 'cancelled', 'error'):
            return d, status
    return d, 'timeout'


def main():
    key_id, token_name, key = create_token()
    print(f'token: {token_name}')
    try:
        # 提交
        resp, code = submit_video(key)
        print(f'submit: HTTP {code}', json.dumps(resp, ensure_ascii=False)[:300])
        task_id = resp.get('id') or resp.get('task_id') or resp.get('data', {}).get('id') or resp.get('data', {}).get('task_id')
        if not task_id:
            print('ERROR: no task_id in response')
            return
        print(f'task_id: {task_id}')

        # 预扣检查
        time.sleep(2)
        tok = api('/api/token/' + str(key_id))['data']
        used = tok.get('used_quota', 0)
        expected_pre = int(5 * SELL_PER_SEC_720P * QUOTA_PER_USD)
        print(f'precharge: used_quota={used} expected~{expected_pre}')

        # 轮询
        result, final_status = poll_task(key, task_id)
        print(f'final: {final_status}', json.dumps(result, ensure_ascii=False)[:400])

        # 结算检查
        time.sleep(3)
        logs = api(f'/api/log/?log_type=2&token_name={token_name}&model_name={MODEL}&page_size=10')
        items = logs.get('data', {}).get('items', []) if isinstance(logs.get('data'), dict) else logs.get('data', [])
        print(f'settlement logs: {len(items)}')
        for log in items:
            print(f'  quota={log.get("quota")} content={log.get("content","")[:80]}')

        tok = api('/api/token/' + str(key_id))['data']
        final_used = tok.get('used_quota', 0)
        print(f'final used_quota: {final_used}')
        if final_status in ('completed', 'succeeded', 'success', 'done'):
            print('VIDEO_TEST_OK')
        else:
            print(f'VIDEO_TEST_STATUS: {final_status}')
    finally:
        api('/api/token/' + str(key_id), 'DELETE')
        print('token removed')


if __name__ == '__main__':
    main()
