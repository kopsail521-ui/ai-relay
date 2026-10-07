#!/usr/bin/env python3
"""Relist Duix-Avatar: ModelPrice = cheapest 5x tier ($0.06849/sec), tag 数字人.

Cost×5 (FX 7.3), same resolution×duration buckets as the provider sheet:
  ≤720P 0-15s  ¥0.10 → $0.06849
  ≤720P 15-60s ¥0.20 → $0.13699
  720P-1080P 0-15s ¥0.15 → $0.10274
  720P-1080P 15-60s ¥0.30 → $0.20548
Public copy must not name the supplier.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

MID = "Duix-Avatar"
SELL = 0.06849
DESC = (
    "音频+视频驱动的数字人（异步）：参考视频 + 驱动音频生成口型同步，最长 60 秒。"
    "计费：≤720P 0–15秒 $0.06849/秒、15–60秒 $0.13699/秒；"
    "720P–1080P 0–15秒 $0.10274/秒、15–60秒 $0.20548/秒。"
)
EP = json.dumps(
    {"openai": {"path": "/v1/async/videos/audio-video-to-video", "method": "POST"}},
    separators=(",", ":"),
)
TAG = "数字人"
VENDOR = "其他"
ICON = "Custom"


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


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
        if "icon" in v_cols and icon:
            cur.execute(
                "UPDATE vendors SET icon=? WHERE id=? AND (icon IS NULL OR icon='' OR icon='Custom')",
                (icon, row[0]),
            )
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
    return cur.lastrowid


def upsert_model(cur, m_cols, now, vid):
    extra = ""
    if "name_rule" in m_cols:
        extra += ", name_rule"
    dupe = cur.execute(
        "SELECT id, status, deleted_at%s FROM models WHERE model_name=? ORDER BY id" % extra,
        (MID,),
    ).fetchall()
    print("model_rows", dupe)
    if "deleted_at" in m_cols:
        cur.execute("UPDATE models SET deleted_at=NULL WHERE model_name=?", (MID,))
    row = cur.execute("SELECT id FROM models WHERE model_name=? ORDER BY id DESC", (MID,)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [MID, DESC, ICON, TAG, vid, EP]
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
        print("marketplace created", MID)
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
        vals = [DESC, ICON, TAG, vid, EP]
        if "status" in m_cols:
            sets.append("status=1")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "name_rule" in m_cols:
            sets.append("name_rule=0")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", MID, "id", row[0])
        extra_ids = [
            r[0]
            for r in cur.execute("SELECT id FROM models WHERE model_name=?", (MID,)).fetchall()
            if r[0] != row[0]
        ]
        if extra_ids:
            cur.execute(
                "DELETE FROM models WHERE model_name=? AND id!=?",
                (MID, row[0]),
            )
            print("deleted_dupes", extra_ids)
        if "status" in m_cols:
            cur.execute("UPDATE models SET status=1 WHERE model_name=?", (MID,))
        if "name_rule" in m_cols:
            cur.execute("UPDATE models SET name_rule=0 WHERE model_name=?", (MID,))


def find_channel(cur, ch_cols):
    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    rows = cur.execute(sql).fetchall()
    for cid, name, models, base in rows:
        blob = ((name or "") + " " + (base or "")).lower()
        if "gitee" in blob or "模力" in (name or "") or "ai.gitee.com" in (base or "").lower():
            return cid, name, models or ""
        if "3010" in (base or ""):
            return cid, name, models or ""
    for cid, name, models, base in rows:
        ms = [x.strip() for x in (models or "").split(",") if x.strip()]
        if "InfiniteTalk" in ms:
            return cid, name, models or ""
    raise SystemExit("passthrough channel not found")


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db):
        raise SystemExit("DB not found: " + db)
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    cid, cname, models_s = find_channel(cur, ch_cols)
    parts = [p.strip() for p in models_s.replace("\n", ",").split(",") if p.strip()]
    if MID not in parts:
        parts.insert(0, MID)
        added = MID
    else:
        added = "(already)"
    merged = ",".join(parts)
    if "updated_time" in ch_cols:
        cur.execute(
            "UPDATE channels SET models=?, status=1, updated_time=? WHERE id=?",
            (merged, now, cid),
        )
    else:
        cur.execute("UPDATE channels SET models=?, status=1 WHERE id=?", (merged, cid))
    print("channel", cid, cname, "added", added)

    vid = ensure_vendor(cur, v_cols, VENDOR, ICON, now)
    upsert_model(cur, m_cols, now, vid)

    if "abilities" in tabs:
        ab_cols = [r[1] for r in cur.execute("PRAGMA table_info(abilities)")]
        print("abilities_cols", ",".join(ab_cols))
        src_rows = cur.execute(
            "SELECT * FROM abilities WHERE model=?", ("InfiniteTalk",)
        ).fetchall()
        cur.execute("DELETE FROM abilities WHERE model=?", (MID,))
        inserted = 0
        if src_rows:
            for row in src_rows:
                rec = dict(zip(ab_cols, row))
                rec["model"] = MID
                rec["channel_id"] = cid
                rec["enabled"] = 1
                names = [n for n in ab_cols if n in rec]
                qcols = ",".join('"%s"' % n for n in names)
                cur.execute(
                    "INSERT INTO abilities(%s) VALUES (%s)"
                    % (qcols, ",".join(["?"] * len(names))),
                    [rec[n] for n in names],
                )
                inserted += 1
            print("abilities cloned InfiniteTalk", inserted, "channel", cid)
        else:
            rec = {"group": "default", "model": MID, "channel_id": cid, "enabled": 1}
            if "priority" in ab_cols:
                rec["priority"] = 0
            if "weight" in ab_cols:
                rec["weight"] = 1
            names = [n for n in ab_cols if n in rec]
            qcols = ",".join('"%s"' % n for n in names)
            cur.execute(
                "INSERT INTO abilities(%s) VALUES (%s)"
                % (qcols, ",".join(["?"] * len(names))),
                [rec[n] for n in names],
            )
            inserted = 1
            print("abilities default channel", cid)
        n = cur.execute(
            "SELECT COUNT(*) FROM abilities WHERE model=? AND enabled=1", (MID,)
        ).fetchone()[0]
        print("abilities_enabled", n)
        print(
            "abilities_rows",
            cur.execute(
                'SELECT "group", channel_id, enabled FROM abilities WHERE model=?',
                (MID,),
            ).fetchall(),
        )
        if n < 1:
            raise SystemExit("abilities not enabled")

    root = os.environ.get("KEYO_ROOT") or "/opt/ai-relay"
    docs = os.path.join(root, "static/brand/keyo-docs.html")
    if os.path.isfile(docs):
        t = open(docs, encoding="utf-8").read()
        t2 = t.replace(
            "Digital human — currently unavailable.",
            "Digital human (audio+video → video, max 60s)",
        ).replace(
            "数字人（已下架）：当前暂不可用。",
            "数字人（音频+视频→视频，最长 60 秒）",
        )
        if t2 != t:
            open(docs, "w", encoding="utf-8").write(t2)
            print("docs patched")
        else:
            print("docs already")

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    mr.pop(MID, None)
    cr.pop(MID, None)
    mp[MID] = SELL
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("ModelPrice", MID, SELL)
    st = cur.execute(
        "SELECT status, deleted_at, vendor_id FROM models WHERE model_name=?", (MID,)
    ).fetchone()
    print("db_row status", st[0] if st else None, "deleted", st[1] if st else None, "vendor", st[2] if st else None)
    conn.commit()
    conn.close()
    print("DONE_RELIST_DUIX")


if __name__ == "__main__":
    main()
