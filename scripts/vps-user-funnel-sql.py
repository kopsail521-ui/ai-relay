#!/usr/bin/env python3
"""Aggregate-only user hygiene (no emails/usernames/IPs). Patch Browse Models CTAs."""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path("/opt/ai-relay")
DB = Path("/opt/ai-relay/data/new-api/one-api.db")
OLD = 'href="/pricing">Browse Models'
NEW = 'href="/models">Browse Models'


def patch_cta() -> None:
    for rel in ("static/seo/index.html", "static/seo/about.html"):
        p = ROOT / rel
        if not p.is_file():
            print("MISSING", rel)
            continue
        t = p.read_text(encoding="utf-8")
        n = t.count(OLD)
        p.write_text(t.replace(OLD, NEW), encoding="utf-8")
        print("CTA", rel, "replaced", n)


def cols(con, table: str) -> set[str]:
    return {r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()}


def main() -> None:
    patch_cta()
    if not DB.is_file():
        print("NO_DB", DB)
        return
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    uc = cols(con, "users")
    print("USERS_COLS", ",".join(sorted(uc)))
    where = "deleted_at IS NULL" if "deleted_at" in uc else "1=1"

    def q(sql, args=()):
        return con.execute(sql, args).fetchall()

    total = q(f"SELECT COUNT(*) FROM users WHERE {where}")[0][0]
    print("USERS_TOTAL", total)

    created = "created_at" if "created_at" in uc else None
    if created:
        mx = q(f"SELECT MAX({created}) FROM users WHERE {where}")[0][0] or 0
        unit = "'unixepoch'" if mx and mx < 10**12 else "'unixepoch','subsecond'"
        if mx and mx >= 10**12:
            day_sql = f"date({created}/1000, 'unixepoch')"
            hour_sql = f"strftime('%Y-%m-%d %H', {created}/1000, 'unixepoch')"
        else:
            day_sql = f"date({created}, 'unixepoch')"
            hour_sql = f"strftime('%Y-%m-%d %H', {created}, 'unixepoch')"
        print("CREATED_MAX", mx, "DAY_EXPR", day_sql)
        print("BY_DAY")
        for d, n in q(
            f"SELECT {day_sql} d, COUNT(*) n FROM users WHERE {where} GROUP BY d ORDER BY n DESC LIMIT 15"
        ):
            print(" ", d, n)
        print("BY_HOUR_TOP")
        for h, n in q(
            f"SELECT {hour_sql} h, COUNT(*) n FROM users WHERE {where} GROUP BY h ORDER BY n DESC LIMIT 10"
        ):
            print(" ", h, n)

    if "email" in uc:
        empty = q(
            f"SELECT COUNT(*) FROM users WHERE {where} AND (email IS NULL OR trim(email)='')"
        )[0][0]
        print("EMAIL_EMPTY", empty, "PCT", round(100.0 * empty / total, 1) if total else 0)
        print("EMAIL_DOM_TOP")
        for dom, n in q(
            f"""
            SELECT CASE WHEN email IS NULL OR trim(email)='' THEN '(empty)'
              ELSE lower(substr(email, instr(email,'@')+1)) END dom, COUNT(*) n
            FROM users WHERE {where} GROUP BY dom ORDER BY n DESC LIMIT 15
            """
        ):
            print(" ", dom, n)

    social_cols = [
        c
        for c in (
            "github_id",
            "discord_id",
            "oidc_id",
            "wechat_id",
            "telegram_id",
            "linux_do_id",
        )
        if c in uc
    ]
    if social_cols:
        parts = " AND ".join(
            f"({c} IS NULL OR trim({c})='')" for c in social_cols
        )
        pw = q(f"SELECT COUNT(*) FROM users WHERE {where} AND {parts}")[0][0]
        print("PASSWORD_OR_OTHER", pw, "SOCIAL_ANY", total - pw)

    if "request_count" in uc:
        rc = q(f"SELECT COUNT(*) FROM users WHERE {where} AND request_count>0")[0][0]
        print("REQUEST_COUNT_GT0", rc)
    if "used_quota" in uc:
        uq = q(f"SELECT COUNT(*) FROM users WHERE {where} AND used_quota>0")[0][0]
        print("USED_QUOTA_GT0", uq)
    if "quota" in uc:
        paid = q(f"SELECT COUNT(*) FROM users WHERE {where} AND quota>0")[0][0]
        print("QUOTA_GT0", paid)
    if "gift_quota" in uc:
        gq = q(f"SELECT COUNT(*) FROM users WHERE {where} AND gift_quota>0")[0][0]
        print("GIFT_QUOTA_GT0", gq)

    if "username" in uc:
        randish = q(
            f"""
            SELECT COUNT(*) FROM users WHERE {where}
              AND length(username)>=10
              AND username NOT LIKE '%@%'
              AND username GLOB '*[0-9]*'
              AND username GLOB '*[a-zA-Z]*'
            """
        )[0][0]
        print("USERNAME_LEN10_ALNUM", randish)

    lc = cols(con, "logs") if "logs" in {r[0] for r in q("SELECT name FROM sqlite_master WHERE type='table'")} else set()
    if lc:
        consume = 2
        topup = 1
        if "user_id" in lc and "type" in lc:
            c_users = q(
                f"SELECT COUNT(DISTINCT user_id) FROM logs WHERE type={consume} AND user_id>0"
            )[0][0]
            t_users = q(
                f"SELECT COUNT(DISTINCT user_id) FROM logs WHERE type={topup} AND user_id>0"
            )[0][0]
            print("LOG_CONSUME_USERS", c_users, "LOG_TOPUP_USERS", t_users)
        if "ip" in lc and "user_id" in lc:
            shared = q(
                """
                SELECT COUNT(*) FROM (
                  SELECT ip FROM logs
                  WHERE ip IS NOT NULL AND trim(ip)!='' AND user_id>0
                  GROUP BY ip HAVING COUNT(DISTINCT user_id)>=8
                )
                """
            )[0][0]
            print("IPS_WITH_8PLUS_USERS", shared)
    print("DONE_USER_FUNNEL")


if __name__ == "__main__":
    main()
