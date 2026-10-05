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
cur.execute("INSERT INTO channels(id,type,key,name,base_url,models,\"group\",status,updated_time) VALUES (1,1,'sk-old','Keyo Video Old','https://upstream.example','wan3.0-video,grok-1.5-video,grok-imagine-video-1.5-preview','default',1,?)", (now,))
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'xAI','XAI',1,?,?)", (now, now))
for name in ["wan3.0-video", "grok-1.5-video", "grok-imagine-video-1.5-preview"]:
    cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES (?,'x','XAI','视频按秒',1,'{}',1,0,?,?,0)", (name, now, now))
cur.execute("INSERT INTO abilities(\"group\",model,channel_id,enabled,priority,weight) VALUES ('default','grok-1.5-video',1,1,0,1),('default','grok-imagine-video-1.5-preview',1,1,0,1),('default','wan3.0-video',1,1,0,1)")
cur.execute("INSERT INTO options(key,value) VALUES ('ModelRatio','{\"grok-1.5-video\":0.12135}'),('ModelPrice','{\"grok-imagine-video-1.5-preview\":0.09}'),('CompletionRatio','{\"grok-1.5-video\":1}')")
c.commit(); c.close()

env = {**os.environ, "AICOPY_API_KEY": "sk-test-1234567890abcdef"}
r = subprocess.run([sys.executable, "scripts/vps-grok15-video-swap.py", db], capture_output=True, text=True, env=env)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr); sys.exit(1)

# key missing on re-run would fail; provide again for idempotency check
r2 = subprocess.run([sys.executable, "scripts/vps-grok15-video-swap.py", db], capture_output=True, text=True, env=env)
print("--- second run ---"); print(r2.stdout)
if r2.returncode != 0:
    print("STDERR2:", r2.stderr); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
print("channels:")
for row in cur.execute("SELECT id, name, base_url, models, model_mapping, status, key FROM channels"):
    print("  ", row[0], row[1], row[2], '| models:', row[3], '| mapping:', row[4], '| status:', row[5], '| key set:', bool(row[6]))
print("options ModelPrice:", cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
print("options ModelRatio:", cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0])
for row in cur.execute("SELECT model_name, tags, icon, status, deleted_at IS NULL FROM models ORDER BY id"):
    print("model row:", row)
for row in cur.execute("SELECT model, channel_id FROM abilities"):
    print("ability:", row)
c.close()
print("DRYRUN_SWAP_OK")
