import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, type INTEGER, key TEXT, name TEXT, models TEXT, base_url TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
""")
now = 1759700000
cur.execute("INSERT INTO channels(id,type,key,name,models,base_url,status,updated_time) VALUES (5,1,'sk-x','Keyo Images','gpt-image-2,nano-banana-2,gpt-image-2.5-flare','https://grsaiapi.com',1,?)", (now,))
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'Google','Gemini.Color',1,?,?)", (now, now))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('nano-banana-2','x','Gemini.Color','图片',1,'{}',1,0,?,?,0)", (now, now))
cur.execute("INSERT INTO abilities(\"group\",model,channel_id,enabled,priority,weight) VALUES ('default','nano-banana-2',5,1,0,1),('vip','nano-banana-2',5,1,0,1)")
cur.execute("INSERT INTO options(key,value) VALUES ('ModelPrice','{\"nano-banana-2\":0.0205}'),('ModelRatio','{\"nano-banana-2\":0.01}')")
c.commit(); c.close()

r = subprocess.run([sys.executable, "scripts/vps-add-grsai-nano-banana-21.py", db], capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr); sys.exit(1)

r2 = subprocess.run([sys.executable, "scripts/vps-add-grsai-nano-banana-21.py", db], capture_output=True, text=True)
print("--- second run tail ---"); print("\n".join(r2.stdout.splitlines()[-3:]))
if r2.returncode != 0:
    print("STDERR2:", r2.stderr); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
print("channel models:", cur.execute("SELECT models FROM channels WHERE id=5").fetchone()[0])
print("ModelPrice:", cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
print("ModelRatio:", cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0])
for row in cur.execute("SELECT model_name, tags, icon, vendor_id, endpoints, status FROM models"):
    print("row:", row)
for row in cur.execute("SELECT model, channel_id FROM abilities"):
    print("ability:", row)
c.close()
print("DRYRUN_NANO21_OK")
