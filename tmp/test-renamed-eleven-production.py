from pathlib import Path
source = Path('tmp/test-eleven-production.py').read_text(encoding='utf-8')
assert 'keyo-eleven-v4' in source
source = source.replace('keyo-eleven-v4', 'eleven-v4')
exec(compile(source, 'tmp/test-renamed-eleven-production.py', 'exec'))
