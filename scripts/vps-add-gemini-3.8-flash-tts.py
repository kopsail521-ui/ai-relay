#!/usr/bin/env python3
"""List OpenLux model gemini-3.8-flash-tts on Keyo at cost x 2.

Token-billed TTS on Keyo Primary. Upstream serves it ONLY via OpenAI-compatible
chat completions with modalities=["text","audio"] (POST /v1/audio/speech is
rejected upstream with protocol_unsupported). Audio comes back inline in the
chat response; usage bills audio output as completion tokens.

Upstream site display (account group Aistudio-Gemini-3, 2026-10-10):
  cost_in 0.2206 / cost_out 4.4120 per 1M (completion x20).
Sell = cost x 2 -> 0.4412 / 8.824. ModelRatio=sell_in/2=0.2206, CompletionRatio=20.
Public copy must NOT mention the supplier.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

MODEL = "gemini-3.8-flash-tts"
ABILITY_SRC = "gemini-3.1-flash-tts-preview"

MARKUP = 2.0
COST_IN, COST_OUT = 0.2206, 4.4120
SELL_IN = round(COST_IN * MARKUP, 6)   # 0.4412
SELL_OUT = round(COST_OUT * MARKUP, 6)  # 8.824
RATIO = round(SELL_IN / 2.0, 6)         # 0.2206
COMP = round(SELL_OUT / SELL_IN, 6)     # 20

TAG = "语音合成"
VENDOR = "Google"
ICON = "Gemini.Color"
ENDPOINTS = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
DESC = "Gemini 3.8 Flash TTS · 低延迟可控语音合成"

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


COPY = {
    MODEL: copy_token(
        "Gemini 3.8 Flash TTS：低延迟可控语音合成，适合产品旁白与语音助手。",
        "Gemini 3.8 Flash TTS — low-latency controllable speech for product voice and assistants.",
        zhTW="Gemini 3.8 Flash TTS：低延遲可控語音合成，適合產品旁白與語音助手。",
        ja="Gemini 3.8 Flash TTS。低遅延で制御可能な音声合成。",
        vi="Gemini 3.8 Flash TTS — TTS độ trễ thấp, kiểm soát được.",
    ),
}


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def get_opt(cur, key):
    cur.execute("SELECT value FROM options WHERE key=?", (key,))
    row = cur.fetchone()
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
    fields = ["name"]
    values = [name]
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
        "INSERT INTO vendors(%s) VALUES (%s)"
        % (",".join(fields), ",".join(["?"] * len(fields))),
        values,
    )
    print("vendor created", name)
    return cur.lastrowid


def upsert_model(cur, m_cols, mid, desc, icon, tags, vid, endpoints, now):
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (mid,),
        )
    mrow = cur.execute("SELECT id FROM models WHERE model_name=?", (mid,)).fetchone()
    if mrow is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [mid, desc, icon, tags, vid, endpoints]
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
            "INSERT INTO models(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        print("marketplace created", mid)
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
        vals = [desc, icon, tags, vid, endpoints]
        if "status" in m_cols:
            sets.append("status=1")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(mrow[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", mid)


def find_primary(cur, ch_cols):
    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    rows = cur.execute(sql).fetchall()
    for cid, name, models, base in rows:
        if (name or "") == "Keyo Primary":
            return cid, name, models or ""
    for cid, name, models, base in rows:
        blob = ((name or "") + " " + (base or "")).lower()
        if "openlux" in blob:
            return cid, name, models or ""
    for cid, name, models, base in rows:
        ms = [x.strip() for x in (models or "").split(",") if x.strip()]
        if ABILITY_SRC in ms or "gemini-3.8-flash" in ms:
            return cid, name, models or ""
    raise SystemExit("Keyo Primary not found")


def add_model_to_channel(cur, ch_cols, cid, cname, models_s, mid, now):
    parts = [p.strip() for p in (models_s or "").replace("\n", ",").split(",") if p.strip()]
    if mid not in parts:
        parts.insert(0, mid)
        added = [mid]
    else:
        added = []
    merged = ",".join(parts)
    sets = ["models=?"]
    vals = [merged]
    if "updated_time" in ch_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(cid)
    cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print("channel", cid, cname, "add", added or "(already)")


def set_abilities(cur, tabs, mid, cid, src):
    if "abilities" not in tabs:
        return
    cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
    rows = []
    if src:
        rows = cur.execute(
            'SELECT "group", enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (src,),
        ).fetchall()
    if rows:
        for g, en, pri, w in rows:
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                (g, mid, cid, en, pri, w),
            )
        print("abilities copied", mid, "from", src, len(rows))
    else:
        cur.execute(
            'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
            ("default", mid, cid, 1, 0, 1),
        )
        print("abilities default", mid, cid)


def merge_copy(path):
    if not os.path.exists(path):
        print("copy_skip", path)
        return
    data = json.load(open(path, encoding="utf-8"))
    for mid, copy in COPY.items():
        data[mid] = {k: v for k, v in copy.items() if not k.startswith("_")}
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(path, "a", encoding="utf-8").write("\n")
    print("copy_merged", path)


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    pcid, pname, pmodels = find_primary(cur, ch_cols)
    print("primary", pcid, pname)
    add_model_to_channel(cur, ch_cols, pcid, pname, pmodels, MODEL, now)

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    mr[MODEL] = RATIO
    cr[MODEL] = COMP
    mp.pop(MODEL, None)
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing token", MODEL, SELL_IN, "/", SELL_OUT, "ratio", RATIO, "comp", COMP)

    vid = ensure_vendor(cur, v_cols, VENDOR, ICON, now)
    upsert_model(cur, m_cols, MODEL, DESC, ICON, TAG, vid, ENDPOINTS, now)
    set_abilities(cur, tabs, MODEL, pcid, ABILITY_SRC)

    conn.commit()
    conn.close()

    merge_copy("/opt/ai-relay/config/marketplace-model-copy.json")
    merge_copy("/opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json")
    print("SELL_IN_USD", SELL_IN)
    print("SELL_OUT_USD", SELL_OUT)
    print("DONE_ADD_GEMINI_3_8_FLASH_TTS")


if __name__ == "__main__":
    main()