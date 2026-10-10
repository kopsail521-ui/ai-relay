#!/usr/bin/env python3
"""Dry-run for vps-fix-gemini-tts-native.py against a synthetic DB."""
import json
import os
import sqlite3
import subprocess
import sys
import tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE channels (id INTEGER PRIMARY KEY, type INTEGER, name TEXT, models TEXT, base_url TEXT, `key` TEXT, "group" TEXT, status INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, description TEXT, icon TEXT, tags TEXT, vendor_id INTEGER, endpoints TEXT, status INTEGER, sync_official INTEGER, created_time INTEGER, updated_time INTEGER, deleted_at INTEGER);
CREATE TABLE abilities ("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER, weight INTEGER);
""")
now = 1759600000
cur.execute(
    "INSERT INTO channels(id,type,name,models,base_url,`key`,\"group\",status,created_time,updated_time,deleted_at) VALUES (1,1,'Keyo Primary',?,?,?, 'default',1,?,?,NULL)",
    (
        "gemini-3.8-flash,gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,claude-fable-5-1",
        "https://api.openlux.ai",
        "sk-donor-key",
        now,
        now,
    ),
)
cur.execute(
    "INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('gemini-3.8-flash-tts','x','Gemini.Color','语音合成',1,'{\"openai\":\"/v1/chat/completions\"}',1,0,?,?,NULL)",
    (now, now),
)
cur.execute(
    "INSERT INTO models(model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,created_time,updated_time,deleted_at) VALUES ('gemini-3.1-flash-tts-preview','x','Gemini.Color','语音合成',1,'{\"openai\":\"/v1/audio/speech\"}',1,0,?,?,NULL)",
    (now, now),
)
cur.execute('INSERT INTO abilities("group",model,channel_id,enabled,priority,weight) VALUES (\'default\',\'gemini-3.8-flash-tts\',1,1,0,1),(\'vip\',\'gemini-3.8-flash-tts\',1,1,0,1),(\'default\',\'gemini-3.1-flash-tts-preview\',1,1,0,1),(\'vip\',\'gemini-3.1-flash-tts-preview\',1,1,0,1)')
c.commit()
c.close()

for run in ("first", "second"):
    r = subprocess.run([sys.executable, "scripts/vps-fix-gemini-tts-native.py", db], capture_output=True, text=True)
    print("=== %s run ===" % run)
    print(r.stdout.strip())
    if r.returncode != 0:
        print("STDERR:", r.stderr)
        sys.exit(1)

c = sqlite3.connect(db)
cur = c.cursor()
chans = cur.execute("SELECT id,type,name,models,base_url,`key`,status FROM channels ORDER BY id").fetchall()
for ch in chans:
    print("channel:", ch)
assert chans[1][1] == 24 and chans[1][2] == "Keyo Audio", "audio channel missing/wrong type"
assert chans[1][4] == chans[0][4] and chans[1][5] == chans[0][5], "audio channel must clone donor base/key"
prim_models = chans[0][3]
assert "gemini-3.8-flash-tts" not in prim_models and "gemini-3.1-flash-tts-preview" not in prim_models, "donor still lists TTS"
assert "gemini-3.8-flash" in prim_models, "donor lost non-TTS models"
aud_models = chans[1][3].split(",")
assert aud_models == ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"], aud_models
for mid in ("gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"):
    rows = cur.execute('SELECT "group", channel_id FROM abilities WHERE model=? ORDER BY "group"', (mid,)).fetchall()
    print("abilities", mid, rows)
    assert rows == [("default", chans[1][0]), ("vip", chans[1][0])], rows
    ep = cur.execute("SELECT endpoints FROM models WHERE model_name=?", (mid,)).fetchone()[0]
    print("endpoints", mid, ep)
    assert json.loads(ep) == {"gemini": "/v1beta/models/%s:generateContent" % mid}, ep
c.close()
print("DRY_RUN_NATIVE_OK")