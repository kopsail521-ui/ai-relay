import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, tags TEXT);
""")
rows = [
    ("Bespoke-Nimble-9B", "系统一模型"),
    ("jev-1.13.0", "系统一模型"),
    ("SemIf-OpenJev-4B", "系统一模型"),
    ("DiffusionGemma-26B-A4B-it-Jev", "系统一模型"),
    ("laya-multilingual", "系统一模型"),
    ("gemma-4-26B-A4B-it", "大语言模型"),
    ("Atria-dawn-v2", "大语言模型,免费"),
]
cur.executemany("INSERT INTO models(model_name,tags) VALUES (?,?)", rows)
c.commit(); c.close()

r = subprocess.run([sys.executable, "scripts/vps-rename-systemone-tag.py", db], capture_output=True, text=True, env={**os.environ, "KEYO_ROOT": "."})
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr)
    sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
for row in cur.execute("SELECT model_name, tags FROM models ORDER BY id"):
    print("row:", row)
c.close()
print("DRYRUN_RENAME_OK")
