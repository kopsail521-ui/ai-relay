#!/usr/bin/env python3
"""Move the 4 aicopy video SKUs to the new 视频处理 tag.

- models.tags -> 视频处理 for the 4 SKUs (no other model touched)
- marketplace copy (both files): add __tags__["视频处理"] i18n entry
Idempotent. Copy base dir: argv[2] or /opt/ai-relay.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys

TAG = "视频处理"
MODELS = [
    "keyo-super-resolution-1080p",
    "keyo-super-resolution-2k",
    "keyo-super-resolution-4k",
    "keyo-video-subtitle-removal",
]
TAG_I18N = {
    "zhCN": "视频处理",
    "zhTW": "影片處理",
    "en": "Video Processing",
    "fr": "Traitement vidéo",
    "ru": "Обработка видео",
    "ja": "動画処理",
    "vi": "Xử lý video",
}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    base = sys.argv[2] if len(sys.argv) > 2 else "/opt/ai-relay"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    for mid in MODELS:
        cur.execute("UPDATE models SET tags=? WHERE model_name=?", (TAG, mid))
        print("retag", mid, "rows", cur.rowcount)
    conn.commit()
    conn.close()

    rel = "services/creem-moderation-proxy/marketplace-model-copy.json"
    for path in (os.path.join(base, "config/marketplace-model-copy.json"), os.path.join(base, rel)):
        if not os.path.exists(path):
            print("copy_skip", path)
            continue
        data = json.load(open(path, encoding="utf-8"))
        tags = data.get("__tags__")
        if not isinstance(tags, dict):
            tags = {}
            data["__tags__"] = tags
        tags[TAG] = TAG_I18N
        json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        open(path, "a", encoding="utf-8").write("\n")
        print("tags_i18n_merged", path)
    print("DONE_TAG_VIDEO_PROCESSING")


if __name__ == "__main__":
    main()