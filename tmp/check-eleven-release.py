import contextlib
import copy
import io
import json
import re
import runpy
import subprocess
from pathlib import Path
from xml.etree import ElementTree

root = Path.cwd()
check = runpy.run_path('scripts/vps-check-openrouter-eleven.py')['check']
fixture = {'success': True, 'group_ratio': {'default': 1}, 'vendors': [{'id': 1, 'name': 'ElevenLabs'}], 'data': []}
for mid, ratio in [('keyo-eleven-v4', 40), ('keyo-eleven-v4-turbo', 20)]:
    fixture['data'].append({'model_name': mid, 'vendor_id': 1, 'tags': '语音合成', 'model_ratio': ratio, 'quota_type': 0, 'model_price': 0, 'completion_ratio': 0, 'audio_ratio': 0, 'audio_completion_ratio': 0, 'enable_groups': ['default'], 'supported_endpoint_types': ['openai-audio']})
with contextlib.redirect_stdout(io.StringIO()):
    assert check(fixture)
    for field, value in [('model_ratio', 20), ('quota_type', 1), ('model_price', 5), ('completion_ratio', 1), ('audio_ratio', 1), ('audio_completion_ratio', 1), ('enable_groups', []), ('supported_endpoint_types', ['openai']), ('vendor_id', 2)]:
        broken = copy.deepcopy(fixture)
        broken['data'][0][field] = value
        assert not check(broken), field
    for field in ('model_ratio', 'quota_type', 'model_price', 'completion_ratio', 'audio_ratio', 'audio_completion_ratio'):
        broken = copy.deepcopy(fixture)
        del broken['data'][0][field]
        assert not check(broken), field
    broken = copy.deepcopy(fixture)
    broken['data'][0]['description'] = 'OpenRouter'
    assert not check(broken)
    broken = copy.deepcopy(fixture)
    broken['group_ratio']['default'] = 2
    assert not check(broken)
print('PUBLIC_CHECK_POSITIVE_AND_NEGATIVE_OK')

paths = ['config/marketplace-model-copy.json', 'services/creem-moderation-proxy/marketplace-model-copy.json']
assert Path(paths[0]).read_bytes() == Path(paths[1]).read_bytes()
copy_data = json.loads(Path(paths[0]).read_text(encoding='utf-8'))
assert len(copy_data) >= 123
assert all(mid in copy_data for mid in ('keyo-eleven-v4', 'keyo-eleven-v4-turbo'))
for mid in ('keyo-eleven-v4', 'keyo-eleven-v4-turbo'):
    text = Path(f'static/seo/model/{mid}.html').read_text(encoding='utf-8')
    assert 'response_format' in text and 'speech.mp3' in text and 'speech.wav' not in text
    assert not re.search(r'openrouter|二道|转售|上游|resell', text, re.I)
    for ld in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, re.S):
        json.loads(ld)
    for sitemap in ('sitemap.xml', 'sitemap-live.xml'):
        xml = ElementTree.parse(f'static/seo/{sitemap}')
        links = [x.text for x in xml.iter() if x.tag.endswith('loc')]
        assert links.count(f'https://www.keyoapi.xyz/model/{mid}') == 1
print('COPY_IDENTITY_AND_SEO_OK')

source = Path('scripts/vps-add-openrouter-eleven.sh').read_text(encoding='utf-8')
patch = source.split("python -c '\n", 1)[1].split("\n'", 1)[0]
# Exercise the actual deployed regex patch against clean and already-patched versions.
original = subprocess.check_output(['git', 'show', 'HEAD:services/creem-moderation-proxy/server.mjs']).decode('utf-8')
current = Path('services/creem-moderation-proxy/server.mjs').read_text(encoding='utf-8')
class FakePath:
    content = ''
    def __init__(self, _): pass
    def read_text(self, **_): return self.content
    def write_text(self, value, **_): type(self).content = value
patch = patch.replace('from pathlib import Path', 'Path = FakePath')
for source in (original, current):
    FakePath.content = source
    exec(patch, {'FakePath': FakePath})
    first = FakePath.content
    exec(patch, {'FakePath': FakePath})
    assert first == FakePath.content
    assert len(re.findall('OpenRouter\\|openrouter', first)) == 2
print('DEPLOY_PROXY_PATCH_IDEMPOTENT_OK')
print('ELEVEN_RELEASE_CHECK_OK')
