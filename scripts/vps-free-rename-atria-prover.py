#!/usr/bin/env python3
"""B 方案落地：Atria-dawn-v2 / DeepSeek-Prover-V2-7B 改造为 :free 双轨。

在服务裸名的渠道上追加 :free 别名（model_mapping 转回上游原名），
为 :free 名建 models / abilities 行，删掉裸名 ModelPrice=0（它会短路
孪生计费），并幂等重申全部免费池孪生计价。可重复执行。

用法（VPS）：
  sudo python3 /opt/ai-relay/scripts/vps-free-rename-atria-prover.py
  sudo docker restart ai-relay-new-api
"""
import json
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))

RENAMES = [
    ("Atria-dawn-v2:free", "Atria-dawn-v2", "Atria", "Custom"),
    ("DeepSeek-Prover-V2-7B:free", "DeepSeek-Prover-V2-7B", "DeepSeek", "DeepSeek"),
]
UNOROUTER_TWINS = [
    "k2-horizon", "space-bunny-alpha", "nemotron-3-ultra-550b-a55b",
    "gemma-4-26b", "laguna-s-2.1", "qwen3.6-35b-a3b",
    "nemotron-3-super-120b-a12b", "ling-3.0-flash-fin", "qwen3.8-27b",
    "nemotron-3.5-lightning-30b-a3b", "gemini-robotics-er-2-preview",
    "nemotron-3.5-lightning", "dots-3-note-preview", "gemma-4-31b-it",
    "step-3.7-flash", "mistral-large-3-675b", "muse-glimmer-30b",
]
GLM_TWINS = [
    "glm-5.3-flash", "glm-5.3-flash-search",
    "glm-5.3-flash-thinking", "glm-5.3-flash-think-search",
]
FB_R, FB_C = 0.005, 4.0
GLM_R, GLM_C = 0.10767, 3.333296


def cols(cur, table):
    return [r[1] for r in cur.execute("pragma table_info(%s)" % table)]


def ensure_vendor(cur, v_cols, name, icon, now):
    cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    fields, values = ["name"], [name]
    if "icon" in v_cols:
        fields.append("icon")
        values.append(icon or "Custom")
    if "created_time" in v_cols:
        fields.append("created_time")
        values.append(now)
    if "updated_time" in v_cols:
        fields.append("updated_time")
        values.append(now)
    cur.execute(
        "INSERT INTO vendors(%s) VALUES (%s)" % (",".join(fields), ",".join(["?"] * len(fields))),
        values,
    )
    return cur.lastrowid


def upsert_model(cur, m_cols, mid, desc, icon, tags, vid, now):
    sql = "SELECT id FROM models WHERE model_name=?"
    if "deleted_at" in m_cols:
        sql += " AND deleted_at IS NULL"
    cur.execute(sql, (mid,))
    row = cur.fetchone()
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
            "INSERT INTO models(%s) VALUES (%s)" % (",".join(fields), ",".join(["?"] * len(fields))),
            values,
        )
        print("models row created:", mid)
    else:
        sets = ["description=?", "icon=?", "tags=?", "vendor_id=?", "endpoints=?"]
        vals = [desc, icon, tags, vid, EP]
        if "status" in m_cols:
            sets.append("status=1")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(row[0])
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        print("models row updated:", mid)


def get_opt(cur, k):
    cur.execute("SELECT value FROM options WHERE key=?", (k,))
    row = cur.fetchone()
    return row[0] if row else "{}"


def put_opt(cur, k, value):
    cur.execute("SELECT key FROM options WHERE key=?", (k,))
    if cur.fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES (?,?)", (k, value))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (value, k))


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    # 1) channels：models 追加 :free 名 + model_mapping 映射回裸名
    sql = "SELECT id, name, models, model_mapping FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    targets = [r for r in cur.fetchall() if "Atria-dawn-v2" in (r[2] or "")]
    assert targets, "no channel serves Atria-dawn-v2 — check channels.models"
    for cid, name, models_s, mapping_s in targets:
        parts = [p.strip() for p in (models_s or "").split(",") if p.strip()]
        mapping = json.loads(mapping_s) if mapping_s else {}
        for new, old, _v, _i in RENAMES:
            if new not in parts:
                parts.append(new)
            mapping[new] = old
        sets = ["models=?", "model_mapping=?"]
        vals = [",".join(parts), json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))]
        if "updated_time" in ch_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(cid)
        cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
        print("channel updated:", cid, name)

    # 2) models 行（没有裸名行可抄，直接按 add-free 范式建）
    for new, _old, vendor, icon in RENAMES:
        vid = ensure_vendor(cur, v_cols, vendor, icon, now)
        upsert_model(cur, m_cols, new, new, icon, "大语言模型", vid, now)

    # 3) abilities：挂到服务裸名的同一批渠道
    for new, old, _v, _i in RENAMES:
        cur.execute("DELETE FROM abilities WHERE model=?", (new,))
        cur.execute("SELECT DISTINCT channel_id FROM abilities WHERE model=?", (old,))
        chs = [r[0] for r in cur.fetchall()]
        if not chs:
            chs = [t[0] for t in targets]
        for cid2 in chs:
            cur.execute(
                'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight)'
                " VALUES (?,?,?,?,?,?)",
                ("default", new, cid2, 1, 0, 1),
            )
        print("abilities:", new, "->", chs)

    # 4) options：删裸名 price=0（孪生计费短路源）；:free 挂展示价 0；孪生价全量重申
    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    for new, old, _v, _i in RENAMES:
        if old in mp:
            del mp[old]
            print("removed ModelPrice short-circuit:", old)
        mp[new] = 0
        mr[old] = FB_R
        cr[old] = FB_C
    for n in UNOROUTER_TWINS:
        mr[n] = FB_R
        cr[n] = FB_C
    for n in GLM_TWINS:
        mr[n] = GLM_R
        cr[n] = GLM_C
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))
    print("ratios asserted: 2 bare + %d fallback + %d glm twins" % (len(UNOROUTER_TWINS), len(GLM_TWINS)))

    conn.commit()
    conn.close()
    print("DONE_FREE_RENAME")


if __name__ == "__main__":
    main()
