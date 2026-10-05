import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, name TEXT, models TEXT, base_url TEXT, updated_time INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
""")
now = 1759600000
cur.execute("INSERT INTO channels(id,name,models,base_url) VALUES (1,'Keyo Media','Bespoke-Nimble-9B,gemma-4-26B-A4B-it','https://ai.gitee.com')")
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'阿里巴巴','Qwen.Color',1,?,?)", (now, now))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time) VALUES ('Bespoke-Nimble-9B','x','Qwen.Color','系统一模型',1,'{}',1,0,?,?)", (now, now))
cur.execute("INSERT INTO abilities(\"group\",model,channel_id,enabled,priority,weight) VALUES ('default','Bespoke-Nimble-9B',1,1,0,1),('vip','Bespoke-Nimble-9B',1,1,0,1)")
cur.execute("INSERT INTO options(key,value) VALUES ('ModelRatio','{\"Bespoke-Nimble-9B\":0.016}'),('CompletionRatio','{\"Bespoke-Nimble-9B\":0}')")
c.commit(); c.close()

r = subprocess.run([sys.executable, "scripts/vps-add-gitee-systemone-3.py", db], capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr)
    sys.exit(1)

# idempotency: second run must not duplicate or fail
r2 = subprocess.run([sys.executable, "scripts/vps-add-gitee-systemone-3.py", db], capture_output=True, text=True)
print("--- second run ---")
print(r2.stdout)
if r2.returncode != 0:
    print("STDERR2:", r2.stderr)
    sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
print("channel models:", cur.execute("SELECT models FROM channels WHERE id=1").fetchone()[0])
print("ModelRatio:", json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0]))
print("CompletionRatio:", json.loads(cur.execute("SELECT value FROM options WHERE key='CompletionRatio'").fetchone()[0]))
print("ModelPrice:", cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone())
for row in cur.execute("SELECT model_name, tags, icon, vendor_id, endpoints, status FROM models ORDER BY id"):
    print("model row:", row)
for row in cur.execute("SELECT model, \"group\", channel_id FROM abilities ORDER BY model, \"group\""):
    print("ability:", row)
c.close()
print("DRY_RUN_OK")
