from pathlib import Path
source = Path('tmp/test-eleven-production.py').read_text(encoding='utf-8')
source = source.replace('keyo-eleven-v4', 'eleven-v4').replace("[('eleven-v4', 40), ('eleven-v4-turbo', 20)]", "[('eleven-v4-turbo', 20)]").replace('+ 600', '+ 3600')
exec(compile(source, 'tmp/test-renamed-eleven-turbo.py', 'exec'))
