import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, type INTEGER, key TEXT, name TEXT, models TEXT, base_url TEXT, "group" TEXT, model_mapping TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
""")
now = 1759700000
# simulate delist aftermath: soft-deleted rows, no channel, option leftovers cleaned
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'智谱','Zhipu.Color',1,?,?)", (now, now))
for name in ["glm-5.2-free", "kimi-k3-free", "deepseek-v4-pro-free", "deepseek-v4-flash-free"]:
    cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES (?, 'x','Custom','大语言模型',1,'{}',0,0,?,?,1759600000)", (name, now, now))
c.commit(); c.close()

env = {**os.environ, "SENSENOVA_API_KEY": "sk-test-sensenova-token-123"}
r = subprocess.run([sys.executable, "scripts/vps-relist-sensenova-free-twins.py", db], capture_output=True, text=True, env=env)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr); sys.exit(1)

r2 = subprocess.run([sys.executable, "scripts/vps-relist-sensenova-free-twins.py", db], capture_output=True, text=True, env=env)
print("--- second run tail ---"); print("\n".join(r2.stdout.splitlines()[-3:]))
if r2.returncode != 0:
    print("STDERR2:", r2.stderr); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
print("channel:", cur.execute("SELECT name, base_url, models, model_mapping, status FROM channels").fetchone())
print("ModelPrice:", cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
for row in cur.execute("SELECT model_name, tags, icon, status, deleted_at FROM models ORDER BY id"):
    print("row:", row)
for row in cur.execute("SELECT model, channel_id FROM abilities"):
    print("ability:", row)
c.close()
print("DRYRUN_RELIST_OK")
