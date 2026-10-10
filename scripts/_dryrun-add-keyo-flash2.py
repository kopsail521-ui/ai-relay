import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db); cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, type INTEGER, key TEXT, name TEXT, models TEXT, base_url TEXT, "group" TEXT, model_mapping TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
""")
cur.execute("INSERT INTO vendors(id,name,icon,status) VALUES (1,'其他','Custom',1)")
cur.execute("INSERT INTO options(key,value) VALUES('ModelPrice','{}')")
cur.execute("INSERT INTO options(key,value) VALUES('ModelRatio','{}')")
cur.execute("INSERT INTO options(key,value) VALUES('CompletionRatio','{}')")
c.commit(); c.close()

env = {**os.environ, "UNISOUND_API_KEY": "sk-test-unisound-123"}
r = subprocess.run([sys.executable, "scripts/vps-add-keyo-flash2-free.py", db], capture_output=True, text=True, env=env)
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr[-500:]); sys.exit(1)

# 幂等第二遍
r2 = subprocess.run([sys.executable, "scripts/vps-add-keyo-flash2-free.py", db], capture_output=True, text=True, env=env)
if r2.returncode != 0:
    print("SECOND RUN FAILED:", r2.stderr[-500:]); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
ch = cur.execute("SELECT id,name,models,base_url,model_mapping,status FROM channels WHERE name='Keyo Flash'").fetchone()
mp = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
mr = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0])
cr = json.loads(cur.execute("SELECT value FROM options WHERE key='CompletionRatio'").fetchone()[0])
pub_row = cur.execute("SELECT model_name,status,deleted_at FROM models WHERE model_name='keyo-flash2:free'").fetchone()
twin_row = cur.execute("SELECT model_name,status,deleted_at FROM models WHERE model_name='keyo-flash2'").fetchone()
pub_ab = cur.execute("SELECT count(*) FROM abilities WHERE model='keyo-flash2:free'").fetchone()[0]
twin_ab = cur.execute("SELECT count(*) FROM abilities WHERE model='keyo-flash2'").fetchone()[0]
c.close()

print("channel:", ch)
print("ModelPrice[public]:", mp.get("keyo-flash2:free"), "| ModelPrice[twin]:", mp.get("keyo-flash2"))
print("ModelRatio[twin]:", mr.get("keyo-flash2"), "(expect 0.005)")
print("CompletionRatio[twin]:", cr.get("keyo-flash2"), "(expect 5)")
print("ModelRatio[public] 应缺:", mr.get("keyo-flash2:free"))
print("public row:", pub_row, "| twin row:", twin_row)
print("abilities: pub=%d twin=%d" % (pub_ab, twin_ab))

fails = []
if not ch or ch[2] != "keyo-flash2:free": fails.append("channel models wrong")
if ch and ch[4] != '{"keyo-flash2:free":"u2-flash"}': fails.append("mapping wrong: %r" % (ch[4] if ch else None))
if mp.get("keyo-flash2:free") != 0: fails.append("public ModelPrice != 0")
if "keyo-flash2" in (mp or {}): fails.append("twin should not be in ModelPrice")
if mr.get("keyo-flash2") != 0.005: fails.append("twin ratio != 0.005")
if "keyo-flash2:free" in (mr or {}): fails.append("public must not be in ModelRatio")
if cr.get("keyo-flash2") != 5: fails.append("twin comp != 5")
if pub_row and pub_row[1] != 1: fails.append("public status != 1")
# twin must be gone from the square: either absent (first listing) or soft-deleted
if twin_row is not None and (twin_row[1] == 1 and twin_row[2] is None):
    fails.append("twin live in marketplace (should be absent or soft-deleted)")
if pub_ab != 1: fails.append("public abilities != 1")
if twin_ab != 0: fails.append("twin abilities leaked")
if fails:
    print("FAILS:"); [print("  -", f) for f in fails]; sys.exit(1)
print("DRYRUN_ADD_FLASH2_OK")
