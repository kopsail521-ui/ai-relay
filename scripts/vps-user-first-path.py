#!/usr/bin/env python3
"""Anonymized first-request path for consume users. No emails/usernames/IPs/keys."""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB = Path("/opt/ai-relay/data/new-api/one-api.db")
CONSUME, TOPUP, LOGIN = 2, 1, 7
STARTER_MODEL = "glm-5.3-flash:free"


def ts(v) -> int:
    v = int(v or 0)
    return v // 1000 if v >= 10**12 else v


def human(sec: int) -> str:
    if sec < 0:
        return f"NEG_{sec}s"
    if sec < 60:
        return f"{sec}s"
    if sec < 3600:
        return f"{sec // 60}m"
    if sec < 86400:
        return f"{sec // 3600}h{(sec % 3600) // 60}m"
    return f"{sec // 86400}d{(sec % 86400) // 3600}h"


def main() -> None:
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    ids = [
        r[0]
        for r in con.execute(
            "SELECT DISTINCT user_id FROM logs WHERE type=? AND user_id>0 ORDER BY user_id",
            (CONSUME,),
        )
    ]
    print("CONSUME_USERS", len(ids))
    rows = []
    for uid in ids:
        u = con.execute(
            "SELECT created_at, last_login_at, quota, gift_quota, request_count, "
            "github_id, discord_id, oidc_id, wechat_id, telegram_id, linux_do_id, email "
            "FROM users WHERE id=?",
            (uid,),
        ).fetchone()
        if not u:
            continue
        first = con.execute(
            "SELECT created_at, model_name, token_name, prompt_tokens, completion_tokens "
            "FROM logs WHERE type=? AND user_id=? ORDER BY created_at ASC, id ASC LIMIT 1",
            (CONSUME, uid),
        ).fetchone()
        models = [
            r[0]
            for r in con.execute(
                "SELECT model_name, MIN(created_at) FROM logs "
                "WHERE type=? AND user_id=? AND model_name IS NOT NULL AND trim(model_name)!='' "
                "GROUP BY model_name ORDER BY MIN(created_at) LIMIT 6",
                (CONSUME, uid),
            )
        ]
        n_c = con.execute(
            "SELECT COUNT(*) FROM logs WHERE type=? AND user_id=?", (CONSUME, uid)
        ).fetchone()[0]
        first_top = con.execute(
            "SELECT MIN(created_at) FROM logs WHERE type=? AND user_id=?",
            (TOPUP, uid),
        ).fetchone()[0]
        first_login = con.execute(
            "SELECT MIN(created_at) FROM logs WHERE type=? AND user_id=?",
            (LOGIN, uid),
        ).fetchone()[0]
        social = any(
            (u[k] or "").strip()
            for k in (
                "github_id",
                "discord_id",
                "oidc_id",
                "wechat_id",
                "telegram_id",
                "linux_do_id",
            )
        )
        reg = ts(u["created_at"])
        t0 = ts(first["created_at"])
        lag = t0 - reg
        top_ts = ts(first_top) if first_top else 0
        login_ts = ts(first_login) if first_login else 0
        token = (first["token_name"] or "").strip() or "(none)"
        if token.lower() == "starter":
            token = "starter"
        elif token:
            token = "named"
        rows.append(
            {
                "lag": lag,
                "social": int(social),
                "has_email": int(bool((u["email"] or "").strip())),
                "gift": int((u["gift_quota"] or 0) > 0),
                "paid": int((u["quota"] or 0) > 0),
                "req": u["request_count"] or 0,
                "n_c": n_c,
                "model": first["model_name"] or "(empty)",
                "token": token,
                "pt": first["prompt_tokens"] or 0,
                "ct": first["completion_tokens"] or 0,
                "models": ",".join(models) if models else "(empty)",
                "topup_before": int(bool(top_ts) and 0 < top_ts <= t0),
                "login_before": int(bool(login_ts) and 0 < login_ts <= t0),
                "imm5": int(0 <= lag < 300),
                "imm60": int(0 <= lag < 3600),
            }
        )
    rows.sort(key=lambda r: r["lag"])
    imm = sum(r["imm5"] for r in rows)
    hour = sum(r["imm60"] for r in rows)
    starter_tok = sum(r["token"] == "starter" for r in rows)
    starter_m = sum(r["model"] == STARTER_MODEL for r in rows)
    free_m = sum(":free" in r["model"] or r["model"].endswith("-free") for r in rows)
    print(
        "SUMMARY immediate_<5m",
        imm,
        "same_hour",
        hour,
        "token=starter",
        starter_tok,
        "model=glm-5.3-flash:free",
        starter_m,
        "any_:free",
        free_m,
    )
    for i, r in enumerate(rows, 1):
        print(
            f"PATH {i} lag={human(r['lag'])} imm5={r['imm5']} "
            f"first_model={r['model']} token={r['token']} "
            f"pt={r['pt']} ct={r['ct']} consumes={r['n_c']} "
            f"models={r['models']} social={r['social']} email={r['has_email']} "
            f"gift={r['gift']} paid={r['paid']} topup_before_first={r['topup_before']} "
            f"login_log_before={r['login_before']}"
        )
    print("DONE_FIRST_PATH")


if __name__ == "__main__":
    main()
