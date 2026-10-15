"""Dryrun: exercise vps-add-gitee-speech-gift-twins.py against a fixture DB."""
import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, type INTEGER, key TEXT, name TEXT, models TEXT, base_url TEXT, model_mapping TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
""")
now = 1759700000
cur.execute(
    "INSERT INTO channels(id,type,key,name,models,base_url,model_mapping,status,updated_time) VALUES (7,1,'sk-g','Keyo Gitee',?,'https://ai.gitee.com','{}',1,?)",
    ("SenseVoiceSmall,GLM-ASR,whisper-large-v3", now),
)
cur.execute(
    "INSERT INTO channels(id,type,key,name,models,base_url,model_mapping,status,updated_time) VALUES (8,1,'sk-p','Keyo Gitee Passthru',?,'http://127.0.0.1:3010','{\"x\":\"y\"}',1,?)",
    ("Spark-TTS-0.5B,CosyVoice3", now),
)
cur.execute("INSERT INTO vendors(id,name,icon,status) VALUES (9,'阿里巴巴','Qwen.Color',1),(8,'智谱','Zhipu.Color',1),(24,'其他','Custom',1)")
for name, desc, icon, tags, vid, ep in [
    ("SenseVoiceSmall", "阿里 SenseVoice Small 语音识别模型。轻量快速。 计费：$0.00685/次。", "Qwen.Color", "语音识别", 9, '{"audio-transcriptions": "v1/audio/transcriptions"}'),
    ("GLM-ASR", "智谱 GLM ASR 语音识别模型。 计费：$0.006849/次。", "Zhipu.Color", "语音识别", 8, '{"openai": "v1/audio/transcriptions"}'),
    ("Spark-TTS-0.5B", "Spark TTS 0.5B 轻量语音合成模型。 计费：$0.0137/次。", "Custom", "语音合成", 24, '{"audio-speech": "v1/async/audio/speech"}'),
]:
    cur.execute(
        "INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES (?,?,?,?,?,?,1,0,?,?,0)",
        (name, desc, icon, tags, vid, ep, now, now),
    )
    cur.execute(
        'INSERT INTO abilities("group",model,channel_id,enabled,priority,weight) VALUES (?,?,?,1,0,1)',
        ("default", name, 7 if name != "Spark-TTS-0.5B" else 8),
    )
cur.execute("INSERT INTO options(key,value) VALUES ('ModelPrice','{\"SenseVoiceSmall\":0.006849,\"GLM-ASR\":0.006849,\"Spark-TTS-0.5B\":0.013699}')")
c.commit(); c.close()

for run in (1, 2):
    r = subprocess.run([sys.executable, "scripts/vps-add-gitee-speech-gift-twins.py", db], capture_output=True, text=True)
    print("--- run %d ---" % run)
    print(r.stdout)
    if r.returncode != 0:
        print("STDERR:", r.stderr); sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
for cid, name, models_s, mm in cur.execute("SELECT id,name,models,model_mapping FROM channels").fetchall():
    print("channel", cid, name, "| models:", models_s, "| mapping:", mm)
mp = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
print("ModelPrice:", json.dumps(mp))
for row in cur.execute("SELECT model_name, tags, vendor_id, status FROM models WHERE model_name LIKE '%:free'"):
    print("model row:", row)
for row in cur.execute('SELECT model, "group", channel_id FROM abilities WHERE model LIKE "%:free"'):
    print("ability:", row)
desc = cur.execute("SELECT description FROM models WHERE model_name='SenseVoiceSmall:free'").fetchone()[0]
assert "赠送金" in desc and "$0.00685" not in desc, desc
mm8 = json.loads(cur.execute("SELECT model_mapping FROM channels WHERE id=8").fetchone()[0])
assert mm8.get("Spark-TTS-0.5B:free") == "Spark-TTS-0.5B" and mm8.get("x") == "y", mm8
c.close()
print("DRYRUN_SPEECH_GIFT_TWINS_OK")