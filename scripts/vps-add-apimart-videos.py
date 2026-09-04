#!/usr/bin/env python3
"""Register APIMart video models in New API (marketplace + ModelPrice defaults)."""
import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "config", "apimart-selected-models.json")

ENDPOINTS = json.dumps(
    {"openai-video": "/v1/videos/generations"}, separators=(",", ":")
)


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def default_sell(m, markup, fx):
    """Return ModelPrice display rate: prefer per-second sell USD (not ×duration)."""
    if m.get("model_price_usd") is not None:
        return round(float(m["model_price_usd"]), 6)
    if m.get("sell_usd_per_second") is not None:
        v = m["sell_usd_per_second"]
        if isinstance(v, dict):
            # prefer 480P / first value
            for k in ("480P", "480p", "768P", "HD", "DRAFT"):
                if k in v:
                    return round(float(v[k]), 6)
            return round(float(next(iter(v.values()))), 6)
        return round(float(v), 6)
    if m.get("sell_usd") is not None:
        return round(float(m["sell_usd"]), 6)

    e = m.get("estimate") or {}
    mode = e.get("mode")
    if e.get("sell_usd_per_second") is not None:
        v = e["sell_usd_per_second"]
        if isinstance(v, dict):
            r = (
                v.get(e.get("default_resolution"))
                or v.get("480p")
                or v.get("480P")
                or next(iter(v.values()), 0)
            )
            return round(float(r), 6)
        return round(float(v), 6)
    if mode == "fixed":
        return round(float(e.get("cost_usd") or 0) * markup, 6)
    if mode == "per_second":
        return round(float(e.get("cost_usd_per_second") or 0) * markup, 6)
    if mode in ("per_second_resolution", "per_second_resolution_input", "flux_tiers"):
        mp = e.get("cost_usd_per_second") or {}
        r = (
            mp.get(e.get("default_resolution") or e.get("default_tier"))
            or next(iter(mp.values()), 0)
        )
        return round(float(r) * markup, 6)
    if mode == "per_second_resolution_cny":
        mp = e.get("cost_cny_per_second") or {}
        r = mp.get(e.get("default_resolution")) or next(iter(mp.values()), 0)
        return round(float(r) / fx * markup, 6)
    if mode == "ext_pack_or_ref":
        packs = e.get("pack_sell_usd") or {}
        return round(float(packs.get("720P-8s") or 0.42), 6)
    return 0.0


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    cfg = json.load(open(CFG, encoding="utf-8"))
    markup = float(cfg.get("markup") or 1.2)
    fx = float(cfg.get("fx_cny_usd") or 7.3)
    models = cfg["models"]

    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())

    # Ensure a placeholder channel so /pricing abilities can point somewhere
    ch_cols = cols(cur, "channels")
    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    channels = cur.fetchall()
    target = None
    for cid, name, models_s, base in channels:
        blob = ((name or "") + " " + (base or "")).lower()
        if "apimart" in blob:
            target = (cid, name, models_s or "")
            break
    if target is None:
        # create thin placeholder channel (real traffic goes via passthrough :3011)
        fields = ["type", "key", "name", "base_url", "models", "group", "status"]
        values = [
            1,
            "sk-apimart-passthrough-placeholder",
            "APIMart 视频（透传）",
            "https://api.apimart.ai",
            ",".join(m["id"] for m in models),
            "default",
            2,  # disabled — do not route New API relay here
        ]
        if "priority" in ch_cols:
            fields.append("priority")
            values.append(0)
        if "weight" in ch_cols:
            fields.append("weight")
            values.append(0)
        if "created_time" in ch_cols:
            fields.append("created_time")
            values.append(now)
        if "updated_time" in ch_cols:
            fields.append("updated_time")
            values.append(now)
        cur.execute(
            "INSERT INTO channels(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        target = (cur.lastrowid, "APIMart 视频（透传）", ",".join(m["id"] for m in models))
        print("channel created", target[0], "(status disabled; use passthrough)")
    else:
        cid, cname, models_s = target
        parts = [p.strip() for p in models_s.split(",") if p.strip()]
        for m in models:
            if m["id"] not in parts:
                parts.append(m["id"])
        merged = ",".join(parts)
        if "updated_time" in ch_cols:
            cur.execute(
                "UPDATE channels SET models=?, updated_time=? WHERE id=?",
                (merged, now, cid),
            )
        else:
            cur.execute("UPDATE channels SET models=? WHERE id=?", (merged, cid))
        print("channel", cid, cname, "models", len(parts))

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
        sell = default_sell(m, markup, fx)
        mp[mid] = sell
        mr.pop(mid, None)
        cr.pop(mid, None)

        vid = ensure_vendor(m.get("vendor") or "其他", m.get("icon") or "Custom")
        unit = "/秒" if m.get("billing") in ("per_second", "settle_cost", "pack_or_ref_second") else "/次"
        if m.get("billing") == "pack_or_ref_second":
            unit = "/档或秒"
        desc = m.get("desc_zh") or (
            "%s · $%s%s（上游×%.1f，出片按实付结算）" % (mid, sell, unit, markup)
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
            values = [
                mid,
                desc,
                m.get("icon") or "Custom",
                m.get("tag") or "视频",
                vid,
                ENDPOINTS,
            ]
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
            print("marketplace created", mid, "default_sell", sell)
        else:
            sets = [
                "description=?",
                "icon=?",
                "tags=?",
                "vendor_id=?",
                "endpoints=?",
            ]
            vals = [
                desc,
                m.get("icon") or "Custom",
                m.get("tag") or "视频",
                vid,
                ENDPOINTS,
            ]
            if "status" in m_cols:
                sets.append("status=1")
            if "sync_official" in m_cols:
                sets.append("sync_official=0")
            if "updated_time" in m_cols:
                sets.append("updated_time=?")
                vals.append(now)
            vals.append(mrow[0])
            cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
            print("marketplace updated", mid, "default_sell", sell)

        out.append({"model": mid, "default_sell_usd": sell})

    put_opt("ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":"))
    )
    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    conn.commit()
    conn.close()
    print(json.dumps({"ok": True, "markup": markup, "models": out}, ensure_ascii=False))
    print("DONE_ADD_APIMART_VIDEOS")


if __name__ == "__main__":
    main()
