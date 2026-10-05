#!/usr/bin/env python3
"""Swap grok video SKUs to the aicopy official-passthrough channel.

Delist (Path A / apimart era, upstream openlux):
  grok-1.5-video, grok-imagine-video-1.5-preview
Add:
  grok-imagine-video-1.5  sell $0.30822/req (cost CNY 0.9 x2.5 / FX 7.3)
Channel "Keyo Video" -> https://api.aicopy.top with model_mapping
  {"grok-imagine-video-1.5": "grok-1.5-官转接口"}
Key: AICOPY_API_KEY in env or /opt/ai-relay/.env (never print it).
Public copy must NOT name aicopy. Users call POST /v1/chat/completions.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

NEW_ID = "grok-imagine-video-1.5"
UPSTREAM_ID = "grok-1.5-官转接口"
CHANNEL_NAME = "Keyo Video"
BASE_URL = "https://api.aicopy.top"
SELL_USD = 0.30822  # CNY 0.9 x2.5 = 2.25 / 7.3
OLD_IDS = ["grok-1.5-video", "grok-imagine-video-1.5-preview"]
TAG = "视频按次"
VENDOR = "xAI"
ICON = "XAI"
EP_CHAT = json.dumps(
    {"openai": {"path": "/v1/chat/completions", "method": "POST"}},
    separators=(",", ":"),
)
DESC = (
    "xAI Grok Imagine Video 1.5：文生 / 单图 / 首尾帧 / 多参考图一个接口全支持，"
    "可调时长、分辨率与画幅，内置音频。计费：$0.3082/次。"
)


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


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


def find_channel(cur, ch_cols):
    sql = "SELECT id, name, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    for cid, name, base in cur.execute(sql).fetchall():
        if name == CHANNEL_NAME or "aicopy" in (base or "").lower():
            return cid, name
    return None


def upsert_channel(cur, ch_cols, key, now):
    mapping = json.dumps({NEW_ID: UPSTREAM_ID}, ensure_ascii=False, separators=(",", ":"))
    target = find_channel(cur, ch_cols)
    if target is None:
        fields = ["type", "key", "name", "base_url", "models", '"group"', "status"]
        values = [1, key, CHANNEL_NAME, BASE_URL, NEW_ID, "default", 1]
        use_f, use_v = [], []
        for f, v in zip(fields, values):
            col = f.strip('"')
            if col in ch_cols:
                use_f.append(f)
                use_v.append(v)
        if "model_mapping" in ch_cols:
            use_f.append("model_mapping")
            use_v.append(mapping)
        if "created_time" in ch_cols:
            use_f.append("created_time")
            use_v.append(now)
        if "updated_time" in ch_cols:
            use_f.append("updated_time")
            use_v.append(now)
        cur.execute(
            "INSERT INTO channels(%s) VALUES (%s)"
            % (",".join(use_f), ",".join(["?"] * len(use_f))),
            use_v,
        )
        cid = cur.lastrowid
        print("channel created", cid, CHANNEL_NAME)
        return cid
    cid, cname = target
    sets = ["key=?", "base_url=?", "models=?", "status=1"]
    vals = [key, BASE_URL, NEW_ID]
    if "model_mapping" in ch_cols:
        sets.append("model_mapping=?")
        vals.append(mapping)
    if "updated_time" in ch_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(cid)
    cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print("channel updated", cid, cname, "-> model", NEW_ID)
    return cid


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


def upsert_model(cur, m_cols, vid, now):
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (NEW_ID,),
        )
    sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    row = cur.execute(sql, (NEW_ID,)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [NEW_ID, DESC, ICON, TAG, vid, EP_CHAT]
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
        print("marketplace created", NEW_ID)
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
        vals = [DESC, ICON, TAG, vid, EP_CHAT]
        if "status" in m_cols:
            sets.append("status=1")
        if "sync_official" in m_cols:
            sets.append("sync_official=0")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", NEW_ID)


def delist(cur, ch_cols, m_cols, now):
    for mid in OLD_IDS:
        try:
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            print("delist", mid, "abilities_deleted", cur.rowcount)
        except Exception as e:
            print("delist", mid, "abilities_skip", e)

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
                        "UPDATE channels SET models=? WHERE id=?",
                        (",".join(new_parts), cid),
                    )
                print("delist", mid, "removed from channel", cid)

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
                print("delist", mid, "option", key, "removed")

        if "deleted_at" in m_cols:
            cur.execute(
                "DELETE FROM models WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
                (mid,),
            )
            cur.execute(
                "UPDATE models SET deleted_at=?, status=0 WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
                (now, mid),
            )
            print("delist", mid, "marketplace soft-deleted", cur.rowcount)
        elif "status" in m_cols:
            cur.execute("UPDATE models SET status=0 WHERE model_name=?", (mid,))
            print("delist", mid, "marketplace status0", cur.rowcount)


def main():
    key = read_key()
    if not key.startswith("sk-"):
        raise SystemExit("set AICOPY_API_KEY in /opt/ai-relay/.env first")
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    delist(cur, ch_cols, m_cols, now)
    cid = upsert_channel(cur, ch_cols, key, now)
    vid = ensure_vendor(cur, v_cols, VENDOR, ICON, now)
    upsert_model(cur, m_cols, vid, now)
    cur.execute("DELETE FROM abilities WHERE model=?", (NEW_ID,))
    cur.execute(
        'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
        ("default", NEW_ID, cid, 1, 0, 1),
    )
    print("abilities", NEW_ID, "-> channel", cid)

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    mr.pop(NEW_ID, None)
    cr.pop(NEW_ID, None)
    mp[NEW_ID] = SELL_USD
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("pricing", NEW_ID, "= $%s / request" % SELL_USD)

    conn.commit()
    conn.close()
    print("DONE_GROK15_VIDEO_SWAP")


if __name__ == "__main__":
    main()
