#!/usr/bin/env python3
"""Add gift-credit (":free") twins for three gitee-lane speech models:

  SenseVoiceSmall:free  -> SenseVoiceSmall   (ASR,  阿里巴巴)
  GLM-ASR:free          -> GLM-ASR           (ASR,  智谱)
  Spark-TTS-0.5B:free   -> Spark-TTS-0.5B    (TTS,  async)

Mechanism (same as the SenseNova free twins):
  - channel.models gains the ":free" id; channel.model_mapping maps it back to
    the base id so the upstream receives the real name;
  - abilities are cloned from the base model (same channel/group);
  - ModelPrice[":free" id] = 0 for public display — billing goes through
    new-api FreeModelTwin (model/gift_models.go), which strips ":free" and
    debits the base model's price from the gift wallet first.

Idempotent: safe to re-run. Never prints channel keys.
Usage: python3 scripts/vps-add-gitee-speech-gift-twins.py [db_path]
"""
import json
import os
import re
import sqlite3
import sys
import time

TWINS = [
    "SenseVoiceSmall:free",
    "GLM-ASR:free",
    "Spark-TTS-0.5B:free",
]
BILLING_NOTE = "计费：按基础模型费率，优先扣赠送金。"


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")

    # --- locate the channel that serves each base model ---
    sql = "SELECT id, name, models FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    channels = cur.execute(sql).fetchall()

    def channel_for(base):
        for cid, name, models_s in channels:
            ms = [x.strip() for x in (models_s or "").split(",") if x.strip()]
            if base in ms:
                return cid, name, models_s or ""
        return None

    def get_opt(k):
        row = cur.execute("SELECT value FROM options WHERE key=?", (k,)).fetchone()
        return row[0] if row else "{}"

    def put_opt(k, value):
        if cur.execute("SELECT key FROM options WHERE key=?", (k,)).fetchone() is None:
            cur.execute("INSERT INTO options(key,value) VALUES (?,?)", (k, value))
        else:
            cur.execute("UPDATE options SET value=? WHERE key=?", (value, k))

    mp = json.loads(get_opt("ModelPrice"))

    for twin in TWINS:
        base = twin[: -len(":free")]

        target = channel_for(base)
        if target is None:
            raise SystemExit("no live channel serves %s — aborting" % base)
        cid, cname, models_s = target

        # 1) channel models + merged model_mapping
        parts = [p.strip() for p in models_s.split(",") if p.strip()]
        if twin not in parts:
            parts.append(twin)
            sets, vals = ["models=?"], [",".join(parts)]
            if "updated_time" in ch_cols:
                sets.append("updated_time=?")
                vals.append(now)
            vals.append(cid)
            cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
            print("channel %s (%s): added %s" % (cid, cname, twin))
        else:
            print("channel %s (%s): %s already listed" % (cid, cname, twin))

        row = cur.execute("SELECT model_mapping FROM channels WHERE id=?", (cid,)).fetchone()
        mapping = json.loads(row[0] or "{}") if row and row[0] else {}
        if mapping.get(twin) != base:
            mapping[twin] = base
            cur.execute(
                "UPDATE channels SET model_mapping=? WHERE id=?",
                (json.dumps(mapping, ensure_ascii=False, separators=(",", ":")), cid),
            )
            print("model_mapping: %s -> %s" % (twin, base))

        # 2) abilities cloned from the base model
        ab_cols = cols(cur, "abilities")
        ab_sql = 'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=?'
        base_ab = cur.execute(ab_sql, (base,)).fetchall()
        if not base_ab:
            raise SystemExit("no abilities rows for %s — aborting" % base)
        for g, ch, en, pr, wt in base_ab:
            dup = cur.execute(
                'SELECT 1 FROM abilities WHERE "group"=? AND model=? AND channel_id=?',
                (g, twin, ch),
            ).fetchone()
            if dup:
                print("ability exists: %s @ %s via channel %s" % (twin, g, ch))
                continue
            cur.execute(
                'INSERT INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                (g, twin, ch, en, pr, wt),
            )
            print("ability: %s @ %s via channel %s" % (twin, g, ch))

        # 3) models table row: clone base metadata, adjust the billing sentence
        base_row = cur.execute(
            "SELECT model_name, description, icon, tags, vendor_id, endpoints FROM models WHERE model_name=? AND (deleted_at IS NULL OR deleted_at=0)",
            (base,),
        ).fetchone() if "deleted_at" in m_cols else cur.execute(
            "SELECT model_name, description, icon, tags, vendor_id, endpoints FROM models WHERE model_name=?",
            (base,),
        ).fetchone()
        if base_row is None:
            raise SystemExit("no models row for %s — aborting" % base)
        _, desc, icon, tags, vendor_id, endpoints = base_row
        desc = re.sub(r"计费：\$[0-9.]+/次。?", BILLING_NOTE, desc or "")

        exists = cur.execute("SELECT id FROM models WHERE model_name=?", (twin,)).fetchone()
        if exists is None:
            fields = ["model_name", "description", "icon", "tags", "vendor_id", "endpoints", "status"]
            values = [twin, desc, icon, tags, vendor_id, endpoints, 1]
            if "sync_official" in m_cols:
                fields.append("sync_official"); values.append(0)
            if "created_time" in m_cols:
                fields.append("created_time"); values.append(now)
            if "updated_time" in m_cols:
                fields.append("updated_time"); values.append(now)
            # NB: deleted_at must stay NULL — gorm soft delete treats any
            # non-NULL value (incl. 0) as deleted and hides the row from
            # DB.Find, which is where /api/pricing reads model metadata.
            if "deleted_at" in m_cols:
                fields.append("deleted_at"); values.append(None)
            cur.execute(
                "INSERT INTO models(%s) VALUES (%s)" % (",".join(fields), ",".join(["?"] * len(fields))),
                values,
            )
            print("models: inserted %s (vendor_id=%s)" % (twin, vendor_id))
        else:
            sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?", "status=1"]
            vals = [desc, icon, tags, vendor_id, endpoints]
            if "updated_time" in m_cols:
                sets.append("updated_time=?"); vals.append(now)
            if "deleted_at" in m_cols:
                sets.append("deleted_at=NULL")
            vals.append(exists[0])
            cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
            print("models: revived/updated %s" % twin)

        # 4) display price $0 (billing uses the twin via FreeModelTwin)
        mp[twin] = 0
        print("ModelPrice[%s] = 0 (display)" % twin)

    put_opt("ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    conn.commit()

    for twin in TWINS:
        n = cur.execute('SELECT COUNT(*) FROM abilities WHERE model=?', (twin,)).fetchone()[0]
        print("verify %s: abilities=%d" % (twin, n))
    conn.close()
    print("DONE_ADD_SPEECH_GIFT_TWINS")


if __name__ == "__main__":
    main()