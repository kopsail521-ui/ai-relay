import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, tags TEXT);
""")
rows = [
    (1, "SenseVoiceSmall", "语音识别,免费"),
    (2, "Spark-TTS-0.5B", "语音合成,免费"),
    (3, "Atria-dawn-v2", "大语言模型,免费"),
    (4, "deepseek-v4-pro-free", "大语言模型,免费"),
    (5, "gemma-4-26B-A4B-it", "大语言模型"),
    (6, "AtriaX", "免费"),
]
cur.executemany("INSERT INTO models(id,model_name,tags) VALUES (?,?,?)", rows)
c.commit(); c.close()

r = subprocess.run([sys.executable, "scripts/vps-strip-free-tag.py", db], capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
for row in cur.execute("SELECT model_name, tags FROM models ORDER BY id"):
    print("row:", row)
c.close()
print("DRYRUN_STRIP_OK")
