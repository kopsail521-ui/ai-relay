#!/usr/bin/env python3
"""Inspect models/vendors schema + current order helpers."""
import json
import os
import sqlite3
import sys


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db):
        raise SystemExit("DB not found: " + db)
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    out = {}
    for table in ("models", "vendors"):
        cur.execute("PRAGMA table_info(%s)" % table)
        out[table + "_cols"] = [r[1] for r in cur.fetchall()]
    cur.execute("SELECT id, name FROM vendors ORDER BY id")
    out["vendors"] = [{"id": i, "name": n} for i, n in cur.fetchall()]
    # sample models
    cols = set(out["models_cols"])
    fields = ["id", "model_name", "vendor_id", "tags"]
    if "display_order" in cols:
        fields.append("display_order")
    if "pinned" in cols:
        fields.append("pinned")
    cur.execute(
        "SELECT %s FROM models %s ORDER BY id DESC LIMIT 15"
        % (
            ",".join(fields),
            "WHERE deleted_at IS NULL" if "deleted_at" in cols else "",
        )
    )
    out["sample_models"] = [dict(zip(fields, row)) for row in cur.fetchall()]
    conn.close()
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
