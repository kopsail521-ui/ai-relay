#!/usr/bin/env python3
"""List OpenLux models on Keyo at cost × 2.

  suno_music_open                 times  $0.003922 / request   tag 音乐
  gemini-3.1-flash-tts-preview    token  $0.40 / $8.00 / 1M    tag 语音合成
  gemini-embedding-2-preview      token  $0.176472 / $0.705888 tag rag

TTS + embedding → Keyo Primary (OpenAI).
Suno → Keyo Music channel type 36 with mapping suno_music → suno_music_open.
Public copy must NOT mention the supplier.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

MARKUP = 2.0
SUNO_COST = round(0.026667 * 0.07353, 8)  # 0.00196083
SUNO_SELL = round(SUNO_COST * MARKUP, 6)  # 0.003922
TTS_COST_IN, TTS_COST_OUT = 0.2, 4.0
TTS_SELL_IN = round(TTS_COST_IN * MARKUP, 6)  # 0.4
TTS_SELL_OUT = round(TTS_COST_OUT * MARKUP, 6)  # 8.0
TTS_RATIO = round(TTS_SELL_IN / 2.0, 6)  # 0.2
TTS_COMP = round(TTS_SELL_OUT / TTS_SELL_IN, 6)  # 20
EMB_COST_IN, EMB_COST_OUT = 0.088236, 0.352944
EMB_SELL_IN = round(EMB_COST_IN * MARKUP, 6)  # 0.176472
EMB_SELL_OUT = round(EMB_COST_OUT * MARKUP, 6)  # 0.705888
EMB_RATIO = round(EMB_SELL_IN / 2.0, 6)  # 0.088236
EMB_COMP = round(EMB_SELL_OUT / EMB_SELL_IN, 6)  # 4

EP_TTS = json.dumps({"openai": "/v1/audio/speech"}, separators=(",", ":"))
EP_EMB = json.dumps({"openai": "/v1/embeddings"}, separators=(",", ":"))
EP_SUNO = json.dumps({"suno": "/suno/submit/MUSIC"}, separators=(",", ":"))

TOKEN_BADGE = {
    "zhCN": "按 Token 计费",
    "zhTW": "按 Token 計費",
    "en": "Token-based",
    "fr": "Au token",
    "ru": "По токенам",
    "ja": "Token 課金",
    "vi": "Theo token",
}
REQ_BADGE = {
    "zhCN": "按次计费",
    "zhTW": "按次計費",
    "en": "Per Request",
    "fr": "Par requête",
    "ru": "За запрос",
    "ja": "リクエスト課金",
    "vi": "Theo lần gọi",
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


def copy_request(zh, en, sell, **langs):
    price = "$%.4f/次" % sell
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
        "unit": "request",
        "badge": REQ_BADGE,
        "suffix": {
            "zhCN": "/次",
            "zhTW": "/次",
            "en": "/ request",
            "fr": "/ requête",
            "ru": "/ запрос",
            "ja": "/ 回",
            "vi": "/ lần",
        },
        "price_key": {
            "zhCN": "每次请求",
            "zhTW": "每次請求",
            "en": "Per request",
            "fr": "Par requête",
            "ru": "За запрос",
            "ja": "リクエストごと",
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
        "_price_note": price,
    }


COPIES = {
    "suno_music_open": copy_request(
        "Suno 歌曲生成（自定义 / 灵感 / 续写），按次计费：$%.4f/次。" % SUNO_SELL,
        "Suno song generation (custom, inspiration, continue). Pricing: $%.4f / request." % SUNO_SELL,
        SUNO_SELL,
        zhTW="Suno 歌曲生成（自訂 / 靈感 / 續寫），按次計費：$%.4f/次。" % SUNO_SELL,
        ja="Suno 楽曲生成（カスタム/インスピレーション/続き）。料金：$%.4f/ 回。" % SUNO_SELL,
        vi="Suno tạo bài hát (tuỳ chỉnh / cảm hứng / tiếp nối). Giá: $%.4f/ lần." % SUNO_SELL,
    ),
    "gemini-3.1-flash-tts-preview": copy_token(
        "Gemini 3.1 Flash TTS Preview：低延迟可控语音合成，适合产品旁白与语音助手。",
        "Gemini 3.1 Flash TTS Preview — low-latency controllable speech for product voice and assistants.",
        zhTW="Gemini 3.1 Flash TTS Preview：低延遲可控語音合成，適合產品旁白與語音助手。",
        ja="Gemini 3.1 Flash TTS Preview。低遅延で制御可能な音声合成。",
        vi="Gemini 3.1 Flash TTS Preview — TTS độ trễ thấp, kiểm soát được.",
    ),
    "gemini-embedding-2-preview": copy_token(
        "Gemini Embedding 2 Preview：多模态向量化（文本/图/音/视频），适用于跨模态检索与 RAG。",
        "Gemini Embedding 2 Preview — multimodal vectors (text/image/audio/video) for retrieval and RAG.",
        zhTW="Gemini Embedding 2 Preview：多模態向量化（文本/圖/音/影片），適用於跨模態檢索與 RAG。",
        ja="Gemini Embedding 2 Preview。テキスト/画像/音声/動画のマルチモーダル埋め込み。",
        vi="Gemini Embedding 2 Preview — embedding đa phương thức cho RAG.",
    ),
}

MODELS = [
    {
        "id": "suno_music_open",
        "kind": "times",
        "sell": SUNO_SELL,
        "tag": "音乐",
        "vendor": "Suno",
        "icon": "Suno",
        "endpoints": EP_SUNO,
        "desc": COPIES["suno_music_open"]["description"],
        "channel": "suno",
        "also_price": ["suno_music"],
    },
    {
        "id": "gemini-3.1-flash-tts-preview",
        "kind": "token",
        "ratio": TTS_RATIO,
        "comp": TTS_COMP,
        "sell_in": TTS_SELL_IN,
        "sell_out": TTS_SELL_OUT,
        "tag": "语音合成",
        "vendor": "Google",
        "icon": "Gemini.Color",
        "endpoints": EP_TTS,
        "desc": COPIES["gemini-3.1-flash-tts-preview"]["description"],
        "channel": "primary",
        "ability_src": "gemini-3.8-flash",
    },
    {
        "id": "gemini-embedding-2-preview",
        "kind": "token",
        "ratio": EMB_RATIO,
        "comp": EMB_COMP,
        "sell_in": EMB_SELL_IN,
        "sell_out": EMB_SELL_OUT,
        "tag": "rag",
        "vendor": "Google",
        "icon": "Gemini.Color",
        "endpoints": EP_EMB,
        "desc": COPIES["gemini-embedding-2-preview"]["description"],
        "channel": "primary",
        "ability_src": "WeMM-Embedding-2B",
    },
]


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


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


def add_models_to_channel(cur, ch_cols, cid, cname, models_s, ids, now, mapping=None):
    parts = [p.strip() for p in (models_s or "").replace("\n", ",").split(",") if p.strip()]
    added = []
    for mid in ids:
        if mid not in parts:
            parts.insert(0, mid)
            added.append(mid)
    merged = ",".join(parts)
    sets = ["models=?"]
    vals = [merged]
    low = (cname or "").lower()
    new_name = cname
    if "openlux" in low or "上游" in (cname or "") or "gitee" in low:
        new_name = "Keyo Primary"
        sets.append("name=?")
        vals.append(new_name)
    if mapping is not None and "model_mapping" in ch_cols:
        sets.append("model_mapping=?")
        vals.append(json.dumps(mapping, ensure_ascii=False, separators=(",", ":")))
    if "updated_time" in ch_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(cid)
    cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print("channel", cid, new_name, "add", added or "(none)")
    return cid


def find_primary(cur, ch_cols):
    sql = "SELECT id, name, models, base_url, `key` FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    rows = cur.execute(sql).fetchall()
    for cid, name, models, base, key in rows:
        if (name or "") == "Keyo Primary":
            return cid, name, models or "", base or "", key or ""
    for cid, name, models, base, key in rows:
        blob = ((name or "") + " " + (base or "")).lower()
        if "openlux" in blob:
            return cid, name, models or "", base or "", key or ""
    for cid, name, models, base, key in rows:
        ms = [x.strip() for x in (models or "").split(",") if x.strip()]
        if "gpt-6.1-sol" in ms or "gemini-3.8-flash" in ms:
            return cid, name, models or "", base or "", key or ""
    raise SystemExit("Keyo Primary not found")


def ensure_suno_channel(cur, ch_cols, primary, now):
    _pcid, _pn, _pm, pbase, pkey = primary
    sql = "SELECT id, name, models, type, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    rows = cur.execute(sql).fetchall()
    target = None
    for cid, name, models, typ, base in rows:
        if (name or "") == "Keyo Music":
            target = (cid, name, models or "")
            break
    if target is None:
        for cid, name, models, typ, base in rows:
            blob = ((name or "") + " " + (base or "")).lower()
            if int(typ or 0) == 36 and "openlux" in blob:
                target = (cid, name, models or "")
                break
    ids = ["suno_music_open", "suno_music"]
    mapping = {"suno_music": "suno_music_open"}
    if target is None:
        fields, values = [], []
        spec = {
            "type": 36,
            "key": pkey,
            "name": "Keyo Music",
            "base_url": pbase,
            "models": ",".join(ids),
            "group": "default",
            "status": 1,
        }
        if "model_mapping" in ch_cols:
            spec["model_mapping"] = json.dumps(mapping, separators=(",", ":"))
        if "created_time" in ch_cols:
            spec["created_time"] = now
        if "updated_time" in ch_cols:
            spec["updated_time"] = now
        for col, val in spec.items():
            if col in ch_cols:
                fields.append('"%s"' % col if col == "group" else col)
                values.append(val)
        cur.execute(
            "INSERT INTO channels(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        cid = cur.lastrowid
        print("suno_channel created", cid)
        return cid
    cid, name, models_s = target
    add_models_to_channel(cur, ch_cols, cid, name, models_s, ids, now, mapping=mapping)
    sets = []
    vals = []
    if "key" in ch_cols and pkey:
        sets.append("key=?")
        vals.append(pkey)
    if "base_url" in ch_cols and pbase:
        sets.append("base_url=?")
        vals.append(pbase)
    if "type" in ch_cols:
        sets.append("type=?")
        vals.append(36)
    if "name" in ch_cols:
        sets.append("name=?")
        vals.append("Keyo Music")
    if "status" in ch_cols:
        sets.append("status=1")
    if sets:
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print("suno_channel", cid)
    return cid


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
    for mid, copy in COPIES.items():
        data[mid] = {k: v for k, v in copy.items() if not k.startswith("_")}
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(path, "a", encoding="utf-8").write("\n")
    print("copy_merged", path)


def patch_docs(path):
    if not os.path.exists(path):
        print("docs_skip", path)
        return
    html = open(path, encoding="utf-8", errors="ignore").read()
    tts_row = '<tr><td class="model"><button type="button" class="model-btn" data-copy="gemini-3.1-flash-tts-preview">gemini-3.1-flash-tts-preview</button></td><td class="note-cell">Gemini Flash TTS</td></tr>'
    needle_tts = '<tr><td class="model"><button type="button" class="model-btn" data-copy="IndexTTS-2">IndexTTS-2</button></td><td class="note-cell" data-i18n="nIndexTts"></td></tr>'
    if 'data-copy="gemini-3.1-flash-tts-preview"' not in html and needle_tts in html:
        html = html.replace(needle_tts, needle_tts + "\n" + tts_row, 1)
        print("docs_tts_row")
    suno_block = (
        '<h3 style="font-size:15px;margin:28px 0 10px;letter-spacing:-0.01em;">Music</h3>\n'
        '<div class="endpoint"><span class="method">POST</span><span class="path">/suno/submit/MUSIC</span>'
        '<button type="button" class="btn-copy" data-copy="https://www.keyoapi.xyz/suno/submit/MUSIC">Copy</button></div>\n'
        '<p class="sec-desc">Suno song generation. Model id <code>suno_music_open</code>. Poll the returned task id.</p>\n'
        '<div class="table-wrap"><table><thead><tr><th>Model</th><th>Note</th></tr></thead><tbody>\n'
        '<tr><td class="model"><button type="button" class="model-btn" data-copy="suno_music_open">suno_music_open</button></td>'
        '<td class="note-cell">Suno music · ~$0.0039 / request</td></tr>\n'
        "</tbody></table></div>\n"
    )
    if 'data-copy="suno_music_open"' not in html:
        marker = '<h3 style="font-size:15px;margin:28px 0 10px;letter-spacing:-0.01em;" data-i18n="ttsAsyncTitle"></h3>'
        if marker in html:
            html = html.replace(marker, suno_block + marker, 1)
            print("docs_suno_block")
        else:
            print("docs_suno_marker_miss")
    if 'data-copy="gemini-embedding-2-preview"' not in html:
        needle_more = '<tr><td class="note-cell" data-i18n="capSystemOne"></td><td class="price">POST /v1/systemone · ~$0.032 / $0</td><td class="model"><button type="button" class="model-btn" data-copy="Bespoke-Nimble-9B">Bespoke-Nimble-9B</button></td></tr>'
        emb_row = '<tr><td class="note-cell">Embeddings</td><td class="price">POST /v1/embeddings · ~$0.18 / $0.71</td><td class="model"><button type="button" class="model-btn" data-copy="gemini-embedding-2-preview">gemini-embedding-2-preview</button></td></tr>'
        if needle_more in html:
            html = html.replace(needle_more, needle_more + "\n" + emb_row, 1)
            print("docs_emb_row")
        else:
            print("docs_emb_marker_miss")
    for old, new in [
        (
            "TTS sync → POST /v1/audio/speech (returns audio). Models: GLM-TTS, Step-Audio-TTS-3B, IndexTTS-2.",
            "TTS sync → POST /v1/audio/speech (returns audio). Models: GLM-TTS, Step-Audio-TTS-3B, IndexTTS-2, gemini-3.1-flash-tts-preview.",
        ),
        (
            "TTS 同步 → POST /v1/audio/speech（直接返回音频）。模型：GLM-TTS、Step-Audio-TTS-3B、IndexTTS-2。",
            "TTS 同步 → POST /v1/audio/speech（直接返回音频）。模型：GLM-TTS、Step-Audio-TTS-3B、IndexTTS-2、gemini-3.1-flash-tts-preview。",
        ),
    ]:
        if old in html and new not in html:
            html = html.replace(old, new)
            print("docs_tts_rule")
    open(path, "w", encoding="utf-8").write(html)


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

    primary = find_primary(cur, ch_cols)
    pcid, pname, pmodels, pbase, pkey = primary
    print("primary", pcid, pname)

    gemini_ids = [m["id"] for m in MODELS if m["channel"] == "primary"]
    add_models_to_channel(cur, ch_cols, pcid, pname, pmodels, gemini_ids, now)
    suno_cid = ensure_suno_channel(cur, ch_cols, primary, now)

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    for m in MODELS:
        mid = m["id"]
        vid = ensure_vendor(cur, v_cols, m["vendor"], m["icon"], now)
        upsert_model(cur, m_cols, mid, m["desc"], m["icon"], m["tag"], vid, m["endpoints"], now)
        cid = suno_cid if m["channel"] == "suno" else pcid
        set_abilities(cur, tabs, mid, cid, m.get("ability_src"))
        if m["kind"] == "times":
            mp[mid] = m["sell"]
            mr.pop(mid, None)
            cr.pop(mid, None)
            for extra in m.get("also_price") or []:
                mp[extra] = m["sell"]
                mr.pop(extra, None)
                cr.pop(extra, None)
            print("price times", mid, m["sell"])
        else:
            mr[mid] = m["ratio"]
            cr[mid] = m["comp"]
            mp.pop(mid, None)
            print("price token", mid, m["sell_in"], "/", m["sell_out"])

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    conn.commit()
    conn.close()

    merge_copy("/opt/ai-relay/config/marketplace-model-copy.json")
    merge_copy("/opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json")
    patch_docs("/opt/ai-relay/static/brand/keyo-docs.html")
    print("SUNO_SELL", SUNO_SELL)
    print("TTS_SELL", TTS_SELL_IN, TTS_SELL_OUT)
    print("EMB_SELL", EMB_SELL_IN, EMB_SELL_OUT)
    print("DONE_ADD_OLX_SUNO_GEMINI")


if __name__ == "__main__":
    main()
