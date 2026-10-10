#!/usr/bin/env python3
"""Route gemini TTS models through a native Gemini channel (type 24).

Problem: upstream's OpenAI-compatible chat path returns "[audio/wav data]"
placeholder instead of audio (verified end-to-end). Upstream's NATIVE
generateContent returns real inline WAV. Our native relay passes the response
through verbatim, so: create/reuse "Keyo Audio" (type 24) channel with the
Primary donor's key/base_url, move both TTS models onto it, repoint abilities,
and set models-table endpoints to the Gemini-native path.

Idempotent. Public naming must NOT mention the supplier.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"]
AUDIO_CHANNEL_NAME = "Keyo Audio"
GEMINI_CHANNEL_TYPE = 24


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def find_primary(cur, ch_cols):
    sql = "SELECT id, name, models, base_url, `key` FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    rows = cur.execute(sql).fetchall()
    for cid, name, models, base, key in rows:
        if (name or "") == "Keyo Primary":
            return cid, name, models or "", base or "", key or ""
    for cid, name, models, base, key in rows:
        ms = [x.strip() for x in (models or "").split(",") if x.strip()]
        if "gemini-3.8-flash" in ms or "gemini-3.1-flash-tts-preview" in ms:
            return cid, name, models or "", base or "", key or ""
    raise SystemExit("donor channel (Keyo Primary) not found")


def find_audio_channel(cur, ch_cols):
    sql = "SELECT id, name, models, type, base_url, `key` FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    rows = cur.execute(sql).fetchall()
    for cid, name, models, typ, base, key in rows:
        if (name or "") == AUDIO_CHANNEL_NAME:
            return cid, name, models or "", base or "", key or ""
    for cid, name, models, typ, base, key in rows:
        ms = [x.strip() for x in (models or "").split(",") if x.strip()]
        if int(typ or 0) == GEMINI_CHANNEL_TYPE and "gemini-3.8-flash-tts" in ms:
            return cid, name, models or "", base or "", key or ""
    return None


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    pcid, pname, pmodels, pbase, pkey = find_primary(cur, ch_cols)
    print("donor", pcid, pname)

    audio = find_audio_channel(cur, ch_cols)
    if audio is None:
        fields, values = [], []
        spec = {
            "type": GEMINI_CHANNEL_TYPE,
            "key": pkey,
            "name": AUDIO_CHANNEL_NAME,
            "base_url": pbase,
            "models": ",".join(TTS_MODELS),
            "group": "default",
            "status": 1,
        }
        if "created_time" in ch_cols:
            spec["created_time"] = now
        if "updated_time" in ch_cols:
            spec["updated_time"] = now
        for col, val in spec.items():
            if col in ch_cols:
                fields.append('"group"' if col == "group" else col)
                values.append(val)
        cur.execute(
            "INSERT INTO channels(%s) VALUES (%s)"
            % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        acid = cur.lastrowid
        print("audio channel created", acid)
    else:
        acid, aname, amodels, abase, akey = audio
        parts = [p.strip() for p in amodels.replace("\n", ",").split(",") if p.strip()]
        added = [m for m in TTS_MODELS if m not in parts]
        merged = ",".join(([m for m in TTS_MODELS if m not in parts] + parts) or parts)
        sets, vals = ["models=?"], [merged]
        if pkey and "key" in ch_cols:
            sets.append("`key`=?")
            vals.append(pkey)
        if pbase and "base_url" in ch_cols:
            sets.append("base_url=?")
            vals.append(pbase)
        if "status" in ch_cols:
            sets.append("status=1")
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(acid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("audio channel reused", acid, aname, "added", added or "(none)")

    # remove TTS models from the donor channel list (placeholder path)
    parts = [p.strip() for p in pmodels.replace("\n", ",").split(",") if p.strip()]
    kept = [p for p in parts if p not in TTS_MODELS]
    if kept != parts:
        sets, vals = ["models=?"], [",".join(kept)]
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(pcid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("donor models trimmed", pcid, "removed", [p for p in parts if p not in kept])
    else:
        print("donor models already clean")

    # abilities -> audio channel, preserving each model's existing groups
    if "abilities" in tabs:
        for mid in TTS_MODELS:
            groups = [
                r[0]
                for r in cur.execute(
                    'SELECT DISTINCT "group" FROM abilities WHERE model=?', (mid,)
                ).fetchall()
            ] or ["default"]
            cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
            for g in groups:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    (g, mid, acid, 1, 0, 1),
                )
            print("abilities repointed", mid, "groups", groups, "->", acid)

    # marketplace meta: gemini-native endpoint
    if "endpoints" in m_cols:
        for mid in TTS_MODELS:
            ep = json.dumps(
                {"gemini": "/v1beta/models/%s:generateContent" % mid},
                separators=(",", ":"),
            )
            cur.execute("UPDATE models SET endpoints=? WHERE model_name=?", (ep, mid))
            print("endpoints set", mid, ep)

    conn.commit()
    conn.close()
    print("DONE_FIX_GEMINI_TTS_NATIVE")


if __name__ == "__main__":
    main()