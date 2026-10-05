#!/usr/bin/env python3
"""Add 2 free Gitee models (SenseVoiceSmall ASR, Spark-TTS-0.5B async TTS) and
delist Qwen3-VL-Embedding-8B.

Free = ModelPrice 0 (per-call $0), no ratio entries. Upstream ops are free
(free_operation_count covers all ops).
  SenseVoiceSmall   v1/audio/transcriptions   relay newapi_native
  Spark-TTS-0.5B    v1/async/audio/speech     relay gitee_passthrough (Caddy /v1/async/* -> :3010)
Delist: abilities + channel lists + option maps + marketplace soft-delete.
Public copy must NOT name Gitee.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

DELIST = "Qwen3-VL-Embedding-8B"
EP_ASR = json.dumps(
    {"openai": {"path": "/v1/audio/transcriptions", "method": "POST"}},
    separators=(",", ":"),
)
EP_ASYNC_TTS = json.dumps(
    {"openai": {"path": "/v1/async/audio/speech", "method": "POST"}},
    separators=(",", ":"),
)

FREE = [
    {
        "id": "SenseVoiceSmall",
        "vendor": "阿里巴巴",  # FunAudioLLM
        "icon": "Qwen.Color",
        "tags": "语音识别,免费",
        "endpoints": EP_ASR,
        "desc": (
            "SenseVoiceSmall：FunAudioLLM 轻量级语音识别模型，低延迟、高准确度，"
            "适合实时转写、会议记录与语音交互（免费）。计费：$0/次。"
        ),
        "ability_src": "Fun-ASR-Nano-2512",
    },
    {
        "id": "Spark-TTS-0.5B",
        "vendor": "其他",  # SparkAudio
        "icon": "Custom",
        "tags": "语音合成,免费",
        "endpoints": EP_ASYNC_TTS,
        "desc": (
            "Spark-TTS 0.5B：基于 LLM 的文本转语音系统，高精度自然合成，"
            "支持多语言与音色克隆（异步接口，免费）。计费：$0/次。"
        ),
        "ability_src": "CosyVoice3",
    },
]


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


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
    if "updated_time" in v_cols:
        fields.append("updated_time")
        values.append(now)
    cur.execute(
        "INSERT INTO vendors(%s) VALUES (%s)"
        % (",".join(fields), ",".join(["?"] * len(fields))),
        values,
    )
    print("vendor created", name)
    return cur.lastrowid


def upsert_model(cur, m_cols, m, vid, now):
    mid = m["id"]
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (mid,),
        )
    sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    row = cur.execute(sql, (mid,)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [mid, m["desc"], m["icon"], m["tags"], vid, m["endpoints"]]
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
        vals = [m["desc"], m["icon"], m["tags"], vid, m["endpoints"]]
        if "status" in m_cols:
            sets.append("status=1")
        if "sync_official" in m_cols:
            sets.append("sync_official=0")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", mid)


def set_abilities(cur, mid, channel_id, ability_src):
    cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
    rows = []
    if ability_src:
        rows = cur.execute(
            'SELECT "group", enabled, priority, weight FROM abilities WHERE model=? LIMIT 30',
            (ability_src,),
        ).fetchall()
    for g, en, pri, w in rows or []:
        cur.execute(
            'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
            (g, mid, channel_id, en, pri, w),
        )
    if not rows:
        cur.execute(
            'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
            ("default", mid, channel_id, 1, 0, 1),
        )
    print("abilities", mid, "src", ability_src or "(default)", "rows", max(len(rows), 1))


def delist(cur, ch_cols, m_cols, now):
    mid = DELIST
    try:
        cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
        print("delist abilities_deleted", cur.rowcount)
    except Exception as e:
        print("delist abilities_skip", e)

    cur.execute("SELECT id, models FROM channels")
    for cid, models in cur.fetchall():
        if not models or mid not in models:
            continue
        parts = [p.strip() for p in models.replace("\n", ",").split(",") if p.strip()]
        new_parts = [p for p in parts if p != mid]
        if len(new_parts) != len(parts):
            if "updated_time" in ch_cols:
                cur.execute(
                    "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                    (",".join(new_parts), now, cid),
                )
            else:
                cur.execute(
                    "UPDATE channels SET models=? WHERE id=?", (",".join(new_parts), cid)
                )
            print("delist channel", cid, "models updated")

    for key in ("ModelRatio", "ModelPrice", "CompletionRatio", "GroupRatio"):
        row = cur.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
        if not row or not row[0]:
            continue
        try:
            data = json.loads(row[0])
        except Exception:
            continue
        if isinstance(data, dict) and mid in data:
            del data[mid]
            cur.execute(
                "UPDATE options SET value=? WHERE key=?",
                (json.dumps(data, ensure_ascii=False, separators=(",", ":")), key),
            )
            print("delist option", key, "removed")

    if "deleted_at" in m_cols:
        cur.execute(
            "DELETE FROM models WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (mid,),
        )
        cur.execute(
            "UPDATE models SET deleted_at=?, status=0 WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
            (now, mid),
        )
        print("delist marketplace soft-deleted", cur.rowcount)
    elif "status" in m_cols:
        cur.execute("UPDATE models SET status=0 WHERE model_name=?", (mid,))
        print("delist marketplace status0", cur.rowcount)


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

    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    target = None
    for cid, name, models, base in cur.execute(sql).fetchall():
        blob = ((name or "") + " " + (base or "")).lower()
        if "gitee" in blob or "模力" in (name or "") or "ai.gitee.com" in (base or ""):
            target = (cid, name, models or "")
            break
    if target is None:
        raise SystemExit("Gitee channel not found")
    cid, cname, models_s = target

    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    added = []
    for m in FREE:
        if m["id"] not in parts:
            parts.insert(0, m["id"])
            added.append(m["id"])
    merged = ",".join(parts)
    if "updated_time" in ch_cols:
        cur.execute(
            "UPDATE channels SET models=?, updated_time=? WHERE id=?",
            (merged, now, cid),
        )
    else:
        cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
    print("channel", cid, cname, "added", ",".join(added) or "(none)")

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

    for m in FREE:
        mid = m["id"]
        mr.pop(mid, None)
        cr.pop(mid, None)
        mp[mid] = 0
        vid = ensure_vendor(cur, v_cols, m["vendor"], m["icon"], now)
        upsert_model(cur, m_cols, m, vid, now)
        set_abilities(cur, mid, cid, m["ability_src"])
        print("free", mid)

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt("CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing: ModelPrice=0 for", [m["id"] for m in FREE])

    delist(cur, ch_cols, m_cols, now)

    conn.commit()
    conn.close()
    print("DONE_GITEE_FREE2_DELIST_EMBED8B")


if __name__ == "__main__":
    main()
