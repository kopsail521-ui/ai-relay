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
now = 1791500000
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'Anthropic','Claude.Color',1,?,?)", (now, now))
# Keyo Primary 渠道（OpenLux），含 sonnet-5-5 三组 abilities
cur.execute(
    'INSERT INTO channels(id,type,key,name,models,base_url,"group",status,created_time,updated_time) VALUES (2,1,\'k\',\'Keyo Primary\',\'claude-sonnet-5-5,claude-opus-5-5\',\'https://api.openlux.ai\',\'default,Claude-Code-2,AWS-Bedrock-2\',1,?,?)',
    (now, now),
)
for g in ("default", "Claude-Code-2", "AWS-Bedrock-2"):
    cur.execute('INSERT INTO abilities("group",model,channel_id,enabled,priority,weight) VALUES (?,?,?,?,?,?)', (g, "claude-sonnet-5-5", 2, 1, 0, 1))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('claude-sonnet-5-5','x','Claude.Color','大语言模型',1,'{}',1,0,?,?,NULL)", (now, now))
cur.execute("INSERT INTO options(key,value) VALUES('GroupRatio',?)", (json.dumps({"default":1,"vip":1,"Claude-Code-2":1.666686,"AWS-Bedrock-2":3.333371}),))
cur.execute("INSERT INTO options(key,value) VALUES('ModelRatio',?)", (json.dumps({"claude-sonnet-5-5":0.441175}),))
cur.execute("INSERT INTO options(key,value) VALUES('CompletionRatio',?)", (json.dumps({"claude-sonnet-5-5":5}),))
c.commit(); c.close()

env = {**os.environ}
r = subprocess.run([sys.executable, "scripts/vps-add-claude-haiku-5-5.py", db], capture_output=True, text=True, env=env)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr); sys.exit(1)

r2 = subprocess.run([sys.executable, "scripts/vps-add-claude-haiku-5-5.py", db], capture_output=True, text=True, env=env)
print("--- second run tail ---"); print("\n".join(r2.stdout.splitlines()[-3:]))
if r2.returncode != 0:
    print("STDERR2:", r2.stderr); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
chan = cur.execute('SELECT models, "group" FROM channels WHERE id=2').fetchone()
mr = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0])
cr = json.loads(cur.execute("SELECT value FROM options WHERE key='CompletionRatio'").fetchone()[0])
gr = json.loads(cur.execute("SELECT value FROM options WHERE key='GroupRatio'").fetchone()[0])
ug = json.loads(cur.execute("SELECT value FROM options WHERE key='UserUsableGroups'").fetchone()[0])
groups = sorted(g for (g,) in cur.execute('SELECT "group" FROM abilities WHERE model=? AND channel_id=2', ("claude-haiku-5-5",)))
models_row = cur.execute("SELECT model_name, tags, icon, status, deleted_at FROM models WHERE model_name='claude-haiku-5-5'").fetchone()
c.close()

print("channel models:", chan[0])
print("channel groups:", chan[1])
print("ModelRatio[haiku]:", mr.get("claude-haiku-5-5"), "(expect 0.036765)")
print("CompletionRatio[haiku]:", cr.get("claude-haiku-5-5"), "(expect 5)")
print("GroupRatio:", {k: gr[k] for k in ("default", "Claude-Code-2", "AWS-Bedrock-2")})
print("UserUsableGroups has groups:", all(k in ug for k in ("Claude-Code-2", "AWS-Bedrock-2")))
print("ability groups:", groups)
print("marketplace row:", models_row)

fails = []
if "claude-haiku-5-5" not in chan[0].split(","): fails.append("channel missing model")
for g in ("default", "Claude-Code-2", "AWS-Bedrock-2"):
    if g not in chan[1].split(","): fails.append("channel group missing " + g)
if mr.get("claude-haiku-5-5") != 0.036765: fails.append("ModelRatio wrong")
if cr.get("claude-haiku-5-5") != 5: fails.append("CompletionRatio wrong")
if groups != ["AWS-Bedrock-2", "Claude-Code-2", "default"]: fails.append("ability groups wrong: %s" % groups)
if not models_row or models_row[3] != 1 or models_row[4] is not None: fails.append("marketplace row wrong")
# 兄弟模型不受影响
if mr.get("claude-sonnet-5-5") != 0.441175: fails.append("sonnet ratio clobbered")

if fails:
    print("FAILS:"); [print("  -", f) for f in fails]; sys.exit(1)
print("DRYRUN_ADD_HAIKU_OK")
