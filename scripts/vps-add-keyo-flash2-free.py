#!/usr/bin/env python3
"""List unisound u2-flash as keyo-flash2:free (display $0, debit $0.01/$0.05).

Upstream (verified live 2026-10-10):
  POST https://maas-api.unisound.com/v1/chat/completions
  OpenAI-compatible, model "u2-flash", streaming OK, reasoning model
  (content + reasoning_content). Owner-key costs are $0 during the free
  promo, so Keyo sells at $0.01 in / $0.05 out per 1M (chosen list price).

Pattern (identical to Atria-dawn-v2:free):
  - public id  keyo-flash2:free  -> ModelPrice=0 (joins the free pool,
    /pricing shows $0, calls debit the gift wallet first)
  - hidden twin keyo-flash2      -> ModelRatio=0.005, CompletionRatio=5
    (never added to any channel's model list, so it never appears in the
    marketplace). BillingModelName() strips ":free", lands on the twin,
    and the gift wallet is debited $0.01/$0.05 per 1M.

The channel maps keyo-flash2:free -> u2-flash via model_mapping.
Public copy must not name the supplier (unisound).
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
PUBLIC = "keyo-flash2:free"
TWIN = "keyo-flash2"
UPSTREAM = "u2-flash"
BASE = "https://maas-api.unisound.com"
CHANNEL_NAME = "Keyo Flash"
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
# sell in $0.01/1M -> ratio = 0.01/2 ; out $0.05/1M -> completion_ratio = 5
TWIN_RATIO = 0.005
TWIN_COMP = 5.0


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
    if "updated_time" in v_cols:
        fields.append("updated_time")
        values.append(now)
    cur.execute(
        "INSERT INTO vendors(%s) VALUES (%s)"
        % (",".join(fields), ",".join(["?"] * len(fields))),
        values,
    )
    return cur.lastrowid


def upsert_marketplace(cur, m_cols, mid, desc, icon, tags, vid, now):
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


def main():
    import os

    key = os.environ.get("UNISOUND_API_KEY") or ""
    if not key:
        for line in ("/opt/ai-relay/.env", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")):
            if not os.path.exists(line):
                continue
            for ln in open(line, encoding="utf-8", errors="ignore"):
                if ln.strip().startswith("UNISOUND_API_KEY="):
                    key = ln.split("=", 1)[1].strip().strip('"').strip("'")
                    break
            if key:
                break
    if len(sys.argv) > 2 and sys.argv[2].strip():
        key = sys.argv[2].strip()
    if not key:
        raise SystemExit("missing UNISOUND_API_KEY (env or /opt/ai-relay/.env)")

    con = sqlite3.connect(DB)
    cur = con.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    # 1) channel: find or create the unisound lane
    ch = None
    sql = "SELECT id, name, models FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    for cid, name, models in cur.execute(sql).fetchall():
        blob = ((name or "") + " " + str(cid)).lower()
        if name == CHANNEL_NAME or "unisound" in blob:
            ch = (cid, name, models or "")
            break
    mapping = json.dumps({PUBLIC: UPSTREAM}, ensure_ascii=False, separators=(",", ":"))
    if ch is None:
        fields = ["type", "key", "name", "base_url", "models", '"group"', "status"]
        values = [1, key, CHANNEL_NAME, BASE, PUBLIC, "default", 1]
        use_f, use_v = [], []
        for f, v in zip(fields, values):
            if f.strip('"') in ch_cols:
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
    else:
        cid, cname, models_s = ch
        parts = [p.strip() for p in models_s.split(",") if p.strip()]
        if PUBLIC not in parts:
            parts.append(PUBLIC)
        sets = ["models=?", "key=?", "base_url=?", "status=1"]
        vals = [",".join(parts), key, BASE]
        if "model_mapping" in ch_cols:
            sets.append("model_mapping=?")
            vals.append(mapping)
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("channel updated", cid, cname, "models", ",".join(parts))

    # 2) options: public id price=0 (free pool), twin carries the debit ratio.
    #    Twin must NOT appear on any channel, so it never shows in the square.
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp[PUBLIC] = 0
    mp.pop(TWIN, None)
    mr[TWIN] = TWIN_RATIO
    cr[TWIN] = TWIN_COMP
    mr.pop(PUBLIC, None)
    cr.pop(PUBLIC, None)
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))

    # 3) marketplace rows: public id visible, twin soft-deleted (absent from square)
    vid = ensure_vendor(cur, v_cols, "Keyo", "Custom", now)
    upsert_marketplace(
        cur, m_cols, PUBLIC,
        "Keyo Flash 2：轻量快速对话模型，当前免费档（受 fair-use 限额约束）。",
        "Custom", "大语言模型", vid, now,
    )
    if "deleted_at" in m_cols:
        cur.execute(
            "DELETE FROM models WHERE model_name=? AND deleted_at IS NOT NULL AND deleted_at!=0",
            (TWIN,),
        )
        cur.execute(
            "UPDATE models SET deleted_at=?, status=0 WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
            (now, TWIN),
        )
    else:
        cur.execute("DELETE FROM models WHERE model_name=?", (TWIN,))
    print("twin hidden", TWIN)

    # 4) abilities: public id only, default group, this channel
    if "abilities" in tabs:
        cur.execute("DELETE FROM abilities WHERE model=?", (PUBLIC,))
        cur.execute(
            'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
            ("default", PUBLIC, cid, 1, 0, 1),
        )
        cur.execute("DELETE FROM abilities WHERE model=?", (TWIN,))

    # 5) self-check BEFORE commit
    problems = []
    mp2 = json.loads(get_opt(cur, "ModelPrice") or "{}")
    mr2 = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr2 = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    if mp2.get(PUBLIC) != 0:
        problems.append("ModelPrice[%s] != 0" % PUBLIC)
    if mr2.get(TWIN) != TWIN_RATIO:
        problems.append("ModelRatio[%s] != %r (got %r)" % (TWIN, TWIN_RATIO, mr2.get(TWIN)))
    if cr2.get(TWIN) != TWIN_COMP:
        problems.append("CompletionRatio[%s] != 5 (got %r)" % (TWIN, cr2.get(TWIN)))
    if "abilities" in tabs:
        got = {g for (g,) in cur.execute('SELECT "group" FROM abilities WHERE model=?', (PUBLIC,))}
        if "default" not in got:
            problems.append("abilities missing default for " + PUBLIC)
        n_twin = cur.execute("SELECT count(*) FROM abilities WHERE model=?", (TWIN,)).fetchone()[0]
        if n_twin:
            problems.append("twin abilities leaked (%d)" % n_twin)
    if problems:
        con.rollback()
        con.close()
        raise SystemExit("ABORT: " + "; ".join(problems))

    print(
        "billing: %s shows $0; debits twin %s at $%.4f in / $%.4f out per 1M"
        % (PUBLIC, TWIN, TWIN_RATIO * 2, TWIN_RATIO * 2 * TWIN_COMP)
    )
    con.commit()
    con.close()
    print("DONE_ADD_KEYO_FLASH2_FREE")


if __name__ == "__main__":
    main()
