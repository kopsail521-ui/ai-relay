import json
import runpy
import time
import urllib.error
import urllib.request
from pathlib import Path

api = runpy.run_path('tmp/eleven-admin-client.py')['api']
name = 'eleven-verify-' + str(int(time.time()))
api('/api/token/', 'POST', {'name': name, 'expired_time': int(time.time()) + 600, 'remain_quota': 20000, 'unlimited_quota': False, 'model_limits_enabled': True, 'model_limits': 'keyo-eleven-v4,keyo-eleven-v4-turbo', 'group': 'default'})
found = [x for x in api('/api/token/search?keyword=' + name)['data']['items'] if x['name'] == name]
assert len(found) == 1
id = found[0]['id']
try:
    key = api('/api/token/' + str(id) + '/key', 'POST')['data']['key']
    key = key if key.startswith('sk-') else 'sk-' + key
    for model, ratio in [('keyo-eleven-v4', 40), ('keyo-eleven-v4-turbo', 20)]:
        before = api('/api/token/' + str(id))['data']['used_quota']
        text = 'Hello Keyo.'
        req = urllib.request.Request('https://www.keyoapi.xyz/v1/audio/speech', data=json.dumps({'model': model, 'voice': 'george', 'input': text, 'response_format': 'mp3'}).encode(), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=80) as response:
                audio = response.read()
                content_type = response.headers.get('Content-Type', '')
        except urllib.error.HTTPError as e:
            body = e.read()
            parsed = json.loads(body)
            err = parsed.get('error', {})
            print(json.dumps({'model': model, 'http_status': e.code, 'error_code': err.get('code'), 'message': str(err.get('message', ''))[:300]}, ensure_ascii=False))
            raise RuntimeError('Speech request failed') from None
        assert len(audio) > 1000, 'Audio missing'
        assert not audio.lstrip().startswith(b'{'), 'JSON instead of audio'
        Path('tmp/' + model + '-verified.mp3').write_bytes(audio)
        expected = len(text) * ratio
        settled = []
        for attempt in range(10):
            logs = api('/api/log/?model_name=' + model + '&token_name=' + name + '&p=1&page_size=10')['data']['items']
            settled = [x for x in logs if x.get('type') == 2 and x.get('model_name') == model and x.get('token_name') == name]
            if settled:
                break
            time.sleep(1)
        assert settled, 'Settlement log not available'
        actual = settled[0]['quota']
        print(json.dumps({'model': model, 'audio_bytes': len(audio), 'content_type': content_type, 'input_characters': len(text), 'quota_charged': actual, 'quota_expected': expected, 'billing_ok': actual == expected}, ensure_ascii=False))
        assert actual == expected, 'Character billing mismatch'
    print('PRODUCTION_SPEECH_AND_BILLING_OK')
finally:
    api('/api/token/' + str(id), 'DELETE')
    print('TEMP_TEST_TOKEN_REMOVED')
