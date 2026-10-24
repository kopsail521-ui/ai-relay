#!/usr/bin/env python3
"""Fix Notice (system announcement) links in New API options table.

- Acceptable Use currently points at /user-agreement (same as Terms of
  Service); repoint it to the real AUP page /brand/aup.html.
Idempotent: safe to re-run.
"""
import json
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

OLD = "[Acceptable Use](/user-agreement)"
NEW = "[Acceptable Use](/brand/aup.html)"

conn = sqlite3.connect(DB)
cur = conn.cursor()

row = cur.execute("SELECT value FROM options WHERE key = 'Notice'").fetchone()
if not row:
    print("notice_missing (nothing to fix)")
else:
    value = row[0] or ""
    if OLD in value:
        value = value.replace(OLD, NEW)
        cur.execute(
            "UPDATE options SET value = ? WHERE key = 'Notice'", (value,)
        )
        conn.commit()
        print("notice_acceptable_use_fixed")
    elif NEW in value:
        print("notice_already_fixed")
    else:
        print("notice_no_acceptable_use_link (manual review)")

conn.close()
print("DONE_FIX_NOTICE_LINKS")
