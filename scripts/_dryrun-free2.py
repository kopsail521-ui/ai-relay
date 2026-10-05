import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, name TEXT, models TEXT, base_url TEXT, updated_time INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
""")
now = 1759700000
cur.execute("INSERT INTO channels(id,name,models,base_url,updated_time) VALUES (1,'Keyo Media','Fun-ASR-Nano-2512,CosyVoice3,Qwen3-VL-Embedding-8B,whisper-large-v3','https://ai.gitee.com',?)", (now,))
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'阿里巴巴','Qwen.Color',1,?,?)", (now, now))
for name, tags in [("Fun-ASR-Nano-2512","语音识别"),("CosyVoice3","语音合成"),("Qwen3-VL-Embedding-8B","嵌入模型"),("whisper-large-v3","语音识别")]:
    cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES (?, 'x','Custom',?,1,'{}',1,0,?,?,0)", (name, tags, now, now))
cur.execute("INSERT INTO abilities(\"group\",model,channel_id,enabled,priority,weight) VALUES ('default','Fun-ASR-Nano-2512',1,1,0,1),('vip','Fun-ASR-Nano-2512',1,1,0,1),('default','CosyVoice3',1,1,0,1),('default','Qwen3-VL-Embedding-8B',1,1,0,1)")
cur.execute("INSERT INTO options(key,value) VALUES ('ModelRatio','{\"Fun-ASR-Nano-2512\":0.010274,\"Qwen3-VL-Embedding-8B\":0.003425}'),('ModelPrice','{\"Atria-dawn-v2\":0,\"Qwen3-VL-Embedding-8B\":0}'),('CompletionRatio','{\"Fun-ASR-Nano-2512\":1,\"Qwen3-VL-Embedding-8B\":1}')")
c.commit(); c.close()

r = subprocess.run([sys.executable, "scripts/vps-gitee-free2-add-embedding8b-delist.py", db], capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr); sys.exit(1)

# idempotent second run
r2 = subprocess.run([sys.executable, "scripts/vps-gitee-free2-add-embedding8b-delist.py", db], capture_output=True, text=True)
print("--- second run ---"); print(r2.stdout)
if r2.returncode != 0:
    print("STDERR2:", r2.stderr); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
print("channel models:", cur.execute("SELECT models FROM channels WHERE id=1").fetchone()[0])
print("ModelPrice:", json.loads(cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0]))
print("ModelRatio:", json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0]))
for row in cur.execute("SELECT model_name, tags, icon, status, deleted_at FROM models ORDER BY id"):
    print("model row:", row)
for row in cur.execute("SELECT model, \"group\" FROM abilities ORDER BY model, \"group\""):
    print("ability:", row)
c.close()
print("DRYRUN_FREE2_OK")
