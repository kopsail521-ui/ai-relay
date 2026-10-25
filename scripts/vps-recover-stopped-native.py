#!/usr/bin/env python3
"""Start the exact stopped native container observed during the Oct 25 release.

No pull, rebuild, replacement, environment update, logs or model requests.
"""
import json
import re
import subprocess
import time

NAME = 'ai-relay-apimart-passthrough'
IMAGE = 'sha256:a3d0fffb1c2efe9c611b0146ff8f748d91d15a219a22150e1052c1b7f94f08af'
STARTED = '2026-10-24T17:11:35.757311357Z'


def command(args, timeout=20):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError('Local recovery command failed')
    return result.stdout


def inspect():
    return json.loads(command(['docker', 'inspect', NAME]))[0]


def owners():
    lines = command(['ss', '-H', '-lntp', '( sport = :3011 )']).splitlines()
    found = []
    for line in lines:
        ids = re.findall(r'pid=(\d+)', line)
        if not ids:
            raise RuntimeError('Unidentified native listener')
        found.extend(int(pid) for pid in ids)
    return found


def recover():
    original = inspect()
    state = original.get('State') or {}
    config = original.get('Config') or {}
    env = dict(item.split('=', 1) for item in config.get('Env', []) if '=' in item)
    if (original.get('Image') != IMAGE or state.get('Running') is not False
            or state.get('Restarting') is not False or state.get('Pid') != 0
            or state.get('StartedAt') != STARTED
            or (original.get('HostConfig') or {}).get('NetworkMode') != 'host'
            or env.get('PORT', '3011') != '3011' or owners()):
        raise RuntimeError('Observed stopped native identity no longer matches')
    command(['docker', 'start', NAME], timeout=60)
    for attempt in range(30):
        current = inspect()
        state = current.get('State') or {}
        pid = state.get('Pid')
        listeners = owners()
        if (current.get('Id') == original.get('Id') and current.get('Image') == IMAGE
                and state.get('Running') is True and state.get('Restarting') is False
                and type(pid) is int and pid > 0 and listeners
                and all(owner == pid for owner in listeners)):
            break
        if attempt == 29:
            raise RuntimeError('Original native listener did not become ready')
        time.sleep(1)
    probe = "const r=await fetch('http://127.0.0.1:3011/healthz',{signal:AbortSignal.timeout(3000)});const j=await r.json();if(!r.ok||j.image_ledger?.ok!==true||j.image_ledger?.storage!=='new_api_sqlite'||j.image_ledger?.delivery_ack_writable!==true)process.exit(1)"
    for _ in range(2):
        command(['docker', 'exec', NAME, 'node', '--input-type=module', '-e', probe], timeout=10)
        current = inspect()
        if (current.get('Id') != original.get('Id') or current.get('Image') != IMAGE
                or current.get('State', {}).get('Pid') != pid
                or current.get('State', {}).get('Running') is not True
                or current.get('State', {}).get('Restarting') is not False
                or not owners() or any(owner != pid for owner in owners())):
            raise RuntimeError('Original native process is not stable')
        time.sleep(1)
    print(json.dumps({'result': 'ORIGINAL_NATIVE_RECOVERED', 'image_id': IMAGE,
                      'pid': pid, 'stable_checks': 2, 'model_calls': 0}))


if __name__ == '__main__':
    try:
        recover()
    except Exception:
        raise SystemExit('Original native recovery stopped; inspect sanitized container state')
