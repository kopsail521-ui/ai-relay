#!/usr/bin/env bash
# Refresh only Eleven copy/SEO after the public API IDs have been migrated.
set -euo pipefail
ROOT=/opt/ai-relay
RAW=https://raw.githubusercontent.com/kopsail521-ui/ai-relay/main
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
docker inspect ai-relay-creem-moderation >/dev/null
for file in vps-add-openrouter-eleven.py vps-check-openrouter-eleven.py; do
  curl --retry 3 --connect-timeout 20 --max-time 60 -fsSL "$RAW/scripts/$file" -o "$WORK/$file"
done
for model in eleven-v4 eleven-v4-turbo; do
  curl --retry 3 --connect-timeout 20 --max-time 60 -fsSL "$RAW/static/seo/model/$model.html" -o "$WORK/$model.html"
done
docker run --rm -i -v "$ROOT:$ROOT:rw" -v "$WORK:/work:ro" python:3.12-alpine python - <<'PY'
import json
import os
import runpy
import shutil
import time
from pathlib import Path

root = Path('/opt/ai-relay')
work = Path('/work')
# Loading definitions does not call main(), read_key(), or touch the database.
copy = runpy.run_path(str(work / 'vps-add-openrouter-eleven.py'))['COPY']
assert set(copy) == {'eleven-v4', 'eleven-v4-turbo'}
assert copy['eleven-v4']['display_names'] == 'Eleven V4'
assert copy['eleven-v4-turbo']['display_names'] == 'Eleven V4 Turbo'
paths = [root / 'config/marketplace-model-copy.json',
         root / 'services/creem-moderation-proxy/marketplace-model-copy.json']
for path in paths:
    if not path.is_file():
        raise SystemExit('Marketplace copy missing: ' + str(path))
data = json.loads(paths[0].read_text(encoding='utf-8'))
for old in ('keyo-eleven-v4', 'keyo-eleven-v4-turbo'):
    data.pop(old, None)
data.update(copy)
payload = (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
new_pages = {model: (work / (model + '.html')).read_bytes()
             for model in ('eleven-v4', 'eleven-v4-turbo')}
for model, page in new_pages.items():
    assert ('/model/' + model).encode() in page
    assert b'keyo-eleven-v4' not in page and b'Keyo Eleven' not in page
stamp = '.eleven-' + str(time.time_ns()) + '.bak'
for path in paths:
    shutil.copy2(path, str(path) + stamp)
for path in paths:
    temp = Path(str(path) + '.eleven.tmp')
    temp.write_bytes(payload)
    shutil.copymode(path, temp)
    os.replace(temp, path)
assert paths[0].read_bytes() == paths[1].read_bytes()
# Patch existing local pages/links without replacing unrelated site or blog content.
for rel in ('index.html', 'models.html', 'pricing.html', 'tts-api.html',
            'sitemap.xml', 'sitemap-live.xml',
            'model/keyo-eleven-v4.html', 'model/keyo-eleven-v4-turbo.html'):
    path = root / 'static/seo' / rel
    if not path.is_file():
        continue
    old = path.read_bytes()
    new = old.replace(b'keyo-eleven-v4-turbo', b'eleven-v4-turbo').replace(
        b'keyo-eleven-v4', b'eleven-v4').replace(b'Keyo Eleven', b'Eleven')
    if new != old:
        shutil.copy2(path, str(path) + stamp)
        path.write_bytes(new)
(root / 'static/seo/model').mkdir(parents=True, exist_ok=True)
for model, page in new_pages.items():
    path = root / 'static/seo/model' / (model + '.html')
    if path.is_file():
        shutil.copy2(path, str(path) + stamp)
    path.write_bytes(page)
print('COPY_ELEVEN_IDENTICAL; SEO_ELEVEN_UPDATED')
PY
docker cp "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json" ai-relay-creem-moderation:/app/marketplace-model-copy.json
docker restart ai-relay-creem-moderation >/dev/null
for attempt in $(seq 1 10); do
  if curl --connect-timeout 10 --max-time 20 -fsS https://www.keyoapi.xyz/api/pricing -o "$WORK/pricing.json"; then
    if docker run --rm -v "$WORK:/work:ro" python:3.12-alpine python /work/vps-check-openrouter-eleven.py /work/pricing.json; then
      printf 'DONE_ELEVEN_DISPLAY_NAMES\n'
      exit 0
    fi
  fi
  sleep 2
done
printf 'Copy and SEO updated, but public pricing verification failed.\n' >&2
exit 1
