#!/usr/bin/env python3
"""Zexapi gpt-image onboarding: registration, container env clone, real billed probe.

python scripts/add-zex-gpt-image.py --db /opt/ai-relay/data/new-api/one-api.db --key-file KEY
Never logs the upstream credential. Requires Python 3 standard library only.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# public model -> (upstream model, sell USD per request)
MODELS = {
    "gpt-image-2-1K": ("gpt-image-2", 0.02505),
    "gpt-image-2-2K": ("gpt-image-2-2K", 0.15),
    "gpt-image-2-4K": ("gpt-image-2-4K", 0.15),
    "gpt-image-2.5-1K": ("gpt-image-2.5", 0.02505),
    "gpt-image-2.5-flare-hd": ("gpt-image-2.5-flare", 0.27),
    "gpt-image-2.5-flare-vip": ("gpt-image-2.5-flare-vip", 0.27),
    "gpt-image-2.5-sunburst-hd": ("gpt-image-2.5-sunburst", 0.27),
    "gpt-image-2.5-sunburst-vip": ("gpt-image-2.5-sunburst-vip", 0.375),
}
CHANNEL = "Keyo Zex GPT Image"
BASE_URL = "https://zexapi.com"
GROUP = "default"
ENDPOINTS = json.dumps({"openai-video": "/v1/videos"}, separators=(",", ":"))
QUOTA_PER_USD = 500000


def load_env(path):
    if not Path(path).is_file():
        return
    for raw in Path(path).read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if value.startswith(("'", '"')):
            quote = value[0]
            end = value.find(quote, 1)
            if end < 0 or (value[end + 1:].strip() and not value[end + 1:].strip().startswith("#")):
                raise RuntimeError("Invalid quoted .env value for " + key)
            value = value[1:end]
        else:
            value = value.split(" #", 1)[0].rstrip()
        os.environ.setdefault(key, value)


def request(url, method="GET", body=None, token="", timeout=60):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read(400).decode("utf-8", "replace")
        except Exception:
            pass
        raise RuntimeError("%s %s -> HTTP %s %s" % (method, urllib.parse.urlsplit(url).path, exc.code, detail[:200])) from None


def columns(db, table):
    return {row[1] for row in db.execute('PRAGMA table_info("%s")' % table)}


def insert(db, table, spec):
    available = columns(db, table)
    values = {k: v for k, v in spec.items() if k in available}
    names = ",".join('"%s"' % k for k in values)
    return db.execute('INSERT INTO "%s" (%s) VALUES (%s)' % (table, names, ",".join("?" for _ in values)), list(values.values())).lastrowid


def update(db, table, row_id, spec):
    available = columns(db, table)
    values = {k: v for k, v in spec.items() if k in available}
    db.execute('UPDATE "%s" SET %s WHERE id=?' % (table, ",".join('"%s"=?' % k for k in values)), list(values.values()) + [row_id])


def backup(db, path):
    target = str(path) + ".zex-%s.bak" % time.time_ns()
    with sqlite3.connect(target) as dest:
        db.backup(dest)
    os.chmod(target, 0o600)
    print("DATABASE_BACKUP " + target)


def channel_spec(key):
    mapping = {pub: up for pub, (up, _) in MODELS.items() if pub != up}
    return {"name": CHANNEL, "type": 1, "base_url": BASE_URL, "models": ",".join(MODELS), "group": GROUP,
            "status": 1, "key": key, "model_mapping": json.dumps(mapping, separators=(",", ":")),
            "priority": 0, "weight": 1}


def model_spec(vid, name, price):
    upstream, _ = MODELS[name]
    desc = "GPT Image 异步图像生成（%s，上游 %s）。经 POST /v1/videos 提交，GET /v1/videos/{task_id} 轮询取图。计费：$%g/次。" % (name, upstream, price)
    return {"model_name": name, "description": desc, "icon": "OpenAI", "vendor_id": vid,
            "tags": "图像生成", "endpoints": ENDPOINTS, "status": 1, "sync_official": 0}


def ensure_db(db, key):
    rows = db.execute("SELECT id,type,base_url,models FROM channels WHERE name=?", (CHANNEL,)).fetchall()
    if len(rows) > 1 or rows and (rows[0][1] != 1 or rows[0][2] != BASE_URL):
        raise RuntimeError("Keyo Zex GPT Image channel conflicts with existing configuration")
    for (other_id, other_models) in db.execute("SELECT id,models FROM channels WHERE name<>?", (CHANNEL,)).fetchall():
        overlap = set((other_models or "").split(",")) & set(MODELS)
        if overlap:
            raise RuntimeError("Another channel already serves " + ",".join(sorted(overlap)))
    prices = {}
    for name, value in (("ModelPrice", None), ("ModelRatio", None), ("CompletionRatio", None)):
        data = json.loads(dict(db.execute("SELECT key,value FROM options")).get(name) or "{}")
        if value is None:
            for m in MODELS:
                data.pop(m, None)
        prices[name] = data
    for name, (_, price) in MODELS.items():
        prices["ModelPrice"][name] = price
    now = int(time.time())
    with db:
        cid = rows[0][0] if rows else insert(db, "channels", dict(channel_spec(key), created_time=now))
        update(db, "channels", cid, dict(channel_spec(key), updated_time=now))
        vendors = db.execute("SELECT id FROM vendors WHERE name='OpenAI'").fetchall()
        if len(vendors) > 1:
            raise RuntimeError("Multiple OpenAI vendors found")
        vid = vendors[0][0] if vendors else insert(db, "vendors", {"name": "OpenAI", "icon": "OpenAI", "status": 1, "created_time": now})
        for name, (_, price) in MODELS.items():
            matches = db.execute("SELECT id FROM models WHERE model_name=?", (name,)).fetchall()
            if len(matches) > 1:
                raise RuntimeError("Multiple metadata rows for " + name)
            spec = dict(model_spec(vid, name, price), deleted_at=None, updated_time=now)
            if matches:
                update(db, "models", matches[0][0], spec)
            else:
                insert(db, "models", dict(spec, created_time=now))
        db.execute("DELETE FROM abilities WHERE channel_id=? AND model IN (%s)" % ",".join("?" * len(MODELS)), [cid] + list(MODELS))
        for name in MODELS:
            insert(db, "abilities", {"group": GROUP, "model": name, "channel_id": cid, "enabled": 1, "priority": 0, "weight": 1})
        for opt, data in prices.items():
            value = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            if db.execute("SELECT 1 FROM options WHERE key=?", (opt,)).fetchone():
                db.execute("UPDATE options SET value=? WHERE key=?", (value, opt))
            else:
                db.execute("INSERT INTO options(key,value) VALUES (?,?)", (opt, value))
    print("REGISTERED_DB channel=%d models=%d; TASK_PRICE_PATCH=%s" % (cid, len(MODELS), ",".join(MODELS)))


def disable(db):
    rows = db.execute("SELECT id FROM channels WHERE name=?", (CHANNEL,)).fetchall()
    with db:
        for (cid,) in rows:
            db.execute("UPDATE channels SET status=2 WHERE id=?", (cid,))
            db.execute("UPDATE abilities SET enabled=0 WHERE channel_id=?", (cid,))
    print("CHANNEL_DISABLED_AFTER_FAILED_PROBE")


def clone_container(inspect_path, image, name, env_file):
    info = json.loads(Path(inspect_path).read_text())[0]
    config, host = info["Config"], info["HostConfig"]
    args = ["docker", "create", "--name", name]
    restart = host.get("RestartPolicy", {})
    policy = restart.get("Name")
    if policy:
        if policy == "on-failure" and restart.get("MaximumRetryCount"):
            policy += ":" + str(restart["MaximumRetryCount"])
        args += ["--restart", policy]
    network = host.get("NetworkMode") or "default"
    args += ["--network", network]
    networks = info.get("NetworkSettings", {}).get("Networks") or {}
    if network not in ("host", "none", "default", "bridge"):
        for alias in networks.get(network, {}).get("Aliases") or []:
            if alias not in (info["Id"][:12], info["Name"].lstrip("/")):
                args += ["--network-alias", alias]
    if host.get("AutoRemove"):
        raise RuntimeError("AutoRemove container cannot provide deployment rollback")
    skip = {"TASK_PRICE_PATCH"}
    for env in config.get("Env") or []:
        if env.split("=", 1)[0] not in skip:
            args += ["--env", env]
    for line in Path(env_file).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            args += ["--env", line]
    for bind in host.get("Binds") or []:
        args += ["--volume", bind]
    bound = {bind.split(":")[1] for bind in host.get("Binds") or []}
    for mount in info.get("Mounts") or []:
        if mount["Destination"] in bound:
            continue
        if mount["Type"] not in ("bind", "volume"):
            if mount["Type"] == "tmpfs":
                continue
            raise RuntimeError("Unsupported container mount type; refusing to lose it")
        source = mount.get("Name") if mount["Type"] == "volume" else mount["Source"]
        args += ["--mount", "type=%s,src=%s,dst=%s%s" % (mount["Type"], source, mount["Destination"], ",readonly" if not mount.get("RW", True) else "")]
    for destination, value in (host.get("Tmpfs") or {}).items():
        args += ["--tmpfs", destination + (":" + value if value else "")]
    for port, bindings in (host.get("PortBindings") or {}).items():
        for binding in bindings or []:
            args += ["--publish", "%s%s:%s" % ((binding.get("HostIp") + ":") if binding.get("HostIp") else "", binding["HostPort"], port)]
    for label, value in (config.get("Labels") or {}).items():
        args += ["--label", label + "=" + value]
    for field, flag in (("User", "--user"), ("WorkingDir", "--workdir")):
        if config.get(field):
            args += [flag, config[field]]
    for field, flag in (("Memory", "--memory"), ("MemorySwap", "--memory-swap"), ("CpuShares", "--cpu-shares"), ("CpuQuota", "--cpu-quota"), ("CpuPeriod", "--cpu-period"), ("PidsLimit", "--pids-limit"), ("ShmSize", "--shm-size")):
        if host.get(field):
            args += [flag, str(host[field])]
    for field, flag in (("CapAdd", "--cap-add"), ("CapDrop", "--cap-drop"), ("SecurityOpt", "--security-opt"), ("Dns", "--dns"), ("ExtraHosts", "--add-host")):
        for value in host.get(field) or []:
            args += [flag, value]
    if host.get("Privileged"):
        args += ["--privileged"]
    if host.get("ReadonlyRootfs"):
        args += ["--read-only"]
    if config.get("Entrypoint"):
        if len(config["Entrypoint"]) != 1:
            raise RuntimeError("Multi-argument entrypoint requires manual review")
        args += ["--entrypoint", config["Entrypoint"][0]]
    args += [image] + (config.get("Cmd") or [])
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for net, details in (info.get("NetworkSettings", {}).get("Networks") or {}).items():
        if net == network or network == "host":
            continue
        connect = ["docker", "network", "connect"]
        for alias in details.get("Aliases") or []:
            if alias not in (info["Id"][:12], info["Name"].lstrip("/")):
                connect += ["--alias", alias]
        subprocess.run(connect + [net, name], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def probe(db, base, key):
    """Real billed proof: one cheap 1K task and one flare 4K task through the public API."""
    required = {"model_limits_enabled", "model_limits", "expired_time", "remain_quota", "unlimited_quota", "used_quota", "group"}
    if not required <= columns(db, "tokens"):
        raise RuntimeError("Token schema cannot enforce a restricted probe")
    now = int(time.time())
    results = []
    uid = tid = None
    try:
        budget = 300000  # $0.60 ceiling
        name = "zex-probe-" + secrets.token_hex(8)
        token_key = secrets.token_hex(24)
        with db:
            uid = insert(db, "users", {"username": name, "password": "!" + secrets.token_hex(32), "display_name": name,
                "role": 1, "status": 1, "group": GROUP, "quota": budget, "used_quota": 0, "request_count": 0})
            tid = insert(db, "tokens", {"user_id": uid, "key": token_key, "name": name, "status": 1,
                "created_time": now, "accessed_time": now, "expired_time": now + 900, "remain_quota": budget,
                "unlimited_quota": 0, "used_quota": 0, "model_limits_enabled": 1,
                "model_limits": ",".join(MODELS), "group": "", "cross_group_retry": 0})
        auth = "sk-" + token_key
        jobs = [
            ("gpt-image-2-1K", {"model": "gpt-image-2-1K", "prompt": "A simple red circle on a white background", "aspect_ratio": "1:1"}, 0.02505),
            ("gpt-image-2.5-flare-hd", {"model": "gpt-image-2.5-flare-hd", "prompt": "A blue square on a white background", "aspect_ratio": "1:1", "image_size": "4K"}, 0.27),
        ]
        cumulative = 0
        for model, payload, sell in jobs:
            expected = round(sell * QUOTA_PER_USD)
            cumulative += expected
            submit = request(base.rstrip("/") + "/v1/videos", "POST", payload, auth, timeout=90)
            task_id = submit.get("id") or submit.get("task_id")
            if not task_id or submit.get("status") not in ("queued", "in_progress", "completed"):
                raise RuntimeError("Submit for %s returned %s" % (model, json.dumps(submit)[:200]))
            url = None
            deadline = time.time() + 240
            while time.time() < deadline:
                task = request(base.rstrip("/") + "/v1/videos/" + task_id, "GET", token=auth, timeout=30)
                status = task.get("status")
                if status == "completed":
                    url = task.get("url") or (task.get("metadata") or {}).get("image_url")
                    break
                if status == "failed":
                    raise RuntimeError("Upstream task failed: " + json.dumps(task.get("error") or task)[:200])
                time.sleep(4)
            if not url:
                raise RuntimeError("Task for %s did not complete in time" % model)
            settled = False
            for _ in range(40):
                row = db.execute("SELECT quota,used_quota FROM users WHERE id=?", (uid,)).fetchone()
                logs = db.execute('SELECT quota FROM logs WHERE user_id=? AND model_name=? AND type=2', (uid, model)).fetchall()
                if row and row[1] == cumulative and len(logs) == 1 and logs[0][0] == expected:
                    settled = True
                    break
                time.sleep(2)
            if not settled:
                raise RuntimeError("Settlement for %s differs: expected quota %d cumulative %d (sell $%g x1.5 of upstream cost)" % (model, expected, cumulative, sell))
            results.append("%s OK quota=%d url_present=yes" % (model, expected))
        print("REAL_VIDEO_TASK_AND_SETTLEMENT_OK " + "; ".join(results))
    finally:
        with db:
            if tid is not None:
                db.execute("DELETE FROM logs WHERE token_id=?", (tid,))
                db.execute("DELETE FROM tokens WHERE id=?", (tid,))
            if uid is not None:
                db.execute("DELETE FROM tasks WHERE user_id=?", (uid,))
                db.execute("DELETE FROM users WHERE id=?", (uid,))
        token_key = ""


def check_public(base):
    data = request(base.rstrip("/") + "/api/pricing")
    rows = {r.get("model_name"): r for r in data.get("data", []) if r.get("model_name") in MODELS}
    if set(rows) != set(MODELS):
        raise RuntimeError("Public pricing missing models: " + ",".join(set(MODELS) - set(rows)))
    for name, (_, price) in MODELS.items():
        row = rows[name]
        if row.get("quota_type") != 1 or abs(float(row.get("model_price", -1)) - price) > 1e-9 or GROUP not in row.get("enable_groups", []):
            raise RuntimeError("Public pricing mismatch for " + name)
        if "openai-video" not in row.get("supported_endpoint_types", []):
            raise RuntimeError("Public pricing omits openai-video endpoint for " + name)
    print("PUBLIC_ZEX_PRICING_OK models=%d" % len(MODELS))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=str(Path(__file__).resolve().parents[1] / ".env"))
    parser.add_argument("--db", default="/opt/ai-relay/data/new-api/one-api.db")
    parser.add_argument("--base", default="https://www.keyoapi.xyz")
    parser.add_argument("--key-file", help="Protected file holding the zexapi credential")
    parser.add_argument("--clone-container", nargs=4, metavar=("INSPECT", "IMAGE", "NAME", "ENV_FILE"))
    parser.add_argument("--register", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--disable", action="store_true")
    parser.add_argument("--check-public", action="store_true")
    args = parser.parse_args()
    load_env(args.env_file)
    if args.clone_container:
        clone_container(*args.clone_container)
        return
    if args.check_public:
        check_public(args.base)
        return
    if not Path(args.db).is_file():
        raise RuntimeError("Local billing database required: " + args.db)
    with sqlite3.connect(args.db, timeout=30) as db:
        if args.disable:
            disable(db)
            return
        key = (Path(args.key_file).read_text().strip() if args.key_file else os.environ.get("ZEX_API_KEY", "")).strip()
        if not key or any(c in key for c in "\r\n\x00") or key.startswith("["):
            raise RuntimeError("A single valid zexapi credential is required")
        backup(db, args.db)
        if args.register:
            ensure_db(db, key)
        if args.probe:
            probe(db, args.base, key)
    print("ZEX_OK")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, sqlite3.Error, urllib.error.URLError, subprocess.CalledProcessError) as exc:
        message = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        print("ZEX_NOT_CONFIRMED: " + message, file=sys.stderr)
        sys.exit(1)
