#!/usr/bin/env python3
"""Dry-run for vps-add-openrouter-eleven.py against a synthetic DB."""
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
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, quota_type INTEGER, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER, PRIMARY KEY ("group", model, channel_id));
CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE, icon TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER);
CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT);
""")
now = 1759600000
cur.execute(
    'INSERT INTO channels(id,type,name,models,model_mapping,base_url,`key`,"group",status,created_time,updated_time,deleted_at) VALUES (1,1,\'Keyo Primary\',?,?,?,?, \'default\',1,?,?,NULL)',
    (
        "gemini-3.8-flash-tts",
        json.dumps({"gemini-3.8-flash-tts": "gemini-3.8-flash-tts"}, ensure_ascii=False),
        "https://api.example.com",
        "sk-existing-key",
        now,
        now,
    ),
)
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (1,'Keyo','Custom',1,?,?)", (now, now))
cur.execute("INSERT INTO vendors(id,name,icon,status,created_time,updated_time) VALUES (2,'ElevenLabs','Custom',1,?,?)", (now, now))
cur.execute("INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,quota_type,status,sync_official,created_time,updated_time,deleted_at) VALUES ('gemini-3.8-flash-tts','x','Custom','语音合成',1,'{}',0,1,0,?,?,NULL)", (now, now))
cur.execute("INSERT INTO options(key,value) VALUES ('ModelRatio','{\"legacy\":1}'),('CompletionRatio','{\"legacy\":1}'),('AudioRatio','{}'),('AudioCompletionRatio','{}'),('ModelPrice','{}')")
cur.execute('INSERT INTO abilities("group",model,channel_id,enabled,priority,weight) VALUES (?,?,?,?,?,?)', ("default", "keyo-example:free", 1, 1, 0, 1))
cur.execute('INSERT INTO options(key,value) VALUES (?,?)', ("GroupRatio", '{"default":1}'))
cur.execute('UPDATE options SET value=? WHERE key=?', ('{"keyo-example:free":0,"keyo-eleven-v4":7,"keyo-eleven-v4-turbo":8}', "ModelPrice"))
original_channel = cur.execute('SELECT * FROM channels WHERE id=1').fetchone()
c.commit()
c.close()

env = dict(os.environ)
env["OPENROUTER_API_KEY"] = "sk-dryrun-test-key"
icon_state = None
for run in ("first", "second"):
    r = subprocess.run(
        [sys.executable, "scripts/vps-add-openrouter-eleven.py", db, copy_base],
        capture_output=True, text=True,
        env=env,
    )
    print("=== %s run ===" % run)
    print(r.stdout.strip())
    if r.returncode != 0:
        print("STDERR:", r.stderr)
        sys.exit(1)
    with sqlite3.connect(db) as check:
        vendor = check.execute("SELECT id, icon FROM vendors WHERE name='ElevenLabs'").fetchall()
        assert vendor == [(2, "ElevenLabs")], vendor
        icons = check.execute("SELECT model_name, icon, vendor_id FROM models WHERE model_name IN ('keyo-eleven-v4','keyo-eleven-v4-turbo') ORDER BY model_name").fetchall()
        assert icons == [("keyo-eleven-v4", "ElevenLabs", 2), ("keyo-eleven-v4-turbo", "ElevenLabs", 2)], icons
        assert check.execute("SELECT icon FROM vendors WHERE name='Keyo'").fetchone()[0] == "Custom"
        state = (vendor, icons)
        if icon_state is not None:
            assert state == icon_state, "icon update is not idempotent"
        icon_state = state

c = sqlite3.connect(db)
cur = c.cursor()
ch = cur.execute("SELECT id, models, model_mapping, `key`, base_url FROM channels WHERE name='Keyo TTS'").fetchone()
assert ch is not None, "Keyo TTS channel missing"
chid, models_col, mapping, key, base = ch
ids = [p.strip() for p in models_col.split(",")]
expect = ["keyo-eleven-v4", "keyo-eleven-v4-turbo"]
print("channel models:", ids)
assert ids == expect, ids
md = json.loads(mapping)
print("mapping entries:", len(md))
assert md["keyo-eleven-v4"] == "elevenlabs/eleven-v4", md
assert md["keyo-eleven-v4-turbo"] == "elevenlabs/eleven-v4-turbo", md
assert key == "sk-dryrun-test-key" and base == "https://openrouter.ai/api", (key, base)

mr = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0])
cr = json.loads(cur.execute("SELECT value FROM options WHERE key='CompletionRatio'").fetchone()[0])
ar = json.loads(cur.execute("SELECT value FROM options WHERE key='AudioRatio'").fetchone()[0])
acr = json.loads(cur.execute("SELECT value FROM options WHERE key='AudioCompletionRatio'").fetchone()[0])
mp = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0])
assert mr["keyo-eleven-v4"] == 40 and mr["keyo-eleven-v4-turbo"] == 20, mr
assert cr["keyo-eleven-v4"] == 0 and cr["keyo-eleven-v4-turbo"] == 0, cr
assert ar["keyo-eleven-v4"] == 0 and ar["keyo-eleven-v4-turbo"] == 0, ar
assert acr["keyo-eleven-v4"] == 0 and acr["keyo-eleven-v4-turbo"] == 0, acr
assert "keyo-eleven-v4" not in mp and "keyo-eleven-v4-turbo" not in mp, mp
assert mr["legacy"] == 1 and cr["legacy"] == 1, (mr, cr)
assert mp["keyo-example:free"] == 0
assert cur.execute('SELECT * FROM channels WHERE id=1').fetchone() == original_channel
assert cur.execute('SELECT enabled FROM abilities WHERE model=?', ("keyo-example:free",)).fetchone()[0] == 1
assert cur.execute('SELECT "group" FROM channels WHERE id=?', (chid,)).fetchone()[0] == "default"
print("pricing ok: ratio", {k: mr[k] for k in ("keyo-eleven-v4", "keyo-eleven-v4-turbo")},
      "comp", {k: cr[k] for k in ("keyo-eleven-v4", "keyo-eleven-v4-turbo")},
      "audio", ar, "acomp", acr, "modelprice removed")

rows = cur.execute("SELECT model_name, tags, icon, vendor_id, endpoints, quota_type FROM models WHERE model_name != 'gemini-3.8-flash-tts'").fetchall()
for row in rows:
    print("model:", row)
    assert row[1] == "语音合成", row
    assert row[2] == "ElevenLabs", row
    ep = json.loads(row[4])
    assert ep == {"openai-audio": "/v1/audio/speech"}, row
    assert row[5] == 0, row
    vid = cur.execute("SELECT name FROM vendors WHERE id=?", (row[3],)).fetchone()[0]
    assert vid == "ElevenLabs", (row, vid)

ab = cur.execute("SELECT model, \"group\", channel_id FROM abilities WHERE model IN ('keyo-eleven-v4','keyo-eleven-v4-turbo')").fetchall()
print("abilities:", len(ab))
assert len(ab) == 2 and all(r[1] == "default" and r[2] == chid for r in ab), ab

a = open(os.path.join(copy_base, "config/marketplace-model-copy.json"), encoding="utf-8").read()
b = open(os.path.join(copy_base, "services/creem-moderation-proxy/marketplace-model-copy.json"), encoding="utf-8").read()
assert a == b, "copies diverged"
da = json.loads(a)
assert "keyo-eleven-v4" in da and "keyo-eleven-v4-turbo" in da, "copy entries missing"
assert da["keyo-eleven-v4"]["badge"]["zhCN"] == "按 Token 计费" and da["keyo-eleven-v4"]["unit"] == "token"
assert da["keyo-eleven-v4-turbo"]["badge"]["en"] == "Token-based"
assert da["grok-imagine-video-1.5"] == {"description": "x"}
print("copies merged ok, byte-identical:", True)
c.close()
print("DRY_RUN_OPENROUTER_ELEVEN_OK")