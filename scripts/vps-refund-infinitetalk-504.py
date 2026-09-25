#!/usr/bin/env python3
"""One-shot refund: InfiniteTalk log charged without pollable task_id
(submission_status_unknown / use_time=0).

Default targets the 2026-09-25 ~20:41 incident (~$0.342466 flat).

Usage on VPS:
  sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:ro \\
    -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay \\
    python:3.12-alpine python scripts/vps-refund-infinitetalk-504.py /data/one-api.db

Optional:
  ... vps-refund-infinitetalk-504.py /data/one-api.db --dry-run
  ... vps-refund-infinitetalk-504.py /data/one-api.db --after 2026-09-25T12:00:00Z --before 2026-09-25T13:00:00Z
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone

# Flat InfiniteTalk sell ≈ $0.342466 → quota at QUOTA_PER_USD=500000
EXPECTED_QUOTA = 171233  # round(0.342466 * 500000)


def parse_ts(s: str) -> int:
    if s.isdigit():
        return int(s)
    s = s.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("db", nargs="?", default="/data/one-api.db")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--after",
        default="2026-09-25T12:35:00+00:00",
        help="UTC lower bound (default ~20:35 CST)",
    )
    ap.add_argument(
        "--before",
        default="2026-09-25T13:00:00+00:00",
        help="UTC upper bound (default ~21:00 CST)",
    )
    ap.add_argument("--quota", type=int, default=EXPECTED_QUOTA)
    args = ap.parse_args()

    after = parse_ts(args.after)
    before = parse_ts(args.before)
    con = sqlite3.connect(args.db)
    cur = con.cursor()

    rows = cur.execute(
        """
        SELECT rowid, user_id, token_id, quota, content, created_at, request_id
        FROM logs
        WHERE model_name = 'InfiniteTalk'
          AND type = 2
          AND quota > 0
          AND created_at >= ?
          AND created_at < ?
          AND (use_time = 0 OR use_time IS NULL)
        ORDER BY created_at
        """,
        (after, before),
    ).fetchall()

    if not rows:
        print("no_matching_logs")
        print("DONE_REFUND_INFINITETALK_504")
        return

    for rowid, user_id, token_id, quota, content, created_at, request_id in rows:
        ts = datetime.fromtimestamp(created_at, tz=timezone.utc).isoformat()
        print(
            "candidate",
            "rowid",
            rowid,
            "user",
            user_id,
            "token",
            token_id,
            "quota",
            quota,
            "at",
            ts,
            "req",
            request_id,
        )
        if args.quota and abs(quota - args.quota) > 2:
            print("skip_quota_mismatch want", args.quota)
            continue
        if args.dry_run:
            print("dry_run skip refund")
            continue

        cur.execute("BEGIN")
        cur.execute(
            "UPDATE users SET quota = quota + ?, used_quota = MAX(0, used_quota - ?) WHERE id = ?",
            (quota, quota, user_id),
        )
        tok = cur.execute(
            "SELECT unlimited_quota FROM tokens WHERE id = ?", (token_id,)
        ).fetchone()
        if tok and not tok[0]:
            cur.execute(
                "UPDATE tokens SET remain_quota = remain_quota + ?, used_quota = MAX(0, used_quota - ?) WHERE id = ?",
                (quota, quota, token_id),
            )
        note = " (refunded: submission_status_unknown)"
        if request_id:
            cur.execute(
                "UPDATE logs SET quota = 0, content = content || ? WHERE request_id = ?",
                (note, request_id),
            )
        else:
            cur.execute(
                "UPDATE logs SET quota = 0, content = content || ? WHERE rowid = ?",
                (note, rowid),
            )
        con.commit()
        print("refunded", quota, "user", user_id)

    print("DONE_REFUND_INFINITETALK_504")
    con.close()


if __name__ == "__main__":
    main()
