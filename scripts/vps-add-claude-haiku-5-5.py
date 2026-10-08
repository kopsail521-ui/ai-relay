#!/usr/bin/env python3
"""List OpenLux claude-haiku-5-5 on Keyo at cost × 2.5, on all three Claude groups.

Upstream (OpenLux, checked 2026-10-08): model_ratio 0.05, completion_ratio 5,
enable_groups = AWS-Bedrock-2 / AWS-Claude-2 / Claude-Code-2 — there is NO
Claude-Code-1 for this model, so the cheapest cost basis is Claude-Code-2
(group_ratio 0.29412):
  cost_in  = 0.05 * 2 * 0.29412 = 0.029412 $/1M
  cost_out = cost_in * 5         = 0.147060 $/1M
Sell ×2.5 → 0.073530 / 0.367650
New API: model_ratio = sell_in / 2 = 0.036765 ; completion_ratio = 5

Groups: Keyo mirrors the OpenLux group names, so the channel's group field is
"default,Claude-Code-2,AWS-Bedrock-2" and abilities get one row per group
(GroupRatio: CC2 = 0.29412/0.17647 ≈ 1.666686, AB2 = 0.58824/0.17647 ≈ 3.333371).
Abilities are cloned from claude-sonnet-5-5, which already carries all three.

Public copy must not name the supplier.
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
EP = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))

MODEL = {
    "id": "claude-haiku-5-5",
    "cost_in": 0.029412,
    "cost_out": 0.14706,
    "markup": 2.5,
    "vendor": "Anthropic",
    "icon": "Claude.Color",
    "desc": "Claude Haiku 5.5：5.5 系列中最快最省的轻量模型，1M 上下文，适合分类、提取与批量子任务。",
    "ability_src": "claude-sonnet-5-5",
}

GROUP_CC2 = "Claude-Code-2"
GROUP_AB2 = "AWS-Bedrock-2"
RATIO_CC2 = round(0.29412 / 0.17647, 6)
RATIO_AB2 = round(0.58824 / 0.17647, 6)


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


def main():
    m = MODEL
    mid = m["id"]
    con = sqlite3.connect(DB)
    cur = con.cursor()
    now = int(time.time())
    ch_cols = cols(cur, "channels")
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")
    tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    # 0) GroupRatio / UserUsableGroups must carry the two Claude groups
    #    (normally a one-time setup from vps-add-claude-groups.py; ensure anyway).
    gr = json.loads(get_opt(cur, "GroupRatio") or "{}")
    gr.setdefault("default", 1)
    gr.setdefault("vip", 1)
    gr[GROUP_CC2] = RATIO_CC2
    gr[GROUP_AB2] = RATIO_AB2
    put_opt(cur, "GroupRatio", json.dumps(gr, ensure_ascii=False, separators=(",", ":")))
    ug = json.loads(get_opt(cur, "UserUsableGroups") or "{}")
    ug.setdefault("default", "Default")
    ug.setdefault("vip", "VIP")
    ug[GROUP_CC2] = GROUP_CC2
    ug[GROUP_AB2] = GROUP_AB2
    put_opt(cur, "UserUsableGroups", json.dumps(ug, ensure_ascii=False, separators=(",", ":")))
    print("GroupRatio", {k: gr[k] for k in ("default", GROUP_CC2, GROUP_AB2)})

    # 1) OpenLux channel: add the model, make sure the group field covers all three
    sql = "SELECT id, name, models, base_url, \"group\" FROM channels"
    if "deleted_at" in ch_cols:
        sql += " WHERE deleted_at IS NULL"
    cur.execute(sql)
    channels = cur.fetchall()

    target = None
    for cid, name, models, base, grp in channels:
        blob = ((name or "") + " " + (base or "")).lower()
        if "openlux" in blob:
            target = (cid, name, models or "", grp or "")
            break
    if target is None:
        raise SystemExit("OpenLux channel not found")
    cid, cname, models_s, grp_s = target

    parts = [p.strip() for p in models_s.split(",") if p.strip()]
    if mid not in parts:
        parts.append(mid)
        print("channel_add", mid)
    else:
        print("channel_has", mid)
    groups = [g.strip() for g in grp_s.split(",") if g.strip()]
    for g in ("default", GROUP_CC2, GROUP_AB2):
        if g not in groups:
            groups.append(g)
            print("channel_group_add", g)
    sets = ["models=?", '"group"=?']
    vals = [",".join(parts), ",".join(groups)]
    if "updated_time" in ch_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(cid)
    cur.execute("UPDATE channels SET %s WHERE id=?" % ",".join(sets), vals)
    print("channel", cid, cname, "groups", ",".join(groups))

    # 2) Pricing: ModelRatio/CompletionRatio (token-billed), no ModelPrice
    sell_in = round(m["cost_in"] * m["markup"], 6)
    sell_out = round(m["cost_out"] * m["markup"], 6)
    ratio = round(sell_in / 2.0, 6)
    comp = round(sell_out / sell_in, 6) if sell_in else 1.0

    mr = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    mp = json.loads(get_opt(cur, "ModelPrice") or "{}")
    mr[mid] = ratio
    cr[mid] = comp
    mp.pop(mid, None)
    put_opt(cur, "ModelRatio", json.dumps(mr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "CompletionRatio", json.dumps(cr, ensure_ascii=False, separators=(",", ":")))
    put_opt(cur, "ModelPrice", json.dumps(mp, ensure_ascii=False, separators=(",", ":")))

    # 3) Marketplace row
    vid = ensure_vendor(cur, v_cols, m["vendor"], m["icon"], now)
    upsert_model(cur, m_cols, mid, m["desc"], m["icon"], "大语言模型", vid, now)

    # 4) Abilities on all three groups, cloned from the sibling model
    if "abilities" in tabs:
        ab_src = cur.execute(
            'SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=?',
            (m["ability_src"],),
        ).fetchall()
        cur.execute("DELETE FROM abilities WHERE model=?", (mid,))
        if ab_src:
            for g, _ch, en, pri, w in ab_src:
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    (g, mid, cid, en, pri, w),
                )
        else:
            # sibling missing — fall back to seeding all three groups explicitly
            for g in ("default", GROUP_CC2, GROUP_AB2):
                cur.execute(
                    'INSERT OR IGNORE INTO abilities("group", model, channel_id, enabled, priority, weight) VALUES (?,?,?,?,?,?)',
                    (g, mid, cid, 1, 0, 1),
                )
                print("ability_fallback", g)

    # 5) Self-check BEFORE commit: ratio landed, marketplace live, three groups present.
    #    (A previous relist silently lost its pricing to a bad option write — verify here.)
    problems = []
    mr2 = json.loads(get_opt(cur, "ModelRatio") or "{}")
    cr2 = json.loads(get_opt(cur, "CompletionRatio") or "{}")
    if mr2.get(mid) != ratio:
        problems.append("ModelRatio not %r (got %r)" % (ratio, mr2.get(mid)))
    if cr2.get(mid) != comp:
        problems.append("CompletionRatio not %r (got %r)" % (comp, cr2.get(mid)))
    if "abilities" in tabs:
        got = {
            g
            for (g,) in cur.execute(
                'SELECT "group" FROM abilities WHERE model=? AND channel_id=?', (mid, cid)
            )
        }
        for want in ("default", GROUP_CC2, GROUP_AB2):
            if want not in got:
                problems.append("abilities missing group %s" % want)
        print("ability_groups", sorted(got))
    if problems:
        con.rollback()
        con.close()
        raise SystemExit("ABORT: " + "; ".join(problems))

    print(
        "price",
        mid,
        "cost",
        m["cost_in"],
        "/",
        m["cost_out"],
        "markup",
        m["markup"],
        "sell",
        sell_in,
        "/",
        sell_out,
        "ratio",
        ratio,
        "comp",
        comp,
    )
    con.commit()
    con.close()
    print("DONE_ADD_CLAUDE_HAIKU_5_5")


if __name__ == "__main__":
    main()
