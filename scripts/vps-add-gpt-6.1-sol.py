#!/usr/bin/env python3
"""List gpt-6.1-sol on Keyo Primary (OpenLux). Sell = cost × 1.

Cost from cheapest OpenLux group (Codex-Gpt-1):
  $0.07354 / $0.3677 per 1M in/out
Sell = cost → ModelRatio = 0.03677 · CompletionRatio = 5
Public copy must NOT mention the supplier.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

MODEL = "gpt-6.1-sol"
COST_IN = 0.07354
COST_OUT = 0.3677
MARKUP = 1.0
SELL_IN = round(COST_IN * MARKUP, 6)
SELL_OUT = round(COST_OUT * MARKUP, 6)
OUR_MODEL_RATIO = round(SELL_IN / 2.0, 6)
OUR_COMPLETION_RATIO = round(SELL_OUT / SELL_IN, 6) if SELL_IN else 5.0
TAG = "大语言模型"
VENDOR = "OpenAI"
ICON = "OpenAI"
ENDPOINTS = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
DESC = "GPT-6.1 Sol 对话与推理，Sol 线更新档。"
ABILITY_SRC = "gpt-6-sol"

COPY = {
    "description": DESC,
    "descriptions": {
        "zhCN": DESC,
        "zhTW": "GPT-6.1 Sol 對話與推理，Sol 線更新檔。",
        "en": "GPT-6.1 Sol chat and reasoning — updated Sol-tier lane.",
        "fr": "GPT-6.1 Sol chat and reasoning — updated Sol-tier lane.",
        "ru": "GPT-6.1 Sol chat and reasoning — updated Sol-tier lane.",
        "ja": "GPT-6.1 Sol 対話と推論。Sol ラインの更新版。",
        "vi": "GPT-6.1 Sol chat/suy luận — bản Sol mới.",
    },
    "unit": "token",
    "badge": {
        "zhCN": "按 Token 计费",
        "zhTW": "按 Token 計費",
        "en": "Token-based",
        "fr": "Au token",
        "ru": "По токенам",
        "ja": "Token 課金",
        "vi": "Theo token",
    },
    "suffix": {
        "zhCN": "",
        "zhTW": "",
        "en": "",
        "fr": "",
        "ru": "",
        "ja": "",
        "vi": "",
    },
    "price_key": {
        "zhCN": "",
        "zhTW": "",
        "en": "",
        "fr": "",
        "ru": "",
        "ja": "",
        "vi": "",
    },
    "description_zh": DESC,
    "description_en": "GPT-6.1 Sol chat and reasoning — updated Sol-tier lane.",
    "badge_zh": "按 Token 计费",
    "badge_en": "Token-based",
    "suffix_zh": "",
    "suffix_en": "",
    "price_key_zh": "",
    "price_key_en": "",
}


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def merge_copy(path):
    if not os.path.exists(path):
        print("copy_skip", path)
        return
    data = json.load(open(path, encoding="utf-8"))
    data[MODEL] = COPY
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(path, "a", encoding="utf-8").write("\n")
    print("copy_merged", path)


def patch_docs(path):
    if not os.path.exists(path):
        print("docs_skip", path)
        return
    html = open(path, encoding="utf-8", errors="ignore").read()
    if 'data-copy="gpt-6.1-sol"' in html:
        print("docs_has", MODEL)
        return
    needle = '<tr><td class="model"><button type="button" class="model-btn" data-copy="gpt-6-sol">gpt-6-sol</button></td><td class="price">~$0.37</td><td class="price">~$1.84</td><td class="note-cell">GPT-6 Sol</td></tr>'
    row = '<tr><td class="model"><button type="button" class="model-btn" data-copy="gpt-6.1-sol">gpt-6.1-sol</button></td><td class="price">~$0.07</td><td class="price">~$0.37</td><td class="note-cell">GPT-6.1 Sol</td></tr>'
    if needle in html:
        html = html.replace(needle, needle + "\n" + row, 1)
        open(path, "w", encoding="utf-8").write(html)
        print("docs_row", MODEL)
    else:
        print("docs_needle_miss")


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    channels = cur.fetchall()

    target = None
    for cid, name, models, base in channels:
        if (name or "") == "Keyo Primary":
            target = (cid, name, models or "")
            break
    if target is None:
        for cid, name, models, base in channels:
            blob = ((name or "") + " " + (base or "")).lower()
            if "openlux" in blob:
                target = (cid, name, models or "")
                break
    if target is None:
        for cid, name, models, base in channels:
            ms = [x.strip() for x in (models or "").split(",") if x.strip()]
            if ABILITY_SRC in ms or "gpt-6-astra" in ms:
                target = (cid, name, models or "")
                break
    if target is None:
        raise SystemExit("Keyo Primary / OpenLux channel not found")

    cid, cname, models = target
    new_name = cname
    low = (cname or "").lower()
    if "openlux" in low or "上游" in (cname or "") or "gitee" in low:
        new_name = "Keyo Primary"
    parts = [p.strip() for p in models.split(",") if p.strip()]
    if MODEL not in parts:
        parts.insert(0, MODEL)
        print("channel_add", MODEL)
    else:
        print("channel_has", MODEL)
    merged = ",".join(parts)
    if "updated_time" in ch_cols:
        cur.execute(
            "UPDATE channels SET models=?, name=?, updated_time=? WHERE id=?",
            (merged, new_name, now, cid),
        )
    else:
        cur.execute(
            "UPDATE channels SET models=?, name=? WHERE id=?",
            (merged, new_name, cid),
        )
    print("channel", cid, new_name)

    def get_opt(key):
        row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
        return row[0] if row else "{}"

    def put_opt(key, value):
        if cur.execute("SELECT key FROM options WHERE key=?", (key,)).fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))

    mr = json.loads(get_opt("ModelRatio") or "{}")
    cr = json.loads(get_opt("CompletionRatio") or "{}")
    mp = json.loads(get_opt("ModelPrice") or "{}")
    mr[MODEL] = OUR_MODEL_RATIO
    cr[MODEL] = OUR_COMPLETION_RATIO
    mp.pop(MODEL, None)
    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt("CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("price", MODEL, "sell", SELL_IN, "/", SELL_OUT, "ratio", OUR_MODEL_RATIO, "comp", OUR_COMPLETION_RATIO)

    vrow = cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,)).fetchone()
    if vrow is None:
        raise SystemExit("vendor missing: " + VENDOR)
    vid = vrow[0]

    m_cols = cols(cur, "models")
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (MODEL,),
        )
    mrow = cur.execute("SELECT id FROM models WHERE model_name=?", (MODEL,)).fetchone()
    if mrow is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [MODEL, DESC, ICON, TAG, vid, ENDPOINTS]
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
        print("marketplace created", MODEL)
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
        vals = [DESC, ICON, TAG, vid, ENDPOINTS]
        if "status" in m_cols:
            sets.append("status=1")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(mrow[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", MODEL)

    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "abilities" in tabs:
        ab_src = cur.execute(
            'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (ABILITY_SRC,),
        ).fetchall()
        cur.execute("DELETE FROM abilities WHERE model=?", (MODEL,))
        if ab_src:
            for g, _ch, en, pri, w in ab_src:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    (g, MODEL, cid, en, pri, w),
                )
            print("abilities copied from", ABILITY_SRC, len(ab_src))
        else:
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                ("default", MODEL, cid, 1, 0, 1),
            )
            print("abilities default", cid)

    conn.commit()
    conn.close()

    merge_copy("/opt/ai-relay/config/marketplace-model-copy.json")
    merge_copy("/opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json")
    patch_docs("/opt/ai-relay/static/brand/keyo-docs.html")
    print("DONE_ADD_GPT61_SOL")


if __name__ == "__main__":
    main()
