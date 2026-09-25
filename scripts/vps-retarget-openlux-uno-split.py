#!/usr/bin/env python3
"""Move OpenLux-ever-listed chat models off UnoRouter onto Keyo Primary;
keep Uno-only models on Keyo Chat at cost × 2.

Uses:
  config/openlux-paid-chat-models.json  → OpenLux / Keyo Primary
  config/unorouter-paid-models.json     → UnoRouter / Keyo Chat (exact replace)

Public copy must NOT mention OpenLux / UnoRouter / cost / markup.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPENLUX_CFG = os.path.join(ROOT, "config", "openlux-paid-chat-models.json")
UNO_CFG = os.path.join(ROOT, "config", "unorouter-paid-models.json")
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
ABILITY_SRC = "gpt-5.6-luna"


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


def read_uno_key():
    k = os.environ.get("UNOROUTER_API_KEY", "").strip()
    if k:
        return k
    for p in ("/opt/ai-relay/.env", os.path.join(ROOT, ".env")):
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8", errors="ignore"):
            line = line.strip()
            if line.startswith("UNOROUTER_API_KEY=") and len(line) > 18:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


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
        values.append(icon or "Custom")
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


def upsert_model(cur, m_cols, mid, desc, icon, tags, vid, now):
    if "deleted_at" in m_cols:
        cur.execute(
            "UPDATE models SET deleted_at=NULL WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (mid,),
        )
    row = cur.execute("SELECT id FROM models WHERE model_name=?", (mid,)).fetchone()
    if row is None:
        fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints"]
        values = [mid, desc, icon, tags, vid, EP]
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
        vals = [desc, icon, tags, vid, EP]
        if "status" in m_cols:
            sets.append("status=1")
        if "deleted_at" in m_cols:
            sets.append("deleted_at=NULL")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("marketplace updated", mid)


def find_openlux_channel(cur, ch_cols):
    sql = "SELECT id, name, models, base_url FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    rows = cur.fetchall()
    for cid, name, models, base in rows:
        blob = ((name or "") + " " + (base or "")).lower()
        if "openlux" in blob or (name or "") == "Keyo Primary":
            return cid, name, models or ""
    for cid, name, models, base in rows:
        ms = [x.strip() for x in (models or "").replace("\n", ",").split(",") if x.strip()]
        if ABILITY_SRC in ms:
            return cid, name, models or ""
    return None


def find_named_channel(cur, ch_cols, ch_name):
    sql = "SELECT id, name, models FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    for cid, name, models_s in cur.fetchall():
        if (name or "") == ch_name:
            return cid, name, models_s or ""
    return None


def apply_prices(cur, models, markup, mr, cr, mp):
    for m in models:
        mid = m["id"]
        cost_in = float(m["cost_in"])
        cost_out = float(m["cost_out"])
        sell_in = round(cost_in * markup, 6)
        sell_out = round(cost_out * markup, 6)
        ratio = round(sell_in / 2.0, 6)
        comp = round(sell_out / sell_in, 6) if sell_in else 1.0
        mr[mid] = ratio
        cr[mid] = comp
        mp.pop(mid, None)
        print("price", mid, "sell", sell_in, "/", sell_out, "ratio", ratio, "comp", comp)


def bind_abilities(cur, tabs, mid, cid, ab_src):
    if "abilities" not in tabs:
        return
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


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    ol_cfg = json.load(open(OPENLUX_CFG, encoding="utf-8"))
    uno_cfg = json.load(open(UNO_CFG, encoding="utf-8"))
    ol_models = ol_cfg["models"]
    uno_models = uno_cfg["models"]
    ol_markup = float(ol_cfg.get("markup") or 2)
    uno_markup = float(uno_cfg.get("markup") or 2)
    ol_ids = {m["id"] for m in ol_models}
    uno_ids = [m["id"] for m in uno_models]
    uno_key = read_uno_key()

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    ol = find_openlux_channel(cur, ch_cols)
    if ol is None:
        raise SystemExit("OpenLux / Keyo Primary channel not found")
    ol_cid, ol_cname, ol_models_s = ol
    parts = [p.strip() for p in ol_models_s.replace("\n", ",").split(",") if p.strip()]
    for mid in [m["id"] for m in ol_models]:
        if mid not in parts:
            parts.append(mid)
            print("openlux_channel_add", mid)
        else:
            print("openlux_channel_has", mid)
    sets = ["models=?"]
    vals = [",".join(parts)]
    if "updated_time" in ch_cols:
        sets.append("updated_time=?")
        vals.append(now)
    # scrub public channel name if still leaking supplier
    if "openlux" in (ol_cname or "").lower() or "上游" in (ol_cname or ""):
        sets.append("name=?")
        vals.append("Keyo Primary")
        print("renamed_channel", ol_cname, "->", "Keyo Primary")
    vals.append(ol_cid)
    cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print("openlux_channel", ol_cid, "models", len(parts))

    # Strip moved models from Keyo Chat (Uno); replace with Uno-only list
    uno_ch_name = uno_cfg.get("channel_name") or "Keyo Chat"
    uno = find_named_channel(cur, ch_cols, uno_ch_name)
    if uno is None:
        if not uno_key.startswith("sk-"):
            raise SystemExit("Keyo Chat missing and UNOROUTER_API_KEY not set")
        fields = ["type", "key", "name", "base_url", "models", '"group"', "status"]
        values = [
            1,
            uno_key,
            uno_ch_name,
            uno_cfg["base_url"],
            ",".join(uno_ids),
            "default",
            1,
        ]
        use_f, use_v = [], []
        for f, v in zip(fields, values):
            col = f.strip('"')
            if col in ch_cols:
                use_f.append(f)
                use_v.append(v)
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
        uno_cid = cur.lastrowid
        print("uno_channel created", uno_cid)
    else:
        uno_cid, _, old_models_s = uno
        old_parts = [
            p.strip()
            for p in old_models_s.replace("\n", ",").split(",")
            if p.strip()
        ]
        removed = [p for p in old_parts if p in ol_ids]
        for mid in removed:
            print("uno_channel_remove", mid)
        sets = ["models=?"]
        vals = [",".join(uno_ids)]
        if uno_key.startswith("sk-"):
            sets.append("key=?")
            vals.append(uno_key)
        if "base_url" in ch_cols:
            sets.append("base_url=?")
            vals.append(uno_cfg["base_url"])
        sets.append("status=1")
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(uno_cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("uno_channel", uno_cid, "models", uno_ids)

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")

    ab_src = []
    if "abilities" in tabs:
        ab_src = cur.execute(
            'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=? LIMIT 20',
            (ABILITY_SRC,),
        ).fetchall()

    print("--- openlux ---")
    apply_prices(cur, ol_models, ol_markup, mr, cr, mp)
    for m in ol_models:
        mid = m["id"]
        vid = ensure_vendor(cur, v_cols, m["vendor"], m.get("icon") or "Custom", now)
        upsert_model(
            cur,
            m_cols,
            mid,
            m.get("desc_zh") or mid,
            m.get("icon") or "Custom",
            m.get("tags") or "大语言模型",
            vid,
            now,
        )
        bind_abilities(cur, tabs, mid, ol_cid, ab_src)

    print("--- unorouter ---")
    apply_prices(cur, uno_models, uno_markup, mr, cr, mp)
    for m in uno_models:
        mid = m["id"]
        vid = ensure_vendor(cur, v_cols, m["vendor"], m.get("icon") or "Custom", now)
        upsert_model(
            cur,
            m_cols,
            mid,
            m.get("desc_zh") or mid,
            m.get("icon") or "Custom",
            m.get("tags") or "大语言模型",
            vid,
            now,
        )
        bind_abilities(cur, tabs, mid, uno_cid, [])

    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(
        cur,
        "CompletionRatio",
        json.dumps(cr, ensure_ascii=False, separators=(",", ":")),
    )
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    conn.commit()
    conn.close()
    print("openlux_count", len(ol_models))
    print("uno_count", len(uno_models))
    print("DONE_RETARGET_OPENLUX_UNO_SPLIT")


if __name__ == "__main__":
    main()
