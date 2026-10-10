#!/usr/bin/env python3
"""Re-vendor keyo-flash2:free (and its hidden twin) to the Keyo vendor.

The listing originally attached vendor '其他'; brand-wise both rows belong to
Keyo. Only vendor_id is touched — twin stays soft-deleted/hidden.
"""
from __future__ import annotations

import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
VENDOR = "Keyo"
ICON = "Custom"
MODELS = ["keyo-flash2:free", "keyo-flash2"]

con = sqlite3.connect(DB)
cur = con.cursor()
now = int(time.time())
v_cols = {r[1] for r in cur.execute("PRAGMA table_info(vendors)")}
m_cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}

row = cur.execute("SELECT id FROM vendors WHERE name=?", (VENDOR,)).fetchone()
if row:
    vid = row[0]
    print("vendor_exists", VENDOR, vid)
else:
    fields = ["name"]
    values = [VENDOR]
    if "icon" in v_cols:
        fields.append("icon")
        values.append(ICON)
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
    vid = cur.lastrowid
    print("vendor_created", VENDOR, vid)

for mid in MODELS:
    r = cur.execute(
        "SELECT id, vendor_id FROM models WHERE model_name=?", (mid,)
    ).fetchone()
    if r is None:
        print("model_missing", mid)
        continue
    sets = ["vendor_id=?"]
    vals = [vid]
    if "updated_time" in m_cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(r[0])
    cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
    print("re-vendored", mid, r[1], "->", vid)

# self-check before commit
for mid in MODELS:
    chk = cur.execute(
        "SELECT v.name FROM models m LEFT JOIN vendors v ON m.vendor_id=v.id "
        "WHERE m.model_name=? ORDER BY m.id LIMIT 1",
        (mid,),
    ).fetchone()
    if chk is None:
        continue  # twin may legitimately be absent on fresh installs
    assert chk[0] == VENDOR, "vendor mismatch for %s: %r" % (mid, chk[0])
    print("check_ok", mid, chk[0])

con.commit()
con.close()
print("DONE_FIX_FLASH2_VENDOR")
