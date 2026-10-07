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
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'智谱','Zhipu.Color',1,?,?)", (now, now))

LEGACY = ["glm-5.2-free", "kimi-k3-free", "deepseek-v4-pro-free", "deepseek-v4-flash-free"]
FREE = ["glm-5.2:free", "kimi-k3:free", "deepseek-v4-pro:free", "deepseek-v4-flash:free"]

# The broken 2026-10-06 state we are recovering from: legacy "-free" IDs live and
# listed on the channel; the ":free" IDs absent; ModelPrice carries the legacy keys.
cur.execute(
    "INSERT INTO channels(id,type,key,name,models,base_url,\"group\",model_mapping,status,created_time,updated_time) VALUES (1,1,'old-key','Keyo Free',?,'https://token.sensenova.cn','default','{}',1,?,?)",
    (",".join(LEGACY), now, now),
)
for name in LEGACY:
    cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES (?, 'x','Custom','大语言模型',1,'{}',1,0,?,?,NULL)", (name, now, now))
    cur.execute('INSERT INTO abilities("group",model,channel_id,enabled,priority,weight) VALUES (?,?,?,?,?,?)', ("default", name, 1, 1, 0, 1))
# soft-deleted ":free" rows left over from the 2026-09-23 delist
for name in FREE:
    cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES (?, 'x','Custom','大语言模型',1,'{}',0,0,?,?,1759600000)", (name, now, now))
cur.execute("INSERT INTO options(key,value) VALUES('ModelPrice',?)", (json.dumps({m: 0 for m in LEGACY}),))
cur.execute("INSERT INTO options(key,value) VALUES('ModelRatio',?)", (json.dumps({m: 0.7 for m in LEGACY}),))
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
chan = cur.execute("SELECT name, base_url, models, model_mapping, status FROM channels WHERE id=1").fetchone()
print("channel:", chan)
mp = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
mr = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0])
print("ModelPrice:", mp)
print("ModelRatio:", mr)
live = [r[0] for r in cur.execute("SELECT model_name FROM models WHERE deleted_at IS NULL ORDER BY model_name")]
print("live models:", live)
abs_ = [r[0] for r in cur.execute("SELECT model FROM abilities ORDER BY model")]
print("abilities:", abs_)
c.close()

fails = []
for mid in FREE:
    if mid not in chan[2].split(","):
        fails.append("channel missing " + mid)
    if mid not in live:
        fails.append("models missing " + mid)
    if mid not in abs_:
        fails.append("ability missing " + mid)
    if mp.get(mid) != 0:
        fails.append("ModelPrice not 0 for " + mid)
    if mid in mr:
        fails.append("ModelRatio should not carry " + mid)
for mid in LEGACY:
    if mid in chan[2].split(","):
        fails.append("channel still lists legacy " + mid)
    if mid in live:
        fails.append("models still live legacy " + mid)
    if mid in abs_:
        fails.append("ability still present legacy " + mid)
    if mid in mp or mid in mr:
        fails.append("ratio/price still carry legacy " + mid)

if fails:
    print("FAILS:"); [print("  -", f) for f in fails]; sys.exit(1)
print("DRYRUN_RELIST_OK")
