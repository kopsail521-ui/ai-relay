#!/usr/bin/env python3
"""Dry-run for vps-add-aicopy-media.py against a synthetic DB."""
import json
import os
import sqlite3
import subprocess
import sys
import tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
copy_base = os.path.join(tmp, "airelay")
os.makedirs(os.path.join(copy_base, "config"), exist_ok=True)
os.makedirs(os.path.join(copy_base, "services", "creem-moderation-proxy"), exist_ok=True)
for p in ("config/marketplace-model-copy.json", "services/creem-moderation-proxy/marketplace-model-copy.json"):
    json.dump({"grok-imagine-video-1.5": {"description": "x"}}, open(os.path.join(copy_base, p), "w", encoding="utf-8"), ensure_ascii=False)

c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, type INTEGER, name TEXT, models TEXT, model_mapping TEXT, base_url TEXT, `key` TEXT, "group" TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
""")
now = 1759600000
cur.execute(
    'INSERT INTO channels(id,type,name,models,model_mapping,base_url,`key`,"group",status,created_time,updated_time,deleted_at) VALUES (1,1,\'Keyo Video\',?,?,?,?, \'default\',1,?,?,NULL)',
    (
        "grok-imagine-video-1.5",
        json.dumps({"grok-imagine-video-1.5": "grok-1.5-官转接口"}, ensure_ascii=False),
        "https://api.aicopy.top",
        "sk-existing-key",
        now,
        now,
    ),
)
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'Keyo','Custom',1,?,?)", (now, now))
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (2,'xAI','XAI',1,?,?)", (now, now))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('grok-imagine-video-1.5','x','XAI','视频模型',2,'{}',1,0,?,?,NULL)", (now, now))
cur.execute("INSERT INTO options(key,value) VALUES ('ModelRatio','{\"legacy\":1}'),('CompletionRatio','{}'),('ModelPrice','{\"grok-imagine-video-1.5\":0.30822}')")
c.commit()
c.close()

for run in ("first", "second"):
    r = subprocess.run(
        [sys.executable, "scripts/vps-add-aicopy-media.py", db, copy_base],
        capture_output=True, text=True,
    )
    print("=== %s run ===" % run)
    print(r.stdout.strip())
    if r.returncode != 0:
        print("STDERR:", r.stderr)
        sys.exit(1)

c = sqlite3.connect(db)
cur = c.cursor()
models_col, mapping, key = cur.execute("SELECT models, model_mapping, `key` FROM channels WHERE id=1").fetchone()
ids = [p.strip() for p in models_col.split(",")]
expect = ["grok-imagine-video-1.5", "keyo-super-resolution-1080p", "keyo-super-resolution-2k", "keyo-super-resolution-4k", "keyo-video-subtitle-removal", "grok-image-2.0", "keyo-voice-clone", "keyo-tts", "keyo-song", "keyo-asr"]
print("channel models:", ids)
assert ids == expect, ids
md = json.loads(mapping)
print("mapping entries:", len(md))
assert len(md) == 10 and md["grok-imagine-video-1.5"] == "grok-1.5-官转接口", md
assert md["keyo-tts"] == "【豆姐】文字转语音" and md["grok-image-2.0"] == "grok-图片-2.0", md
assert key == "sk-existing-key", key

mp = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
mr = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0])
expect_price = {
    "grok-imagine-video-1.5": 0.30822,
    "keyo-super-resolution-1080p": 0.054795,
    "keyo-super-resolution-2k": 0.109589,
    "keyo-super-resolution-4k": 0.219178,
    "keyo-video-subtitle-removal": 0.013699,
    "grok-image-2.0": 0.00274,
    "keyo-voice-clone": 0.013699,
    "keyo-tts": 0.013699,
    "keyo-song": 0.013699,
    "keyo-asr": 0.013699,
}
for k, v in expect_price.items():
    assert abs(mp[k] - v) < 1e-9, (k, mp[k], v)
print("pricing ok:", {k: mp[k] for k in expect_price})
assert "legacy" in mr and not any(k in mr for k in expect_price), mr

for row in cur.execute("SELECT model_name, tags, icon, vendor_id, endpoints FROM models WHERE model_name != 'grok-imagine-video-1.5'"):
    print("model:", row)
    ep = json.loads(row[4])
    if row[0].startswith(("keyo-super-resolution", "keyo-video-subtitle")):
        assert "openai-video" in ep, row
    else:
        assert "openai" in ep, row
    assert row[2] == ("XAI" if row[0] == "grok-image-2.0" else "Custom"), row
    vid = cur.execute("SELECT name FROM vendors WHERE id=?", (row[3],)).fetchone()[0]
    assert vid == ("xAI" if row[0] == "grok-image-2.0" else "Keyo"), (row, vid)

ab = cur.execute("SELECT model, \"group\", channel_id FROM abilities WHERE model != 'grok-imagine-video-1.5'").fetchall()
print("abilities:", len(ab))
assert len(ab) == 9 and all(r[1] == "default" and r[2] == 1 for r in ab), ab

a = open(os.path.join(copy_base, "config/marketplace-model-copy.json"), encoding="utf-8").read()
b = open(os.path.join(copy_base, "services/creem-moderation-proxy/marketplace-model-copy.json"), encoding="utf-8").read()
assert a == b, "copies diverged"
da = json.loads(a)
assert all(m in da for m in expect_price), "copy entries missing"
assert da["keyo-tts"]["badge"]["zhCN"] == "按次计费" and da["keyo-tts"]["suffix"]["en"] == "/ request"
assert da["grok-imagine-video-1.5"] == {"description": "x"}
print("copies merged ok, byte-identical:", True)
c.close()
print("DRY_RUN_AICOPY_MEDIA_OK")