#!/usr/bin/env python3
"""Dry-run for vps-tag-video-processing.py against a synthetic DB."""
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
seed_copy = {
    "__tags__": {
        "视频模型": {"zhCN": "视频模型", "zhTW": "影片模型", "en": "Video", "fr": "Vidéo", "ru": "Видео", "ja": "動画", "vi": "Video"}
    },
    "keyo-tts": {"description": "x"},
    "grok-4.7": {"description": "y"},
}
for p in ("config/marketplace-model-copy.json", "services/creem-moderation-proxy/marketplace-model-copy.json"):
    json.dump(seed_copy, open(os.path.join(copy_base, p), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(os.path.join(copy_base, p), "a", encoding="utf-8").write("\n")

c = sqlite3.connect(db)
cur = c.cursor()
cur.executescript("""
CREATE TABLE models (id INTEGER PRIMARY KEY, model_name TEXT, tags TEXT, status INTEGER);
""")
for i, mid in enumerate(
    ["keyo-super-resolution-1080p", "keyo-super-resolution-2k", "keyo-super-resolution-4k",
     "keyo-video-subtitle-removal", "grok-video-1.5", "keyo-tts"], start=1
):
    tag = "视频模型" if i <= 5 else "语音合成"
    cur.execute("INSERT INTO models(id, model_name, tags, status) VALUES (?,?,?,1)", (i, mid, tag))
c.commit()
c.close()

for run in ("first", "second"):
    r = subprocess.run(
        [sys.executable, "scripts/vps-tag-video-processing.py", db, copy_base],
        capture_output=True, text=True,
    )
    print("=== %s run ===" % run)
    print(r.stdout.strip())
    if r.returncode != 0:
        print("STDERR:", r.stderr)
        sys.exit(1)

c = sqlite3.connect(db)
cur = c.cursor()
rows = dict(cur.execute("SELECT model_name, tags FROM models").fetchall())
print("tags:", rows)
for mid in ("keyo-super-resolution-1080p", "keyo-super-resolution-2k", "keyo-super-resolution-4k", "keyo-video-subtitle-removal"):
    assert rows[mid] == "视频处理", (mid, rows[mid])
assert rows["grok-video-1.5"] == "视频模型", rows  # untouched
assert rows["keyo-tts"] == "语音合成", rows  # untouched
c.close()

a = open(os.path.join(copy_base, "config/marketplace-model-copy.json"), encoding="utf-8").read()
b = open(os.path.join(copy_base, "services/creem-moderation-proxy/marketplace-model-copy.json"), encoding="utf-8").read()
assert a == b, "copies diverged"
d = json.loads(a)
assert d["__tags__"]["视频处理"]["en"] == "Video Processing", d["__tags__"]
assert d["__tags__"]["视频模型"]["zhCN"] == "视频模型", "existing tag entry lost"
assert d["keyo-tts"] == {"description": "x"}, "model entry lost"
print("copies ok, byte-identical:", True)
print("DRY_RUN_TAG_VIDEO_PROCESSING_OK")