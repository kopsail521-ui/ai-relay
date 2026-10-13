import concurrent.futures
import json
import runpy
import time
import urllib.error
import urllib.request

api = runpy.run_path('tmp/eleven-admin-client.py')['api']
with urllib.request.urlopen('https://www.keyoapi.xyz/api/pricing', timeout=25) as response:
    pricing = json.load(response)
models = [m['model_name'] for m in pricing['data'] if m.get('model_name') == 'keyo-flash:free' and 'default' in m.get('enable_groups', [])]
name = 'free-verify-' + str(int(time.time()))
api('/api/token/', 'POST', {'name': name, 'expired_time': int(time.time()) + 600, 'remain_quota': 20000, 'unlimited_quota': False, 'model_limits_enabled': True, 'model_limits': ','.join(models), 'group': 'default'})
found = [x for x in api('/api/token/search?keyword=' + name)['data']['items'] if x['name'] == name]
assert len(found) == 1
token_id = found[0]['id']
try:
    key = api('/api/token/' + str(token_id) + '/key', 'POST')['data']['key']
    key = key if key.startswith('sk-') else 'sk-' + key
    def test(model):
        req = urllib.request.Request('https://www.keyoapi.xyz/v1/chat/completions', data=json.dumps({'model': model, 'messages': [{'role': 'user', 'content': 'Reply with OK.'}], 'max_tokens': 512, 'stream': False}).encode(), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                body = json.load(response)
                choices = body.get('choices', [])
                ok = bool(choices and choices[0].get('message', {}).get('content'))
                return {'model': model, 'http_status': response.status, 'call_ok': ok}
        except urllib.error.HTTPError as error:
            error.read()
            return {'model': model, 'http_status': error.code, 'call_ok': False}
        except Exception as error:
            return {'model': model, 'error_type': type(error).__name__, 'call_ok': False}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(test, models))
    for result in results:
        if result['call_ok']:
            for attempt in range(10):
                items = api('/api/log/?model_name=' + urllib.parse.quote(result['model']) + '&token_name=' + name + '&p=1&page_size=10')['data']['items']
                logs = [x for x in items if x.get('type') == 2 and x.get('model_name') == result['model'] and x.get('token_name') == name]
                if logs:
                    result['quota_charged'] = logs[0]['quota']
                    result['free_billing_ok'] = logs[0]['quota'] == 0
                    break
                time.sleep(1)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    print('FREE_MODELS_OK' if all(x.get('call_ok') and x.get('free_billing_ok') for x in results) else 'FREE_MODELS_HAVE_FAILURES', flush=True)
finally:
    api('/api/token/' + str(token_id), 'DELETE')
    print('TEMP_FREE_TEST_TOKEN_REMOVED', flush=True)
