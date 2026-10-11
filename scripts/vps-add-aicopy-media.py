#!/usr/bin/env python3
"""List 9 aicopy media SKUs on Keyo at cost x 2 (CNY model_price / FX 7.3).

Rides the existing "Keyo Video" channel (https://api.aicopy.top); merges the
model list and model_mapping (existing grok entry preserved). Public IDs
follow the keyo-* convention (keyo-flash2 style); 小裴/豆姐/aicopy must never
appear in any public surface.

  keyo-super-resolution-1080p / 2k / 4k   openai-video (/v1/videos)  视频模型
  keyo-video-subtitle-removal             openai-video (/v1/videos)  视频模型
  grok-image-2.0                          openai chat                图片 (xAI)
  keyo-voice-clone / keyo-tts             openai chat                语音合成
  keyo-song                               openai chat                音乐
  keyo-asr                                openai chat                语音识别

Sell = CNY model_price x 2 / 7.3 (ModelPrice, per-request billing).
Idempotent. Base dir for marketplace copies: argv[2] or /opt/ai-relay.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

MARKUP = 2.0
FX = 7.3
CHANNEL_NAME = "Keyo Video"
BASE_URL = "https://api.aicopy.top"

EP_VIDEO = json.dumps({"openai-video": "/v1/videos"}, separators=(",", ":"))
EP_CHAT = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))

TOKEN_BADGE = {
    "zhCN": "按次计费",  # per-request SKUs use the request badge
    "zhTW": "按次計費",
    "en": "Per Request",
    "fr": "Par requête",
    "ru": "За запрос",
    "ja": "リクエスト課金",
    "vi": "Theo lần gọi",
}
REQ_BADGE = TOKEN_BADGE
EMPTY7 = {k: "" for k in ["zhCN", "zhTW", "en", "fr", "ru", "ja", "vi"]}


def sell(cny):
    return round(cny * MARKUP / FX, 6)


def price_tag(usd):
    return "$%.4f/次" % usd


def copy_request(zh, en):
    d = {"zhCN": zh, "zhTW": zh, "en": en, "fr": en, "ru": en, "ja": en, "vi": en}
    return {
        "description": zh,
        "descriptions": d,
        "unit": "request",
        "badge": REQ_BADGE,
        "suffix": {
            "zhCN": "/次", "zhTW": "/次", "en": "/ request", "fr": "/ requête",
            "ru": "/ запрос", "ja": "/ 回", "vi": "/ lần",
        },
        "price_key": {
            "zhCN": "每次请求", "zhTW": "每次請求", "en": "Per request",
            "fr": "Par requête", "ru": "За запрос", "ja": "リクエストごと",
            "vi": "Mỗi lần gọi",
        },
        "description_zh": zh,
        "description_en": en,
        "badge_zh": "按次计费",
        "badge_en": "Per Request",
        "suffix_zh": "/次",
        "suffix_en": "/ request",
        "price_key_zh": "每次请求",
        "price_key_en": "Per request",
    }


def M(pid, up, cny, tag, vendor, icon, ep, zh, en):
    return {
        "id": pid, "up": up, "cny": cny, "sell": sell(cny), "tag": tag,
        "vendor": vendor, "icon": icon, "ep": ep, "zh": zh, "en": en,
    }


MODELS = [
    M("keyo-super-resolution-1080p", "小裴-大模型超分-1080分辨率", 0.2, "视频模型", "Keyo", "Custom",
      EP_VIDEO,
      "Keyo 大模型视频超分：AI 视频超分至 1080P。",
      "Keyo video super-resolution up to 1080P."),
    M("keyo-super-resolution-2k", "小裴-大模型超分-2k分辨率", 0.4, "视频模型", "Keyo", "Custom",
      EP_VIDEO,
      "Keyo 大模型视频超分：AI 视频超分至 2K。",
      "Keyo video super-resolution up to 2K."),
    M("keyo-super-resolution-4k", "小裴-大模型超分-4k分辨率", 0.8, "视频模型", "Keyo", "Custom",
      EP_VIDEO,
      "Keyo 大模型视频超分：AI 视频超分至 4K。",
      "Keyo video super-resolution up to 4K."),
    M("keyo-video-subtitle-removal", "小裴-视频去字幕", 0.05, "视频模型", "Keyo", "Custom",
      EP_VIDEO,
      "Keyo 视频去字幕：AI 智能去除视频内嵌字幕。",
      "Keyo AI subtitle removal for videos."),
    M("grok-image-2.0", "grok-图片-2.0", 0.01, "图片", "xAI", "XAI",
      EP_CHAT,
      "xAI Grok Image 2.0：图片生成。",
      "xAI Grok Image 2.0 — image generation."),
    M("keyo-voice-clone", "【豆姐】音色复刻", 0.05, "语音合成", "Keyo", "Custom",
      EP_CHAT,
      "Keyo 音色复刻：用音频样本克隆专属音色。",
      "Keyo voice cloning from audio samples."),
    M("keyo-tts", "【豆姐】文字转语音", 0.05, "语音合成", "Keyo", "Custom",
      EP_CHAT,
      "Keyo 文字转语音：文本转高质量语音。",
      "Keyo text-to-speech."),
    M("keyo-song", "【豆姐】音频生成（歌曲生成）", 0.05, "音乐", "Keyo", "Custom",
      EP_CHAT,
      "Keyo 歌曲生成：从文字创作完整歌曲。",
      "Keyo song generation from text."),
    M("keyo-asr", "【豆姐】语音转文字", 0.05, "语音识别", "Keyo", "Custom",
      EP_CHAT,
      "Keyo 语音转文字：音频精准转写。",
      "Keyo speech-to-text transcription."),
]


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def read_key():
    k = os.environ.get("AICOPY_API_KEY", "").strip()
    if k:
        return k
    for p in ("/opt/ai-relay/.env",):
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8", errors="ignore"):
            line = line.strip()
            if line.startswith("AICOPY_API_KEY=") and len(line) > 18:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def get_opt(cur, key):
    row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    return row[0] if row else "{}"


def put_opt(cur, key, value):
    if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))


def ensure_vendor(cur, v_cols, name, icon, now):
    row = cur.execute("SELECT id FROM vendors WHERE name=?", (name,)).fetchone()
    if row:
        return row[0]
    fields, values = ["name"], [name]
    if "icon" in v_cols:
        fields.append("icon")
        values.append(icon)
    if "status" in v_cols:
        fields.append("status")
        values.append(1)
    if "created_time" in v_cols:
        fields.append("created_time")
        values.append(now)
    cur.execute(
        "INSERT INTO vendors(%s) VALUES (%s)" % (",".join(fields), ",".join(["?"] * len(fields))),
        values,
    )
    print("vendor created", name)
    return cur.lastrowid


def find_channel(cur, ch_cols):
    sql = "SELECT id, name, models, model_mapping, base_url, `key` FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    for cid, name, models, mapping, base, key in cur.execute(sql).fetchall():
        if (name or "") == CHANNEL_NAME or "aicopy" in (base or "").lower():
            return cid, name, models or "", mapping or "", base or "", key or ""
    return None


def merge_channel(cur, ch_cols, cid, name, models, mapping, base, key, now):
    parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
    added = [m["id"] for m in MODELS if m["id"] not in parts]
    merged_models = ",".join(parts + added)

    try:
        mapping_data = json.loads(mapping) if mapping else {}
    except Exception:
        mapping_data = {}
    mapping_added = [m["id"] for m in MODELS if m["id"] not in mapping_data]
    for m in MODELS:
        mapping_data[m["id"]] = m["up"]

    sets, vals = ["models=?"], [merged_models]
    if "model_mapping" in ch_cols:
        sets.append("model_mapping=?")
        vals.append(json.dumps(mapping_data, ensure_ascii=False, separators=(",", ":")))
    if key:
        if "key" in ch_cols:
            sets.append("`key`=?")
            vals.append(key)
        if "base_url" in ch_cols:
            sets.append("base_url=?")
            vals.append(BASE_URL)
    if "status" in ch_cols:
        sets.append("status=1")
    if "updated_time" in ch_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(cid)
    cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print("channel", cid, name, "models added", added or "(none)", "mapping added", mapping_added or "(none)")


def create_channel(cur, ch_cols, key, now):
    mapping = {m["id"]: m["up"] for m in MODELS}
    spec = {
        "type": 1,
        "key": key,
        "name": CHANNEL_NAME,
        "base_url": BASE_URL,
        "models": ",".join(m["id"] for m in MODELS),
        "group": "default",
        "status": 1,
    }
    fields, values = [], []
    for col, val in spec.items():
        if col in ch_cols:
            fields.append('"group"' if col == "group" else col)
            values.append(val)
    if "model_mapping" in ch_cols:
        fields.append("model_mapping")
        values.append(json.dumps(mapping, ensure_ascii=False, separators=(",", ":")))
    if "created_time" in ch_cols:
        fields.append("created_time")
        values.append(now)
    if "updated_time" in ch_cols:
        fields.append("updated_time")
        values.append(now)
    cur.execute(
        "INSERT INTO channels(%s) VALUES (%s)" % (",".join(fields), ",".join(["?"] * len(fields))),
        values,
    )
    cid = cur.lastrowid
    print("channel created", cid, CHANNEL_NAME)
    return cid


def upsert_model(cur, m_cols, m, vid, now):
    desc = "%s 计费：%s。" % (m["zh"], price_tag(m["sell"]))
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (m["id"],),
        )
    row = cur.execute("SELECT id FROM models WHERE model_name=?", (m["id"],)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [m["id"], desc, m["icon"], m["tag"], vid, m["ep"]]
        if "status" in m_cols:
            fields.append("status")
            values.append(1)
        if "sync_official" in m_cols:
            fields.append("sync_official")
            values.append(0)
        if "created_time" in m_cols:
            fields.append("created_time")
            values.append(now)
        if "updated_time" in m_cols:
            fields.append("updated_time")
            values.append(now)
        cur.execute(
            "INSERT INTO models(%s) VALUES (%s)" % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        print("marketplace created", m["id"])
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
        vals = [desc, m["icon"], m["tag"], vid, m["ep"]]
        if "status" in m_cols:
            sets.append("status=1")
        if "sync_official" in m_cols:
            sets.append("sync_official=0")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", m["id"])


def merge_copy(path):
    if not os.path.exists(path):
        print("copy_skip", path)
        return
    data = json.load(open(path, encoding="utf-8"))
    for m in MODELS:
        data[m["id"]] = copy_request(m["zh"], m["en"])
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(path, "a", encoding="utf-8").write("\n")
    print("copy_merged", path)


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    base = sys.argv[2] if len(sys.argv) > 2 else "/opt/ai-relay"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    key = read_key()
    ch = find_channel(cur, ch_cols)
    if ch is None:
        if not key.startswith("sk-"):
            raise SystemExit("set AICOPY_API_KEY in /opt/ai-relay/.env first")
        cid = create_channel(cur, ch_cols, key, now)
    else:
        cid, cname, models, mapping, cbase, ckey = ch
        merge_channel(cur, ch_cols, cid, cname, models, mapping, cbase, key or (ckey if ckey.startswith("sk-") else ""), now)
        if not key:
            print("key: keeping existing channel key")

    vids = {}
    for m in MODELS:
        if m["vendor"] not in vids:
            vids[m["vendor"]] = ensure_vendor(cur, v_cols, m["vendor"], m["icon"], now)
        upsert_model(cur, m_cols, m, vids[m["vendor"]], now)
        if "abilities" in tabs:
            cur.execute("DELETE FROM abilities WHERE model=?", (m["id"],))
            cur.execute(
                'INSERT INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                ("default", m["id"], cid, 1, 0, 1),
            )
    print("abilities default -> channel", cid, "x", len(MODELS))

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    for m in MODELS:
        mr.pop(m["id"], None)
        cr.pop(m["id"], None)
        mp[m["id"]] = m["sell"]
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    for m in MODELS:
        print("price", m["id"], "= $%s / request (CNY %s x2 / %s)" % (m["sell"], m["cny"], FX))

    conn.commit()
    conn.close()

    merge_copy(os.path.join(base, "config/marketplace-model-copy.json"))
    merge_copy(os.path.join(base, "services/creem-moderation-proxy/marketplace-model-copy.json"))
    print("DONE_ADD_AICOPY_MEDIA")


if __name__ == "__main__":
    main()