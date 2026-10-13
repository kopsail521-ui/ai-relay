#!/usr/bin/env python3
"""Clef onboarding: .env loading, real billed probe, then idempotent DB/admin registration.

python scripts/add-cloudflare-clef.py --db /opt/ai-relay/data/new-api/one-api.db
python scripts/add-cloudflare-clef.py --backend admin --env-file .env --db PATH
Never logs credentials or upstream response bodies. Requires Python 3 standard library.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

MODEL = "cloudflare/clef"
CHANNEL = "Keyo Decisions"
GATEWAY = "http://127.0.0.1:3010"
ENDPOINTS = json.dumps({"decisions": "/v1/decisions"}, separators=(",", ":"))
DESCRIPTION = "Clef 决策模型：结构化分类与选择。输入起价 $0.063 / 百万 Token，输出 $0；实际按请求成本的 1.5 倍结算。"
PAYLOAD = {
    "model": MODEL,
    "state": "A customer wants to reset a forgotten password.",
    "questions": {"route": {"type": "choice", "instructions": "Choose the best support queue.",
                             "criteria": {"account": None, "billing": None, "technical": None}}},
}


def load_env(path):
    if not Path(path).is_file():
        return
    for raw in Path(path).read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
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


def request(url, method="GET", body=None, token="", user_id=""):
    headers = {"Accept": "application/json", "Content-Type": "application/json", "Accept-Encoding": "identity"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if user_id:
        headers["New-Api-User"] = str(user_id)
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        # Bodies can contain supplier keys / authorization fragments. Never print them.
        raise RuntimeError("%s %s returned HTTP %s" % (method, urllib.parse.urlsplit(url).path, exc.code)) from None
    if not isinstance(data, dict) or data.get("success") is False:
        raise RuntimeError("API request did not succeed: " + urllib.parse.urlsplit(url).path)
    return data


def columns(db, table):
    return {row[1] for row in db.execute('PRAGMA table_info("%s")' % table)}


def insert(db, table, spec):
    available = columns(db, table)
    values = {key: value for key, value in spec.items() if key in available}
    names = ','.join('"%s"' % key for key in values)
    return db.execute('INSERT INTO "%s" (%s) VALUES (%s)' % (table, names, ','.join('?' for _ in values)), list(values.values())).lastrowid


def update(db, table, row_id, spec):
    available = columns(db, table)
    values = {key: value for key, value in spec.items() if key in available}
    db.execute('UPDATE "%s" SET %s WHERE id=?' % (table, ','.join('"%s"=?' % key for key in values)), list(values.values()) + [row_id])


def options(db):
    return dict(db.execute("SELECT key,value FROM options"))


def check_group(opts):
    ratios = json.loads(opts.get("group_ratio_setting.group_ratio") or opts.get("GroupRatio") or "{}")
    if float(ratios.get("default", 1)) != 1:
        raise RuntimeError("default GroupRatio must be 1; no activation performed")


def upstream_key(db):
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        row = db.execute('SELECT name,base_url,"key" FROM channels WHERE id=14').fetchone()
        if not row or row[0] != "Keyo TTS" or (row[1] or "").rstrip("/") != "https://openrouter.ai/api":
            raise RuntimeError("No OPENROUTER_API_KEY and channel 14 is not the expected Keyo TTS upstream")
        key = (row[2] or "").strip()
    if not key or any(char in key for char in "\r\n\x00") or key.startswith("["):
        raise RuntimeError("A single valid OpenRouter credential is required")
    return key


def backup(db, path):
    target = str(path) + ".clef-%s.bak" % time.time_ns()
    with sqlite3.connect(target) as dest:
        db.backup(dest)
    os.chmod(target, 0o600)
    print("DATABASE_BACKUP " + target)


def verify(db, base, payload_path=None):
    # A dedicated temporary user isolates quota deltas from live user traffic.
    required = {"model_limits_enabled", "model_limits", "expired_time", "remain_quota", "unlimited_quota", "used_quota", "group"}
    if not required <= columns(db, "tokens"):
        raise RuntimeError("Token schema cannot enforce a restricted probe")
    now = int(time.time())
    name = "clef-probe-" + secrets.token_hex(8)
    key = secrets.token_hex(24)
    uid = tid = cid = None
    private_group = name
    budget = 50000  # $0.10 ceiling; expires in five minutes and only permits Clef.
    try:
        with db:
            # Private group is owned only by the probe user; empty token.group inherits it.
            # No global GroupRatio/UserUsableGroups changes or default abilities before proof.
            cid = insert(db, "channels", dict(channel_spec(), name=name, group=private_group, created_time=now))
            insert(db, "abilities", {"group": private_group, "model": MODEL, "channel_id": cid, "enabled": 1, "priority": 0, "weight": 1})
            uid = insert(db, "users", {"username": name, "password": "!" + secrets.token_hex(32), "display_name": name,
                "role": 1, "status": 1, "group": private_group, "quota": budget, "used_quota": 0, "request_count": 0})
            tid = insert(db, "tokens", {"user_id": uid, "key": key, "name": name, "status": 1,
                "created_time": now, "accessed_time": now, "expired_time": now + 300, "remain_quota": budget,
                "unlimited_quota": 0, "used_quota": 0, "model_limits_enabled": 1, "model_limits": MODEL,
                "group": "", "cross_group_retry": 0})
        payload = PAYLOAD if not payload_path else json.loads(Path(payload_path).read_text(encoding="utf-8"))
        if payload.get("model") != MODEL:
            raise RuntimeError("Probe payload must use cloudflare/clef")
        response = request(base.rstrip("/") + "/v1/decisions", "POST", payload, "sk-" + key)
        route = response.get("answers", {}).get("route", {})
        if route.get("choice") not in ("account", "billing", "technical") or not isinstance(route.get("probabilities"), dict):
            raise RuntimeError("Decision response lacks a valid choice/probabilities; activation blocked")
        usage = response.get("usage", {})
        cost = float(usage.get("cost", 0))
        if not math.isfinite(cost) or cost <= 0:
            raise RuntimeError("No positive actual usage.cost; settlement cannot be verified")
        # The public response's usage.cost is already the sale cost (upstream x1.5).
        expected = math.floor(cost * 500000 + 0.5)
        if expected > budget:
            raise RuntimeError("Probe exceeded its quota ceiling")
        for _ in range(20):
            user = db.execute("SELECT quota,used_quota,request_count FROM users WHERE id=?", (uid,)).fetchone()
            token = db.execute("SELECT remain_quota,used_quota FROM tokens WHERE id=?", (tid,)).fetchone()
            logs = db.execute('SELECT quota,model_name,prompt_tokens,completion_tokens,channel_id,"group",request_id,other FROM logs WHERE token_id=? AND type=2', (tid,)).fetchall()
            channel_quota = db.execute("SELECT used_quota FROM channels WHERE id=?", (cid,)).fetchone()[0]
            if user == (budget - expected, expected, 1) and token == (budget - expected, expected) and len(logs) == 1:
                row = logs[0]
                other = json.loads(row[7] or "{}")
                if (row[:6] == (expected, MODEL, usage.get("input_tokens"), usage.get("output_tokens"), cid, private_group)
                        and row[6] and channel_quota == expected and other.get("billing_multiplier") == 1.5
                        and abs(float(other.get("sale_cost", -1)) - cost) < 1e-12):
                    print("REAL_DECISION_AND_SETTLEMENT_OK sale_cost_usd=%.10g quota=%d markup=1.5" % (cost, expected))
                    return
            time.sleep(0.25)
        raise RuntimeError("User/token/channel/log settlement differs from round(public usage.cost*500000); activation blocked")
    finally:
        with db:
            if tid is not None:
                db.execute("DELETE FROM logs WHERE token_id=?", (tid,))
                db.execute("DELETE FROM tokens WHERE id=?", (tid,))
            if uid is not None:
                db.execute("DELETE FROM users WHERE id=?", (uid,))
            if cid is not None:
                db.execute("DELETE FROM abilities WHERE channel_id=?", (cid,))
                db.execute("DELETE FROM channels WHERE id=?", (cid,))
        key = ""


def channel_spec():
    return {"name": CHANNEL, "type": 1, "base_url": GATEWAY, "models": MODEL, "group": "default", "status": 1,
            "key": "local-decisions-placeholder", "model_mapping": "{}", "priority": 0, "weight": 1}


def model_spec(vid):
    return {"model_name": MODEL, "description": DESCRIPTION, "icon": "Cloudflare", "vendor_id": vid,
            "tags": "决策模型", "endpoints": ENDPOINTS, "status": 1, "sync_official": 0}


def merge_prices(opts):
    check_group(opts)
    result = {}
    for name, value in (("ModelRatio", 0.0315), ("CompletionRatio", 0), ("ModelPrice", None)):
        data = json.loads(opts.get(name) or "{}")
        if value is None:
            data.pop(MODEL, None)
        else:
            data[MODEL] = value
        result[name] = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return result


def ensure_db(db):
    # Never claim a preexisting unrelated channel. Also reject ambiguous rows.
    rows = db.execute('SELECT id,type,base_url,models FROM channels WHERE name=?', (CHANNEL,)).fetchall()
    if len(rows) > 1 or rows and (rows[0][1] != 1 or rows[0][2] != GATEWAY or rows[0][3] != MODEL):
        raise RuntimeError("Keyo Decisions channel conflicts with existing configuration")
    prices = merge_prices(options(db))
    now = int(time.time())
    with db:
        cid = rows[0][0] if rows else insert(db, "channels", dict(channel_spec(), created_time=now))
        update(db, "channels", cid, dict(channel_spec(), updated_time=now))
        vendors = db.execute("SELECT id FROM vendors WHERE name=? AND deleted_at IS NULL", ("Cloudflare",)).fetchall()
        if len(vendors) > 1:
            raise RuntimeError("Multiple Cloudflare vendors found")
        vid = vendors[0][0] if vendors else insert(db, "vendors", {"name": "Cloudflare", "icon": "Cloudflare", "status": 1, "created_time": now})
        matches = db.execute("SELECT id FROM models WHERE model_name=?", (MODEL,)).fetchall()
        if len(matches) > 1:
            raise RuntimeError("Multiple Clef metadata rows found")
        spec = dict(model_spec(vid), deleted_at=None, updated_time=now)
        if matches:
            update(db, "models", matches[0][0], spec)
        else:
            insert(db, "models", dict(spec, created_time=now))
        db.execute("DELETE FROM abilities WHERE channel_id=? AND model=?", (cid, MODEL))
        insert(db, "abilities", {"group": "default", "model": MODEL, "channel_id": cid, "enabled": 1, "priority": 0, "weight": 1})
        for key, value in prices.items():
            if db.execute("SELECT 1 FROM options WHERE key=?", (key,)).fetchone():
                db.execute("UPDATE options SET value=? WHERE key=?", (value, key))
            else:
                db.execute("INSERT INTO options(key,value) VALUES (?,?)", (key, value))
    print("REGISTERED_DB channel=%d; restart new-api to refresh its caches" % cid)


class Admin:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.token = os.environ.get("NEW_API_ADMIN_TOKEN", "")
        self.user_id = os.environ.get("NEW_API_ADMIN_USER_ID", "")
        if not self.token:
            raise RuntimeError("NEW_API_ADMIN_TOKEN is required for admin backend; password login is not used")

    def call(self, path, method="GET", body=None):
        return request(self.base + path, method, body, self.token, self.user_id)

    def list(self, path):
        result = []
        for page in range(1, 101):
            data = self.call(path + "?page=%d&page_size=100" % page).get("data", {})
            batch = data if isinstance(data, list) else data.get("items", [])
            result.extend(batch)
            if len(batch) < 100:
                return result
        raise RuntimeError("Admin listing exceeded pagination limit")

    def upsert(self, path, rows, field, value, spec, channel=False):
        matches = [row for row in rows if row.get(field) == value]
        if len(matches) > 1:
            raise RuntimeError("Ambiguous admin rows for " + value)
        if matches:
            row = matches[0]
            if channel and (row.get("type") != 1 or row.get("base_url") != GATEWAY or row.get("models") != MODEL):
                raise RuntimeError("Keyo Decisions channel belongs to another endpoint")
            self.call(path, "PUT", dict(row, **spec))
        else:
            self.call(path, "POST", {"mode": "single", "channel": spec} if channel else spec)
        found = [row for row in self.list(path) if row.get(field) == value]
        if len(found) != 1:
            raise RuntimeError("Admin write could not be verified for " + value)
        return found[0]


def ensure_admin(base):
    api = Admin(base)
    opts = {row["key"]: row["value"] for row in api.call("/api/option/").get("data", [])}
    prices = merge_prices(opts)
    vendors, models, channels = api.list("/api/vendors/"), api.list("/api/models/"), api.list("/api/channel/")
    vendor = api.upsert("/api/vendors/", vendors, "name", "Cloudflare", {"name": "Cloudflare", "icon": "Cloudflare", "status": 1})
    # Pricing before enabled ability/model so public listing sees consistent values.
    for key, value in prices.items():
        api.call("/api/option/", "PUT", {"key": key, "value": value})
    api.upsert("/api/channel/", channels, "name", CHANNEL, channel_spec(), channel=True)
    api.upsert("/api/models/", models, "model_name", MODEL, model_spec(vendor["id"]))
    print("REGISTERED_ADMIN; pricing/ability caches refreshed through admin API")


def clone_container(inspect_path, image, name, key_path):
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
    for env in config.get("Env") or []:
        if not env.startswith("OPENROUTER_API_KEY="):
            args += ["--env", env]
    args += ["--env", "OPENROUTER_API_KEY=" + Path(key_path).read_text().strip()]
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
    # Credentials are passed as argv only to Docker, never rendered to the terminal.
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for net, details in (info.get("NetworkSettings", {}).get("Networks") or {}).items():
        if net == network or network == "host":
            continue
        connect = ["docker", "network", "connect"]
        for alias in details.get("Aliases") or []:
            if alias not in (info["Id"][:12], info["Name"].lstrip("/")):
                connect += ["--alias", alias]
        subprocess.run(connect + [net, name], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def patch_caddy(path):
    target = Path(path)
    source = target.read_text()
    lines = source.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if "@gitee_special path " in line]
    if len(matches) != 1 or "handle @gitee_special" not in source or "reverse_proxy 127.0.0.1:3010" not in source:
        raise RuntimeError("Installed Caddy does not have the known 3010 shared matcher; refusing blind rewrite")
    index = matches[0]
    if "/v1/decisions" not in lines[index].split():
        lines[index] = lines[index].rstrip("\r\n") + " /v1/decisions\n"
        target.write_text("".join(lines))
    print("CADDY_DECISIONS_MATCHER_READY")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=str(Path(__file__).resolve().parents[1] / ".env"))
    parser.add_argument("--db", default="/opt/ai-relay/data/new-api/one-api.db")
    parser.add_argument("--base", help="Admin API base; defaults to NEW_API_BASE")
    parser.add_argument("--probe-base", default="https://www.keyoapi.xyz", help="Use public Caddy route to verify routing and settlement")
    parser.add_argument("--backend", choices=("db", "admin"), default="db")
    parser.add_argument("--payload", help="Optional minimal real decision JSON request")
    parser.add_argument("--prepare-key", metavar="PRIVATE_FILE", help="Write upstream key for Docker without activating metadata")
    parser.add_argument("--clone-container", nargs=4, metavar=("INSPECT", "IMAGE", "NAME", "KEY_FILE"))
    parser.add_argument("--patch-caddy")
    parser.add_argument("--check-public", action="store_true")
    args = parser.parse_args()
    load_env(args.env_file)
    if args.clone_container:
        clone_container(*args.clone_container)
        return
    if args.patch_caddy:
        patch_caddy(args.patch_caddy)
        return
    if args.check_public:
        data = request(args.probe_base.rstrip("/") + "/api/pricing")
        rows = [row for row in data.get("data", []) if row.get("model_name") == MODEL]
        if len(rows) != 1:
            raise RuntimeError("Clef is missing/ambiguous in public pricing")
        row = rows[0]
        if row.get("quota_type") != 0 or abs(float(row.get("model_ratio", -1)) - 0.0315) > 1e-9 or row.get("completion_ratio") != 0 or "default" not in row.get("enable_groups", []):
            raise RuntimeError("Public Clef ratio pricing/groups do not match")
        if "decisions" not in row.get("supported_endpoint_types", []):
            raise RuntimeError("Public pricing omits decisions endpoint; console endpoint support must be deployed")
        print("PUBLIC_CLEF_PRICING_OK input_start_usd_per_m=0.063 output=0")
        return
    if not Path(args.db).is_file():
        raise RuntimeError("Local billing database is required to prove settlement: " + args.db)
    with sqlite3.connect(args.db, timeout=30) as db:
        check_group(options(db))
        if args.prepare_key:
            key = upstream_key(db)
            fd = os.open(args.prepare_key, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as out:
                out.write(key)
            os.chmod(args.prepare_key, 0o600)
            print("UPSTREAM_CREDENTIAL_READY (not displayed)")
            return
        backup(db, args.db)
        verify(db, args.probe_base, args.payload)
        if args.backend == "admin":
            ensure_admin(args.base or os.environ.get("NEW_API_BASE", "http://127.0.0.1:3000"))
        else:
            ensure_db(db)
    print("CLEF_REGISTERED_AFTER_REAL_BILLING_PROOF")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, sqlite3.Error, urllib.error.URLError, subprocess.CalledProcessError) as exc:
        # Do not stringify transport/SQL/process errors: they may contain credentials.
        message = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        print("CLEF_NOT_CONFIRMED: " + message, file=sys.stderr)
        sys.exit(1)
