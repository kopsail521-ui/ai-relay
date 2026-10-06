#!/usr/bin/env python3
"""Halve the sell price (ModelRatio) of all UnoRouter paid models (Keyo Chat).

Live prices are cost x2 (verified against /pricing docs); halving puts them at
cost x1 (zero margin). CompletionRatio untouched (in/out ratio preserved).
Idempotency guard: writes an options marker; a second run refuses unless
FORCE=1. Also warns (but proceeds) if any new price falls below upstream cost.

Usage:  python3 vps-halve-unorouter-paid.py [/data/one-api.db]
Revert: multiply the 13 ratios by 2 (values are printed by this script).
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

CFG = "/opt/ai-relay/config/unorouter-paid-models.json"
CFG_LOCAL = "config/unorouter-paid-models.json"
MARKER = "HalveUnorouterPaidDone"


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    cfg_path = CFG if os.path.exists(CFG) else CFG_LOCAL
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    costs = {m["id"]: (float(m["cost_in"]), float(m["cost_out"])) for m in cfg["models"]}

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    marker = cur.execute("SELECT value FROM options WHERE key=?", (MARKER,)).fetchone()
    if marker and os.environ.get("FORCE") != "1":
        raise SystemExit(
            f"already halved on {marker[0]} — refusing to halve again (FORCE=1 overrides)"
        )

    row = cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()
    if not row or not row[0]:
        raise SystemExit("ERR: ModelRatio missing")
    mr = json.loads(row[0])

    changed = 0
    skipped = 0
    for mid, (cost_in, cost_out) in sorted(costs.items()):
        if mid not in mr:
            print(f"skip_missing={mid}")
            skipped += 1
            continue
        old = float(mr[mid])
        new = round(old / 2, 6)
        price_in = round(new * 2, 4)
        price_out = round(price_in * cost_out / cost_in, 4) if cost_in else 0
        warn = "  [!] below upstream cost!" if new * 2 < cost_in - 1e-5 else ""
        mr[mid] = new
        print(f"{mid}: ratio {old} -> {new}  (price ~${price_in}/M in, ~${price_out}/M out){warn}")
        changed += 1

    cur.execute(
        "UPDATE options SET value=? WHERE key='ModelRatio'",
        (json.dumps(mr, ensure_ascii=False, separators=(",", ":")),),
    )
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    if cur.execute("SELECT key FROM options WHERE key=?", (MARKER,)).fetchone() is None:
        cur.execute("INSERT INTO options(key,value) VALUES (?,?)", (MARKER, stamp))
    else:
        cur.execute("UPDATE options SET value=? WHERE key=?", (stamp, MARKER))
    conn.commit()
    conn.close()
    print(f"halved {changed}, skipped {skipped} (marked {MARKER}={stamp})")
    if changed == 0:
        raise SystemExit("nothing changed")
    print("DONE_HALVE_UNOROUTER_PAID")


if __name__ == "__main__":
    main()
