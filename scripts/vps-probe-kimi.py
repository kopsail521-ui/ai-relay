#!/usr/bin/env python3
"""
Field probe script for measuring real gateway performance on kimi-k3.

Measures:
  - TTFT (Time to First Token) via streaming
  - End-to-end latency
  - Completion throughput (tokens / second)
  - Success rate / Uptime / Error rate

Creates a throwaway quota user in new-api SQLite DB, runs probe requests
against the public https://www.keyoapi.xyz endpoint, records exact percentiles,
writes results to /opt/ai-relay/static/brand/probe-kimi-k3.json, and cleans up.
"""

import json
import math
import os
import secrets
import sqlite3
import string
import sys
import time
import urllib.error
import urllib.request

BASE_URL = "https://www.keyoapi.xyz"
DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
OUTPUT_PATH = sys.argv[2] if len(sys.argv) > 2 else "/opt/ai-relay/static/brand/probe-kimi-k3.json"

PROBE_USERNAME = "probekimi"
PROBE_PASSWORD_HASH = "$2b$10$JsxNrvp2oHBiKDJIIzINR.5NnH6BBnFXfrIyg0NygKMjKjuqx5QpK"
PROBE_QUOTA = 10_000_000  # $20 quota for paid calls
PROBE_TOKEN_NAME = "probe-kimi-k3-field"

MODEL_ID = "kimi-k3"

PROMPTS = [
    "Write a quick Python function to reverse a string and explain it.",
    "Explain the difference between TCP and UDP in 3 short bullet points.",
    "Count from 1 to 20 separated by commas.",
    "What are the primary benefits of an API gateway relay?",
    "Write a TypeScript interface for a User object with id, name, and email.",
    "Explain what TTFT means in LLM inference benchmarks in two sentences.",
    "Give three tips for optimizing prompt tokens in agentic workflows.",
    "Write a small SQL query to find top 5 highest-spending customers.",
    "List four key differences between synchronous and asynchronous API calls.",
    "Explain what a 256K context window enables for code repositories."
]


def db_connect():
    conn = sqlite3.connect(DB_PATH, timeout=60)
    conn.execute("PRAGMA busy_timeout=60000")
    conn.row_factory = sqlite3.Row
    return conn


def table_columns(conn, table):
    return {row["name"] for row in conn.execute("PRAGMA table_info(%s)" % table)}


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def setup_user_and_token(conn):
    conn.execute("DELETE FROM tokens WHERE user_id IN (SELECT id FROM users WHERE username=?)", (PROBE_USERNAME,))
    conn.execute("DELETE FROM users WHERE username=?", (PROBE_USERNAME,))

    cols = table_columns(conn, "users")
    fields = {
        "username": PROBE_USERNAME,
        "password": PROBE_PASSWORD_HASH,
        "role": 1,
        "status": 1,
        "quota": PROBE_QUOTA,
        "gift_quota": 0,
        "used_quota": 0,
        "request_count": 0,
        "group": "default",
        "created_at": int(time.time()),
        "last_login_at": 0,
        "auth_version": 1,
        "setting": "",
        "remark": "probe test user, temporary",
    }
    names = [c for c in fields if c in cols]
    values = [fields[c] for c in names]
    cur = conn.execute(
        "INSERT INTO users (%s) VALUES (%s)"
        % (", ".join(quote(c) for c in names), ", ".join("?" * len(names))),
        values,
    )
    uid = cur.lastrowid

    raw_key = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(48))
    tcols = table_columns(conn, "tokens")
    tfields = {
        "user_id": uid,
        "key": raw_key,
        "status": 1,
        "name": PROBE_TOKEN_NAME,
        "created_time": int(time.time()),
        "accessed_time": 0,
        "expired_time": -1,
        "remain_quota": PROBE_QUOTA,
        "unlimited_quota": 0,
        "model_limits_enabled": 0,
        "model_limits": "",
        "allow_ips": "",
        "used_quota": 0,
        "group": "default",
        "cross_group_retry": 0,
        "auto_groups": "",
    }
    tnames = [c for c in tfields if c in tcols]
    tvalues = [tfields[c] for c in tnames]
    conn.execute(
        "INSERT INTO tokens (%s) VALUES (%s)"
        % (", ".join(quote(c) for c in tnames), ", ".join("?" * len(tvalues))),
        tvalues,
    )
    conn.commit()
    return uid, "sk-" + raw_key


def cleanup(conn, uid):
    conn.execute("DELETE FROM tokens WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    conn.commit()


def run_streaming_probe(api_key, prompt, max_tokens=150):
    url = f"{BASE_URL}/v1/chat/completions"
    payload = json.dumps({
        "model": MODEL_ID,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "max_tokens": max_tokens
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "KeyoAPI-FieldProbe/1.0"
        }
    )

    t0 = time.perf_counter()
    ttft = None
    token_count = 0
    full_content = []

    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            for line in resp:
                line_str = line.decode("utf-8", errors="ignore").strip()
                if not line_str.startswith("data:"):
                    continue
                data_part = line_str[5:].strip()
                if data_part == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_part)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        if ttft is None:
                            ttft = time.perf_counter() - t0
                        token_count += 1
                        full_content.append(content)
                except Exception:
                    pass
        total_time = time.perf_counter() - t0
        
        # If no streaming tokens parsed, fallback approximate tokens from text length
        if token_count == 0 and full_content:
            token_count = max(1, len("".join(full_content)) // 3)

        gen_time = max(0.001, total_time - (ttft or 0))
        tok_per_sec = (token_count / gen_time) if token_count > 0 and ttft is not None else 0

        return {
            "success": True,
            "status": 200,
            "ttft_ms": round((ttft * 1000), 1) if ttft is not None else None,
            "total_ms": round(total_time * 1000, 1),
            "token_count": token_count,
            "tok_per_sec": round(tok_per_sec, 1)
        }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        return {
            "success": False,
            "status": e.code,
            "error": err_body[:200],
            "total_ms": round((time.perf_counter() - t0) * 1000, 1)
        }
    except Exception as e:
        return {
            "success": False,
            "status": 0,
            "error": str(e)[:200],
            "total_ms": round((time.perf_counter() - t0) * 1000, 1)
        }


def percentile(vals, p):
    if not vals:
        return 0
    k = (len(vals) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return vals[int(k)]
    return vals[f] * (c - k) + vals[c] * (k - f)


def main():
    print(f"=== Starting live field probe for {MODEL_ID} ===")
    conn = db_connect()
    uid = None
    try:
        # Check channels
        chans = conn.execute("SELECT id, name, type, status, models FROM channels WHERE models LIKE '%kimi%'").fetchall()
        print(f"Found {len(chans)} kimi channels in DB:")
        for c in chans:
            print(f"  Channel id={c['id']}, name={c['name']}, status={c['status']}")

        uid, api_key = setup_user_and_token(conn)
        print(f"Created probe user id={uid}, token ready.")

        results = []
        # Run 15 probe samples across prompts
        num_runs = 15
        for i in range(num_runs):
            p = PROMPTS[i % len(PROMPTS)]
            print(f"Probe {i+1}/{num_runs} ...", end=" ", flush=True)
            res = run_streaming_probe(api_key, p)
            results.append(res)
            if res["success"]:
                print(f"OK (status=200, TTFT={res['ttft_ms']}ms, total={res['total_ms']}ms, tokens={res['token_count']}, {res['tok_per_sec']} tok/s)")
            else:
                print(f"FAILED (status={res.get('status')}, err={res.get('error')})")
            time.sleep(1.2)  # courteous pacing

        successes = [r for r in results if r["success"] and r.get("ttft_ms") is not None]
        ttfts = sorted([r["ttft_ms"] for r in successes])
        totals = sorted([r["total_ms"] for r in successes])
        tok_rates = sorted([r["tok_per_sec"] for r in successes if r.get("tok_per_sec", 0) > 0])

        uptime_pct = round((len(successes) / len(results)) * 100, 1)
        error_rate_pct = round(100.0 - uptime_pct, 1)

        summary = {
            "model": MODEL_ID,
            "sample_count": len(results),
            "successful_count": len(successes),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            "date": time.strftime("%Y-%m-%d", time.gmtime()),
            "uptime_pct": uptime_pct,
            "error_rate_pct": error_rate_pct,
            "ttft_p50_ms": round(percentile(ttfts, 0.5), 1) if ttfts else None,
            "ttft_p95_ms": round(percentile(ttfts, 0.95), 1) if ttfts else None,
            "latency_p50_ms": round(percentile(totals, 0.5), 1) if totals else None,
            "latency_p95_ms": round(percentile(totals, 0.95), 1) if totals else None,
            "throughput_p50_toks": round(percentile(tok_rates, 0.5), 1) if tok_rates else None,
            "throughput_p95_toks": round(percentile(tok_rates, 0.95), 1) if tok_rates else None,
            "raw_samples": results
        }

        print("\n=== Field Probe Summary ===")
        print(f"Sample count: {summary['sample_count']}")
        print(f"Uptime: {summary['uptime_pct']}% | Error rate: {summary['error_rate_pct']}%")
        print(f"TTFT p50: {summary['ttft_p50_ms']} ms | TTFT p95: {summary['ttft_p95_ms']} ms")
        print(f"Throughput p50: {summary['throughput_p50_toks']} tok/s | p95: {summary['throughput_p95_toks']} tok/s")
        print(f"Total Latency p50: {summary['latency_p50_ms']} ms | p95: {summary['latency_p95_ms']} ms")

        # Write to public brand static folder
        os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        print(f"Saved probe summary to {OUTPUT_PATH}")

        return 0 if len(successes) > 0 else 1

    except Exception as e:
        print(f"Probe execution error: {e}")
        return 1
    finally:
        if uid and conn:
            try:
                cleanup(conn, uid)
                print("Cleaned up probe user and token.")
            except Exception as e:
                print(f"Cleanup error: {e}")
            conn.close()


if __name__ == "__main__":
    sys.exit(main())
