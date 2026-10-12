#!/usr/bin/env python3
"""List OpenRouter TTS models elevenlabs/eleven-v4 & eleven-v4-turbo on Keyo at cost x 2.

New "Keyo TTS" channel (type 1) pointing at https://openrouter.ai/api.
Public IDs keyo-eleven-v4 / keyo-eleven-v4-turbo. Upstream bills per character
via POST /v1/audio/speech: v4 = $40/M chars, v4-turbo = $20/M chars (verified
by live billing probe 2026-10-12). Sell = cost x 2 -> v4 $80/M, turbo $40/M.

new-api audio quota = (input_text_tokens + output_text_tokens*completion_ratio
+ input_audio_tokens*audio_ratio + output_audio_tokens*audio_ratio*
audio_completion_ratio) * group_ratio * model_ratio. To land on exactly 2x we
charge ONLY input characters: ModelRatio=40 (v4) / 20 (turbo) and force
CompletionRatio=AudioRatio=AudioCompletionRatio=0, quota_type=0 (token-based).
ModelPrice is removed so the public pricing API shows ratio pricing, not a
per-request price.

Public copy must NOT mention OpenRouter or any supplier/reseller.
Idempotent. Base dir for marketplace copies: argv[2] or /opt/ai-relay.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

MARKUP = 2.0
CHANNEL_NAME = "Keyo TTS"
BASE_URL = "https://openrouter.ai/api"
ENDPOINTS = json.dumps({"openai-audio": "/v1/audio/speech"}, separators=(",", ":"))

TOKEN_BADGE = {
    "zhCN": "按 Token 计费",
    "zhTW": "按 Token 計費",
    "en": "Token-based",
    "fr": "Au token",
    "ru": "По токенам",
    "ja": "Token 課金",
    "vi": "Theo token",
}
EMPTY7 = {k: "" for k in ["zhCN", "zhTW", "en", "fr", "ru", "ja", "vi"]}


def copy_token(zh, en, **langs):
    d = {
        "zhCN": zh,
        "zhTW": langs.get("zhTW", zh),
        "en": en,
        "fr": langs.get("fr", en),
        "ru": langs.get("ru", en),
        "ja": langs.get("ja", en),
        "vi": langs.get("vi", en),
    }
    return {
        "description": zh,
        "descriptions": d,
        "unit": "token",
        "badge": TOKEN_BADGE,
        "suffix": dict(EMPTY7),
        "price_key": dict(EMPTY7),
        "description_zh": zh,
        "description_en": en,
        "badge_zh": TOKEN_BADGE["zhCN"],
        "badge_en": TOKEN_BADGE["en"],
        "suffix_zh": "",
        "suffix_en": "",
        "price_key_zh": "",
        "price_key_en": "",
    }


def T(pid, up, cost, tag, vendor, icon, zh, en):
    return {
        "id": pid,
        "up": up,
        "cost": cost,
        "sell": round(cost * MARKUP, 6),
        "ratio": round(cost * MARKUP / 2.0, 6),
        "tag": tag,
        "vendor": vendor,
        "icon": icon,
        "zh": zh,
        "en": en,
    }


MODELS = [
    T("keyo-eleven-v4", "elevenlabs/eleven-v4", 40, "语音合成", "ElevenLabs", "Custom",
      "Keyo Eleven V4：高保真 AI 语音合成，自然表达与角色演绎。",
      "Keyo Eleven V4 — high-fidelity AI speech for natural voiceovers."),
    T("keyo-eleven-v4-turbo", "elevenlabs/eleven-v4-turbo", 20, "语音合成", "ElevenLabs", "Custom",
      "Keyo Eleven V4 Turbo：更快的 AI 语音合成，低延迟实时场景。",
      "Keyo Eleven V4 Turbo — faster AI speech for real-time use."),
]

COPY = {
    "keyo-eleven-v4": copy_token(
        "Keyo Eleven V4：高保真 AI 语音合成，自然表达、角色演绎。按输入字符计费：$80 / 百万字符，输出音频不另收费。",
        "Keyo Eleven V4 — high-fidelity AI speech. $80 per million input characters; no additional audio output charge.",
        zhTW="Keyo Eleven V4：高保真 AI 語音合成。按輸入字元計費：$80 / 百萬字元，輸出音訊不另收費。",
        ja="Keyo Eleven V4。高忠実度の AI 音声合成。入力100万文字あたり$80、音声出力の追加料金なし。",
        vi="Keyo Eleven V4 — giọng nói AI trung thực cao. $80 / triệu ký tự đầu vào; không tính thêm phí âm thanh đầu ra.",
    ),
    "keyo-eleven-v4-turbo": copy_token(
        "Keyo Eleven V4 Turbo：快速 AI 语音合成，适合实时交互。按输入字符计费：$40 / 百万字符，输出音频不另收费。",
        "Keyo Eleven V4 Turbo — fast AI speech. $40 per million input characters; no additional audio output charge.",
        zhTW="Keyo Eleven V4 Turbo：快速 AI 語音合成。按輸入字元計費：$40 / 百萬字元，輸出音訊不另收費。",
        ja="Keyo Eleven V4 Turbo。低遅延の高速 AI 音声合成。入力100万文字あたり$40、音声出力の追加料金なし。",
        vi="Keyo Eleven V4 Turbo — TTS nhanh. $40 / triệu ký tự đầu vào; không tính thêm phí âm thanh đầu ra.",
    ),
}


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def read_key():
    k = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if k:
        return k
    for p in ("/opt/ai-relay/.env",):
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8", errors="ignore"):
            line = line.strip()
            if line.startswith("OPENROUTER_API_KEY=") and len(line) > 18:
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
    matches = [r for r in cur.execute(sql).fetchall() if r[1] == CHANNEL_NAME]
    if len(matches) > 1:
        raise SystemExit("Multiple Keyo TTS channels found; select the intended channel first")
    if matches:
        cid, name, models, mapping, base, key = matches[0]
        channel_type = cur.execute("SELECT type FROM channels WHERE id=?", (cid,)).fetchone()[0]
        if channel_type != 1 or (base or "").rstrip("/") != BASE_URL:
            raise SystemExit("Keyo TTS already belongs to another endpoint; refusing to overwrite it")
        return cid, name, models or "", mapping or "", base or "", key or ""
    return None


def merge_channel(cur, ch_cols, cid, name, models, mapping, base, key, now):
    parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
    added = [m["id"] for m in MODELS if m["id"] not in parts]
    merged_models = ",".join(parts + added)

    mapping_data = json.loads(mapping) if mapping else {}
    if not isinstance(mapping_data, dict):
        raise SystemExit("Existing model mapping is invalid; refusing to overwrite it")
    mapping_added = [m["id"] for m in MODELS if m["id"] not in mapping_data]
    for m in MODELS:
        mapping_data[m["id"]] = m["up"]

    groups = cur.execute('SELECT "group" FROM channels WHERE id=?', (cid,)).fetchone()[0] or ""
    groups = [g.strip() for g in groups.split(",") if g.strip()]
    if "default" not in groups:
        groups.append("default")
    sets, vals = ["models=?", '"group"=?'], [merged_models, ",".join(groups)]
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
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (m["id"],),
        )
    row = cur.execute("SELECT id FROM models WHERE model_name=?", (m["id"],)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [m["id"], m["zh"], m["icon"], m["tag"], vid, ENDPOINTS]
        if "status" in m_cols:
            fields.append("status")
            values.append(1)
        if "sync_official" in m_cols:
            fields.append("sync_official")
            values.append(0)
        if "quota_type" in m_cols:
            fields.append("quota_type")
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
        vals = [m["zh"], m["icon"], m["tag"], vid, ENDPOINTS]
        if "status" in m_cols:
            sets.append("status=1")
        if "sync_official" in m_cols:
            sets.append("sync_official=0")
        if "quota_type" in m_cols:
            sets.append("quota_type=0")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", m["id"])


def prepare_copy(base):
    paths = [os.path.join(base, p) for p in (
        "config/marketplace-model-copy.json",
        "services/creem-moderation-proxy/marketplace-model-copy.json",
    )]
    for path in paths:
        if not os.path.isfile(path):
            raise SystemExit("Marketplace copy not found: " + path)
    with open(paths[0], encoding="utf-8") as f:
        data = json.load(f)
    with open(paths[1], encoding="utf-8") as f:
        existing = json.load(f)
    if existing != data:
        print("copy drift detected; synchronizing services from config")
    data.update(COPY)
    payload = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return paths, payload


def write_copies(paths, payload):
    for path in paths:
        tmp = path + ".eleven.tmp"
        with open(tmp, "wb") as f:
            f.write(payload)
        os.replace(tmp, path)
        print("copy_merged", path)


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    base = sys.argv[2] if len(sys.argv) > 2 else "/opt/ai-relay"
    copy_paths, copy_payload = prepare_copy(base)
    conn = sqlite3.connect(db_path, timeout=30)
    backup_path = db_path + ".eleven-" + str(time.time_ns()) + ".bak"
    with sqlite3.connect(backup_path) as backup:
        conn.backup(backup)
    os.chmod(backup_path, 0o600)
    print("database backup", backup_path)
    conn.execute("BEGIN IMMEDIATE")
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    groups = json.loads(get_opt(cur, "GroupRatio") or "{}")
    if groups.get("default", 1) != 1:
        raise SystemExit("default group ratio must be 1 for the listed prices; no changes applied")

    key = read_key()
    ch = find_channel(cur, ch_cols)
    if ch is None:
        if not key.startswith("sk-"):
            raise SystemExit("set OPENROUTER_API_KEY in /opt/ai-relay/.env first")
        cid = create_channel(cur, ch_cols, key, now)
    else:
        cid, cname, models, mapping, cbase, ckey = ch
        effective_key = key or ckey
        if not effective_key.startswith("sk-"):
            raise SystemExit("No valid key found for Keyo TTS")
        merge_channel(cur, ch_cols, cid, cname, models, mapping, cbase, effective_key, now)
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
    ar = json.loads(get_opt(cur, "AudioRatio") or "{}")
    acr = json.loads(get_opt(cur, "AudioCompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    for m in MODELS:
        mr[m["id"]] = m["ratio"]
        cr[m["id"]] = 0
        ar[m["id"]] = 0
        acr[m["id"]] = 0
        mp.pop(m["id"], None)
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "AudioRatio", json.dumps(ar, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "AudioCompletionRatio", json.dumps(acr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    for m in MODELS:
        print("price", m["id"], "= $%s / 1M chars (cost $%s/M x2, ratio %s)" % (m["sell"], m["cost"], m["ratio"]))

    conn.commit()
    conn.close()

    write_copies(copy_paths, copy_payload)
    print("DONE_ADD_OPENROUTER_ELEVEN")


if __name__ == "__main__":
    main()