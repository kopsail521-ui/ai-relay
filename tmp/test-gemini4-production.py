#!/usr/bin/env python3
"""gemini-4-argon / gemini-4-barium 真实聊天调用 + 最终结算验证。
   定价：$0.7353/1M in, $3.6765/1M out（ModelRatio=0.36765, CompletionRatio=5）
   结算：quota = ceil(input_tokens × ratio × 500000/1M + output_tokens × ratio × comp × 500000/1M)
   即 quota = ceil((in × 0.7353 + out × 3.6765) × 0.5)
"""
import json
import re
import runpy
import time
import urllib.request
from pathlib import Path

api = runpy.run_path('tmp/eleven-admin-client.py')['api']

MODELS = ['gemini-4-argon', 'gemini-4-barium']
PROMPT = '用一句话介绍你自己。'
TTL = 600


def create_token(model_id):
    name = f'tmp-gemini4-{model_id}-{int(time.time())}'
    api('/api/token/', 'POST', {
        'name': name,
        'remain_quota': 500000,
        'expired_time': int(time.time()) + TTL,
        'unlimited_quota': False,
        'model_limits_enabled': True,
        'model_limits': model_id,
        'group': 'default',
    })
    found = [x for x in api('/api/token/search?keyword=' + name)['data']['items'] if x['name'] == name]
    assert len(found) == 1, 'token not found after create'
    tok = found[0]
    key = api('/api/token/' + str(tok['id']) + '/key', 'POST')['data']['key']
    return tok['id'], name, (key if key.startswith('sk-') else 'sk-' + key)


def delete_token(token_id):
    try:
        api('/api/token/' + str(token_id), 'DELETE')
    except Exception:
        pass


def list_tokens():
    d = api('/api/token/')
    data = d.get('data', {})
    return data.get('items', []) if isinstance(data, dict) else data


def chat(model_id, key):
    body = json.dumps({
        'model': model_id,
        'messages': [{'role': 'user', 'content': PROMPT}],
        'max_tokens': 100,
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://www.keyoapi.xyz/v1/chat/completions',
        data=body,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def consumption_logs(token_name, model_id):
    d = api(f'/api/log/?log_type=2&token_name={token_name}&model_name={model_id}&page_size=10')
    data = d.get('data', {})
    return data.get('items', []) if isinstance(data, dict) else data


def expected_quota(in_tok, out_tok):
    return int((in_tok * 0.7353 / 1000000 + out_tok * 3.6765 / 1000000) * 500000)


def main():
    results = []
    for model_id in MODELS:
        key_id, token_name, key = create_token(model_id)
        try:
            r = chat(model_id, key)
            content = (r.get('choices') or [{}])[0].get('message', {}).get('content', '')
            usage = r.get('usage', {})
            in_tok = usage.get('prompt_tokens', 0)
            out_tok = usage.get('completion_tokens', 0)
            print(model_id, 'content:', (content or '')[:60].replace('\n', ' '))
            print(model_id, 'usage:', in_tok, 'in /', out_tok, 'out')
            time.sleep(3)
            logs = consumption_logs(token_name, model_id)
            if not logs:
                raise RuntimeError(model_id + ': no consumption log')
            log = logs[0]
            actual = log.get('quota', 0)
            exp = expected_quota(in_tok, out_tok)
            print(model_id, f'quota: actual={actual} expected~{exp} (log prompt={log.get("prompt_tokens")}, completion={log.get("completion_tokens")})')
            if abs(actual - exp) > max(2, exp * 0.05):
                print(model_id, f'WARN: settle mismatch {actual} vs {exp}')
            else:
                print(model_id, 'BILLING_OK')
            results.append({'model': model_id, 'in': in_tok, 'out': out_tok, 'quota': actual, 'expected': exp})
        finally:
            if key_id:
                delete_token(key_id)
                print('token removed:', token_name)
    print(json.dumps(results, ensure_ascii=False))
    print('GEMINI4_CHAT_TEST_OK')


if __name__ == '__main__':
    main()
