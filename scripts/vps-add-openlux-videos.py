#!/usr/bin/env python3
"""Add OpenLux video models into New API sqlite.

Pricing from OpenLux screenshots × 2.5:
  - grok-imagine-video-1.5-preview: per-second (480p/720p)
  - grok-1.5-video: per-request $0.2427 → sell $0.60675
  - veo_3_1-components: per-request $0.0565 → sell $0.14125
"""
import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "config", "openlux-selected-models.json")

ABILITY_SRC = "gpt-5.6-luna"
MARKUP = 2.5
ENDPOINTS_VIDEO = json.dumps({"openai-video": "/v1/videos"}, separators=(",", ":"))
ENDPOINTS_GEN = json.dumps(
    {"openai-video": "/v1/videos/generations"}, separators=(",", ":")
)


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    cfg = json.load(open(CFG, encoding="utf-8"))
    models = cfg["models"]
    markup = float(cfg.get("markup") or MARKUP)

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
    for cid, name, models_s, base in channels:
        blob = ((name or "") + " " + (base or "")).lower()
        if "openlux" in blob:
            target = (cid, name, models_s or "")
            break
    if target is None:
        for cid, name, models_s, base in channels:
            ms = [x.strip() for x in (models_s or "").split(",") if x.strip()]
            if ABILITY_SRC in ms:
                target = (cid, name, models_s or "")
                break
    if target is None:
        raise SystemExit("OpenLux channel not found")

    cid, cname, models_s = target
    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    added = []
    for m in models:
        mid = m["id"]
        if mid not in parts:
            parts.append(mid)
            added.append(mid)
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
        cur.execute("SELECT value FROM options WHERE key=?", (key,))
        row = cur.fetchone()
        return row[0] if row else "{}"

    def put_opt(key, value):
        cur.execute("SELECT key FROM options WHERE key=?", (key,))
        if cur.fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES(?,?)", (key, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, key))

    mr = json.loads(get_opt("ModelRatio") or "{}")
    cr = json.loads(get_opt("CompletionRatio") or "{}")
    mp = json.loads(get_opt("ModelPrice") or "{}")

    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    def ensure_vendor(name, icon):
        cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
        row = cur.fetchone()
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
        return cur.lastrowid

    out = []
    for m in models:
        mid = m["id"]
        if m.get("billing") == "per_second":
            sell = float(
                m.get("model_price_default_usd")
                or (m.get("sell_usd_per_second") or {}).get("480p")
                or 0
            )
            unit_note = "/秒"
        else:
            sell = float(m.get("model_price_usd") or m.get("sell_usd") or 0)
            unit_note = "/次"
        mp[mid] = sell
        mr.pop(mid, None)
        cr.pop(mid, None)

        vendor = m.get("vendor") or "其他"
        icon = m.get("icon") or "Custom"
        vid = ensure_vendor(vendor, icon)
        desc = m.get("desc_zh") or ("%s · $%s%s" % (mid, sell, unit_note))
        endpoints = (
            ENDPOINTS_GEN
            if "generations" in (m.get("upstream_endpoint") or "")
            else ENDPOINTS_VIDEO
        )

        model_sql = "SELECT id FROM models WHERE model_name=?"
        if "deleted_at" in m_cols:
            model_sql += " AND deleted_at IS NULL"
        cur.execute(model_sql, (mid,))
        mrow = cur.fetchone()
        if mrow is None:
            fields = [
                "model_name",
                "description",
                "icon",
                "tags",
                "vendor_id",
                "endpoints",
            ]
            values = [mid, desc, icon, m.get("tag") or "视频", vid, endpoints]
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
            print("marketplace created", mid, "ModelPrice", sell, unit_note)
        else:
            sets = [
                "description=?",
                "icon=?",
                "tags=?",
                "vendor_id=?",
                "endpoints=?",
            ]
            vals = [desc, icon, m.get("tag") or "视频", vid, endpoints]
            if "status" in m_cols:
                sets.append("status=1")
            if "sync_official" in m_cols:
                sets.append("sync_official=0")
            if "updated_time" in m_cols:
                sets.append("updated_time=?")
                vals.append(now)
            vals.append(mrow[0])
            cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
            print("marketplace updated", mid, "ModelPrice", sell, unit_note)

        try:
            cur.execute(
                'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
                (ABILITY_SRC,),
            )
            ab_src = cur.fetchall()
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            if ab_src:
                for g, ch, en, pri, w in ab_src:
                    cur.execute(
                        'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                        (g, mid, cid, en, pri, w),
                    )
            else:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    ("default", mid, cid, 1, 0, 1),
                )
            print("abilities", mid, "-> channel", cid)
        except Exception as e:
            print("abilities skip", mid, e)

        out.append(
            {
                "model": mid,
                "sell_usd": sell,
                "billing": m.get("billing"),
                "unit": unit_note,
            }
        )

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":"))
    )
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    conn.commit()
    conn.close()
    print(json.dumps({"ok": True, "markup": markup, "models": out}, ensure_ascii=False))
    print("DONE_ADD_OPENLUX_VIDEOS")


if __name__ == "__main__":
    main()
