#!/usr/bin/env python3
"""
Real-call smoke test for the speech gift-credit twins.

Verifies, against the live public endpoint, that the three ":free" speech
catalog IDs actually work and that gift-credit billing fires:

    SenseVoiceSmall:free  -> POST /v1/audio/transcriptions (ASR)
    GLM-ASR:free          -> POST /v1/audio/transcriptions (ASR)
    Spark-TTS-0.5B:free   -> POST /v1/async/audio/speech  (async TTS)

How it works without touching real accounts:
  1. Creates a throwaway user directly in the new-api SQLite DB
     (quota=0, gift_quota topped to 5,000,000 = $10) plus a fresh token.
  2. Runs the three real calls against the public endpoint.
  3. Asserts every call succeeded AND gift_quota decreased while paid quota
     stayed 0 (GLM-ASR bills ~$0.006849/call from the gift wallet; the two
     genuinely-free models still exercise the full pipeline).
  4. Hard-deletes the token and user so no key is left behind.

The API key is never printed; only a masked form appears in the output.

Usage (on the VPS):
    sudo python3 /opt/ai-relay/scripts/vps-smoke-gift-speech.py \
        /opt/ai-relay/data/new-api/one-api.db

Exit code 0 = all PASS, 1 = any failure.
"""

import io
import json
import math
import secrets
import sqlite3
import string
import struct
import sys
import time
import urllib.error
import urllib.request
import uuid
import wave

BASE_URL = "https://www.keyoapi.xyz"
DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

SMOKE_USERNAME = "smokegift"
# bcrypt hash of a random throwaway password; the account never logs in.
SMOKE_PASSWORD_HASH = "$2b$10$JsxNrvp2oHBiKDJIIzINR.5NnH6BBnFXfrIyg0NygKMjKjuqx5QpK"
GIFT_TOPUP = 5_000_000  # $10 in new-api units
TOKEN_NAME = "smoke-speech-gift-twins"

ASR_MODELS = ["SenseVoiceSmall:free", "GLM-ASR:free"]
TTS_MODEL = "Spark-TTS-0.5B:free"
TTS_TEXT = "你好，这是 KeyoAPI 赠送金语音接口的冒烟测试。"

TASK_POLL_INTERVAL = 3
TASK_TIMEOUT = 120
REQUEST_TIMEOUT = 90


# ---------------------------------------------------------------- db helpers

def db_connect():
    conn = sqlite3.connect(DB_PATH, timeout=60)
    conn.execute("PRAGMA busy_timeout=60000")
    conn.row_factory = sqlite3.Row
    return conn


def table_columns(conn, table):
    return {row["name"] for row in conn.execute("PRAGMA table_info(%s)" % table)}


def quote(name):
    # SQLite identifiers can be double-quoted; required for reserved words
    # like "group" that gorm uses as column names.
    return '"' + name.replace('"', '""') + '"'


def ensure_user(conn):
    """Remove any leftover smoke user/token, create a fresh gift-credit user."""
    conn.execute("DELETE FROM tokens WHERE user_id IN (SELECT id FROM users WHERE username=?)",
                 (SMOKE_USERNAME,))
    conn.execute("DELETE FROM users WHERE username=?", (SMOKE_USERNAME,))
    cols = table_columns(conn, "users")
    fields = {
        "username": SMOKE_USERNAME,
        "password": SMOKE_PASSWORD_HASH,
        "role": 1,
        "status": 1,
        "quota": 0,
        "gift_quota": GIFT_TOPUP,
        "used_quota": 0,
        "request_count": 0,
        "group": "default",
        "created_at": int(time.time()),
        "last_login_at": 0,
        "auth_version": 1,
        "setting": "",
        "remark": "smoke test user, do not use",
    }
    names = [c for c in fields if c in cols]
    values = [fields[c] for c in names]
    cur = conn.execute(
        "INSERT INTO users (%s) VALUES (%s)"
        % (", ".join(quote(c) for c in names), ", ".join("?" * len(names))),
        values,
    )
    conn.commit()
    return cur.lastrowid


def create_token(conn, uid):
    """Insert a fresh unlimited token for the smoke user; returns the raw key."""
    raw_key = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(48))
    cols = table_columns(conn, "tokens")
    fields = {
        "user_id": uid,
        "key": raw_key,
        "status": 1,
        "name": TOKEN_NAME,
        "created_time": int(time.time()),
        "accessed_time": 0,
        "expired_time": -1,
        "remain_quota": 0,
        "unlimited_quota": 1,
        "model_limits_enabled": 0,
        "model_limits": "",
        "allow_ips": "",
        "used_quota": 0,
        "group": "default",
        "cross_group_retry": 0,
        "auto_groups": "",
    }
    names = [c for c in fields if c in cols]
    values = [fields[c] for c in names]
    conn.execute(
        "INSERT INTO tokens (%s) VALUES (%s)"
        % (", ".join(quote(c) for c in names), ", ".join("?" * len(names))),
        values,
    )
    conn.commit()
    return raw_key


def cleanup(conn, uid):
    if uid is None:
        return
    conn.execute("DELETE FROM tokens WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    conn.commit()


# ---------------------------------------------------------------- http helpers

def http_call(method, path, token_key, headers, payload=None, timeout=REQUEST_TIMEOUT):
    headers = dict(headers)
    headers.setdefault("Authorization", "Bearer sk-" + token_key)
    last = (0, b"")
    for _attempt in range(4):  # 1 try + 3 retries on new-api cpu-overload 503
        req = urllib.request.Request(BASE_URL + path, data=payload, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                last = (resp.status, resp.read())
        except urllib.error.HTTPError as e:
            last = (e.code, e.read())
        except urllib.error.URLError as e:
            last = (0, str(e).encode("utf-8", "replace"))
        if last[0] != 503 or b"system_cpu_overloaded" not in last[1]:
            break
        time.sleep(12)
    return last


def http_json(method, path, token_key, headers, body=None, timeout=REQUEST_TIMEOUT):
    code, raw = http_call(method, path, token_key, headers, body, timeout=timeout)
    text = raw.decode("utf-8", "replace")
    try:
        return code, json.loads(text)
    except ValueError:
        return code, {"_raw": text[:500]}


def multipart_post(path, token_key, fields, filename, filebytes, content_type="audio/wav"):
    boundary = "----keyoSmoke" + uuid.uuid4().hex
    parts = []
    for name, value in fields.items():
        parts.append(
            ("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n"
             % (boundary, name, value)).encode("utf-8")
        )
    parts.append(
        ("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n"
         "Content-Type: %s\r\n\r\n" % (boundary, filename, content_type)).encode("utf-8")
        + filebytes
        + b"\r\n"
    )
    parts.append(("--%s--\r\n" % boundary).encode("utf-8"))
    body = b"".join(parts)
    return http_call(
        "POST", path, token_key,
        {"Content-Type": "multipart/form-data; boundary=" + boundary},
        body,
    )


# ------------------------------------------------------------------- audio utils

def make_wav(duration=2.0, rate=16000, freq=440.0):
    """Build a short 16-bit mono WAV sine tone (non-silent audio for ASR)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        amp = 0.3 * 32767
        for i in range(int(rate * duration)):
            sample = int(amp * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack("<h", sample)
        w.writeframes(bytes(frames))
    return buf.getvalue()


# ---------------------------------------------------------------------- runners

def run_asr(token_key, model):
    wav = make_wav()
    code, raw = multipart_post("/v1/audio/transcriptions", token_key,
                               {"model": model}, "smoke.wav", wav)
    text = raw.decode("utf-8", "replace")
    try:
        data = json.loads(text)
    except ValueError:
        print("smoke_fail=%s: non-JSON response (%s): %s" % (model, code, text[:300]))
        return False
    if code != 200:
        print("smoke_fail=%s: http %s: %s" % (model, code, text[:300]))
        return False
    if not isinstance(data, dict) or "text" not in data:
        print("smoke_fail=%s: missing 'text' in response: %s" % (model, text[:300]))
        return False
    print("smoke_asr_ok=%s (http 200, text_len=%d)" % (model, len(data.get("text") or "")))
    return True


def find_task_id(data):
    for key in ("id", "task_id"):
        if key in data:
            return data[key]
    sub = data.get("data")
    if isinstance(sub, dict):
        for key in ("id", "task_id"):
            if key in sub:
                return sub[key]
    return None


def find_task_url(data):
    if isinstance(data, dict):
        if data.get("url"):
            return data["url"]
        output = data.get("output")
        if isinstance(output, dict) and output.get("file_url"):
            return output["file_url"]
        sub = data.get("data")
        if isinstance(sub, dict):
            if sub.get("url"):
                return sub["url"]
            out2 = sub.get("output")
            if isinstance(out2, dict) and out2.get("file_url"):
                return out2["file_url"]
    return None


def run_tts(token_key, model):
    body = json.dumps({"model": model, "inputs": TTS_TEXT}).encode("utf-8")
    code, data = (0, {})
    # Transient 401 (token_lookup_failed) happens when the passthrough's DB
    # open hits a busy/locked SQLite; a short retry usually clears it.
    for attempt in range(3):
        code, data = http_json("POST", "/v1/async/audio/speech", token_key,
                               {"Content-Type": "application/json"}, body)
        if code not in (401, 0):
            break
        if attempt < 2:
            print("smoke_retry=%s: submit %s on attempt %d" % (model, code, attempt + 1))
            time.sleep(5)
    if code not in (200, 202):
        print("smoke_fail=%s: submit http %s: %s" % (model, code, json.dumps(data, ensure_ascii=False)[:300]))
        return False
    task_id = find_task_id(data)
    if task_id is None:
        print("smoke_fail=%s: no task id in submit response: %s"
              % (model, json.dumps(data, ensure_ascii=False)[:300]))
        return False

    deadline = time.time() + TASK_TIMEOUT
    last_status = "?"
    while time.time() < deadline:
        time.sleep(TASK_POLL_INTERVAL)
        code, data = http_json("GET", "/v1/task/" + str(task_id), token_key,
                               {"Content-Type": "application/json"}, timeout=30)
        if code not in (200, 202):
            print("smoke_fail=%s: poll http %s: %s"
                  % (model, code, json.dumps(data, ensure_ascii=False)[:300]))
            return False
        last_status = data.get("status") or (data.get("data") or {}).get("status") or "?"
        if last_status in ("completed", "succeeded", "success"):
            url = find_task_url(data)
            if not url:
                print("smoke_fail=%s: completed but no url/output.file_url: %s"
                      % (model, json.dumps(data, ensure_ascii=False)[:300]))
                return False
            print("smoke_tts_ok=%s (completed, url_len=%d)" % (model, len(url)))
            return True
        if last_status in ("failed", "cancelled", "error", "fail"):
            print("smoke_fail=%s: task ended %s: %s"
                  % (model, last_status, json.dumps(data, ensure_ascii=False)[:300]))
            return False
    print("smoke_fail=%s: task timeout after %ds (last status=%s)"
          % (model, TASK_TIMEOUT, last_status))
    return False


# ------------------------------------------------------------------------- main

def main():
    conn = db_connect()
    uid = None
    try:
        uid = ensure_user(conn)
        token_key = create_token(conn, uid)
        # Release the write connection before making HTTP calls: keeping it
        # open can make other processes see the DB as locked (hot journal) and
        # fail read-only opens (the passthrough's token lookup).
        conn.close()
        print("smoke_user_id=%d" % uid)
        print("smoke_token=%s" % (token_key[:4] + "****" + token_key[-4:]))

        ok = True
        for model in ASR_MODELS:
            try:
                ok = run_asr(token_key, model) and ok
            except Exception as e:  # noqa: BLE001 - report and continue
                print("smoke_fail=%s: exception %r" % (model, e))
                ok = False
        try:
            ok = run_tts(token_key, TTS_MODEL) and ok
        except Exception as e:  # noqa: BLE001
            print("smoke_fail=%s: exception %r" % (TTS_MODEL, e))
            ok = False

        # Billing assertion: the only paid twin (GLM-ASR) must have debited
        # the gift wallet, while the paid wallet stays at 0.
        read_conn = db_connect()
        try:
            row = read_conn.execute("SELECT quota, gift_quota FROM users WHERE id=?", (uid,)).fetchone()
        finally:
            read_conn.close()
        paid = row["quota"]
        gift_after = row["gift_quota"]
        consumed = GIFT_TOPUP - gift_after
        print("smoke_gift_before=%d" % GIFT_TOPUP)
        print("smoke_gift_after=%d" % gift_after)
        print("smoke_gift_consumed=%d" % consumed)
        print("smoke_paid_quota=%d" % paid)
        billed_ok = (paid == 0) and (gift_after < GIFT_TOPUP)
        print("smoke_gift_billing=%s" % ("ok" if billed_ok else "FAIL: gift_quota not debited"))
        ok = ok and billed_ok

        print("SMOKE_SPEECH_GIFT_TWINS_PASS" if ok else "SMOKE_SPEECH_GIFT_TWINS_FAIL")
        return 0 if ok else 1
    except Exception as e:  # noqa: BLE001
        print("smoke_fail=setup: %r" % e)
        print("SMOKE_SPEECH_GIFT_TWINS_FAIL")
        return 1
    finally:
        try:
            clean_conn = db_connect()
            cleanup(clean_conn, uid)
            clean_conn.close()
        except Exception:  # noqa: BLE001 - cleanup must never mask the result
            pass


if __name__ == "__main__":
    sys.exit(main())