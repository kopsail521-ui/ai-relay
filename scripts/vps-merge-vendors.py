#!/usr/bin/env python3
"""Merge duplicate vendors (Alibaba→阿里巴巴) and duplicate「其他」rows."""
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
# keep → absorb
MERGES = [
    ("阿里巴巴", ["Alibaba", "Qwen", "通义"]),
    ("其他", ["Other", "模力方舟"]),
]


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    c = cols(cur, "vendors")
    soft = "deleted_at" in c

    def find(name):
        if soft:
            cur.execute(
                "SELECT id FROM vendors WHERE name=? AND deleted_at IS NULL LIMIT 1",
                (name,),
            )
        else:
            cur.execute("SELECT id FROM vendors WHERE name=? LIMIT 1", (name,))
        row = cur.fetchone()
        return row[0] if row else None

    def all_named(name):
        if soft:
            cur.execute(
                "SELECT id FROM vendors WHERE name=? AND deleted_at IS NULL", (name,)
            )
        else:
            cur.execute("SELECT id FROM vendors WHERE name=?", (name,))
        return [r[0] for r in cur.fetchall()]

    for keep_name, absorb_names in MERGES:
        keep = find(keep_name)
        if keep is None:
            # promote first absorb if keep missing
            for a in absorb_names:
                keep = find(a)
                if keep:
                    cur.execute("UPDATE vendors SET name=? WHERE id=?", (keep_name, keep))
                    print("renamed", a, "->", keep_name, "id", keep)
                    break
        if keep is None:
            print("skip missing keep", keep_name)
            continue

        for a in absorb_names:
            for vid in all_named(a):
                if vid == keep:
                    continue
                cur.execute("UPDATE models SET vendor_id=? WHERE vendor_id=?", (keep, vid))
                n = cur.rowcount
                if soft:
                    cur.execute(
                        "UPDATE vendors SET deleted_at=datetime('now') WHERE id=?", (vid,)
                    )
                else:
                    cur.execute("UPDATE vendors SET status=0 WHERE id=?", (vid,))
                print("merged", a, "id", vid, "->", keep_name, "models", n)

        # duplicate keep_name rows
        ids = all_named(keep_name)
        for vid in ids[1:]:
            cur.execute("UPDATE models SET vendor_id=? WHERE vendor_id=?", (ids[0], vid))
            if soft:
                cur.execute(
                    "UPDATE vendors SET deleted_at=datetime('now') WHERE id=?", (vid,)
                )
            else:
                cur.execute("UPDATE vendors SET status=0 WHERE id=?", (vid,))
            print("dedupe", keep_name, vid, "->", ids[0])

    conn.commit()
    print("DONE_MERGE_VENDORS")


if __name__ == "__main__":
    main()
