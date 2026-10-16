# -*- coding: utf-8 -*-
import importlib.util, json
from pathlib import Path

spec = importlib.util.spec_from_file_location('live', Path('tmp/zex-live-deploy.py').resolve())
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

rows = m.api('/api/channel/?p=1&page_size=100')
items = rows if isinstance(rows, list) else rows.get('items', [])
mine = [c for c in items if c.get('name') == m.CHANNEL]
print('existing channels named %s: %d' % (m.CHANNEL, len(mine)))
for c in mine:
    print(json.dumps({k: c.get(k) for k in ('id','type','base_url','models','group','status','model_mapping','priority','weight','key')}, ensure_ascii=False))
    print('all fields:', sorted(c.keys()))
