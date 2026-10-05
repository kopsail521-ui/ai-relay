import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, type INTEGER, key TEXT, name TEXT, base_url TEXT, models TEXT, "group" TEXT, model_mapping TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
""")
now = 1759700000
cur.execute("INSERT INTO channels(id,type,key,name,base_url,models,\"group\",model_mapping,status,updated_time) VALUES (10,1,'sk-x','Keyo Video','https://api.aicopy.top','grok-imagine-video-1.5','default','{\"grok-imagine-video-1.5\":\"grok-1.5-官转接口\"}',1,?)", (now,))
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'xAI','XAI',1,?,?),(2,'其他','Custom',1,?,?)", (now, now, now, now))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('grok-imagine-video-1.5','旧描述 $0.3082','XAI','视频按次',1,'{}',1,0,?,?,0)", (now, now))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('UVDoc','x','Custom','图像处理',2,'{}',1,0,?,?,0)", (now, now))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('gemini-embedding-2-preview','x','Gemini.Color','大语言模型',NULL,'{}',1,0,?,?,0)", (now, now))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('wan3.0-video','x','Qwen.Color','视频按秒',2,'{}',1,0,?,?,0)", (now, now))
cur.execute("INSERT INTO abilities(\"group\",model,channel_id,enabled,priority,weight) VALUES ('default','grok-imagine-video-1.5',10,1,0,1)")
cur.execute("INSERT INTO options(key,value) VALUES ('ModelPrice','{\"grok-imagine-video-1.5\":0.30822}'),('ModelRatio','{\"grok-imagine-video-1.5\":0.1}'),('CompletionRatio','{\"grok-imagine-video-1.5\":1}')")
c.commit(); c.close()

r = subprocess.run([sys.executable, "scripts/vps-grok-video-rename-fix.py", db], capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr); sys.exit(1)

# second run for idempotency
r2 = subprocess.run([sys.executable, "scripts/vps-grok-video-rename-fix.py", db], capture_output=True, text=True)
print("--- second run (tail) ---"); print("\n".join(r2.stdout.splitlines()[-4:]))
if r2.returncode != 0:
    print("STDERR2:", r2.stderr); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
print("channel models:", cur.execute("SELECT models, model_mapping FROM channels WHERE id=10").fetchone())
print("ModelPrice:", cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
for row in cur.execute("SELECT model_name, tags, vendor_id, endpoints FROM models ORDER BY id"):
    print("row:", row)
for row in cur.execute("SELECT model FROM abilities"):
    print("ability:", row[0])
c.close()
print("DRYRUN_RENAME_OK")
