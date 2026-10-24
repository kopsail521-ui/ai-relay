#!/usr/bin/env python3
"""One-time, reversible recovery of the port conflict diagnosed on 2026-10-25.

No image build/pull, database/config changes, model calls, or container deletion.
Exact image IDs deliberately prevent reuse against a different deployment.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.request import Request, urlopen

NEW = 'ai-relay-creem-moderation'
OLD = 'ai-relay-creem-moderation-images-rollback'
NEW_IMAGE = 'sha256:d2aff8c0ab23842082b700060433dc6ea9e354bd68eae696388b068c0c2d14e0'
OLD_IMAGE = 'sha256:b714944930852d21bc680c0407987e5f1b4d26bd6230fe051befdc24ab9da560'
SOURCE = Path('/opt/ai-relay/services/creem-moderation-proxy')
FILES = ('server.mjs', 'public-model-metadata.mjs', 'model-contracts.json', 'model-icon-inject.js')


def run(args, timeout=25):
    # Never surface raw Docker stderr, environment, or HTTP response bodies.
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError('command_failed:' + args[0] + ':' + args[1])
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def owner_pids():
    pids = set()
    for line in run(['ss', '-lntp']).splitlines():
        fields = line.split()
        if len(fields) >= 5 and fields[3].rsplit(':', 1)[-1] == '3001':
            matches = re.findall(r'pid=(\d+)', line)
            if not matches:
                raise RuntimeError('listener_pid_unavailable')
            pids.update(map(int, matches))
    return pids


def stable_owner(info):
    state = info['State']
    return (state.get('Running') is True and state.get('Restarting') is False
            and state.get('Pid', 0) > 0 and owner_pids() == {state['Pid']})


def restart_policy(info):
    policy = info['HostConfig']['RestartPolicy']
    name = policy.get('Name') or 'no'
    count = policy.get('MaximumRetryCount', 0)
    return name + (':' + str(count) if name == 'on-failure' and count else '')


def hashes(raw):
    return {line.split()[-1].removeprefix('/app/'): line.split()[0]
            for line in raw.splitlines()
            if re.fullmatch(r'[0-9a-f]{64}\s+/app/[A-Za-z0-9_.-]+', line)}


def get(path, public=False):
    assert path in ('/api/pricing', '/pricing', '/sign-in', '/sign-up')
    base = 'https://www.keyoapi.xyz' if public else 'http://127.0.0.1:3001'
    request = Request(base + path, headers={'Cache-Control': 'no-cache',
                                           'User-Agent': 'Keyo-Deployment-Acceptance'})
    with urlopen(request, timeout=8) as response:
        if response.status != 200:
            raise RuntimeError('public_get_status')
        return response.read(3 * 1024 * 1024)


def verify_http(public=False):
    payload = json.loads(get('/api/pricing', public))
    rows = payload.get('data')
    if not isinstance(rows, list) or len(rows) < 125:
        raise RuntimeError('model_catalog_incomplete')
    if any(not row.get('capability') or 'billing_unit' not in row
           or (row['capability'] != 'unknown' and not row['billing_unit']) for row in rows):
        raise RuntimeError('old_model_metadata')
    if payload.get('supported_endpoint', {}).get('openai', {}).get('path') != '/v1/chat/completions':
        raise RuntimeError('incorrect_chat_endpoint')
    for path in ('/sign-in', '/sign-up'):
        if b'keyo-oauth-enable' in get(path, public):
            raise RuntimeError('old_auth_injection')
    if b'keyo-model-icons-v6' not in get('/pricing', public):
        raise RuntimeError('old_pricing_injection')
    return len(rows)


def main():
    new, old = inspect(NEW), inspect(OLD)
    if new['Image'] != NEW_IMAGE or old['Image'] != OLD_IMAGE:
        raise RuntimeError('image_changed_abort_without_mutation')
    if any(info['HostConfig']['NetworkMode'] != 'host' for info in (new, old)):
        raise RuntimeError('network_changed_abort_without_mutation')
    expected = {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in FILES}
    embedded = hashes(run(['docker', 'run', '--rm', '--network', 'none',
                          '--entrypoint', 'sha256sum', NEW_IMAGE,
                          *('/app/' + name for name in FILES)]))
    if embedded != expected:
        raise RuntimeError('image_source_mismatch_abort_without_mutation')
    if stable_owner(new):
        current = hashes(run(['docker', 'exec', NEW, 'sha256sum',
                              *('/app/' + name for name in FILES)]))
        if current != expected or old['State'].get('Running') or restart_policy(old) != 'no':
            raise RuntimeError('already_current_runtime_or_backup_state_invalid')
        count = verify_http(public=True)
        print(json.dumps({'result': 'already_current', 'model_count': count}))
        return
    if not stable_owner(old):
        raise RuntimeError('old_owner_changed_abort_without_mutation')
    old_policy, new_policy = restart_policy(old), restart_policy(new)
    print(json.dumps({'preflight': 'exact_old_listener_and_reviewed_new_image_verified',
                      'old_restart_policy': old_policy, 'new_restart_policy': new_policy}), flush=True)
    try:
        run(['docker', 'update', '--restart=no', NEW])
        run(['docker', 'stop', '--time', '15', NEW])
        run(['docker', 'update', '--restart=no', OLD])
        run(['docker', 'stop', '--time', '15', OLD])
        if owner_pids():
            raise RuntimeError('port_still_owned')
        run(['docker', 'start', NEW])
        last_pid, consecutive = None, 0
        for attempt in range(20):
            info = inspect(NEW)
            if stable_owner(info):
                current = hashes(run(['docker', 'exec', NEW, 'sha256sum',
                                      *('/app/' + name for name in FILES)]))
                if current != expected:
                    raise RuntimeError('running_source_mismatch')
                verify_http()
                pid = info['State']['Pid']
                consecutive = consecutive + 1 if pid == last_pid else 1
                last_pid = pid
                if consecutive >= 2:
                    break
            else:
                consecutive, last_pid = 0, None
            time.sleep(2)
        else:
            raise RuntimeError('new_owner_not_stable')
        count = verify_http(public=True)
        run(['docker', 'update', '--restart=' + new_policy, NEW])
        if not stable_owner(inspect(NEW)) or inspect(OLD)['State']['Running']:
            raise RuntimeError('final_container_state_invalid')
        print(json.dumps({'result': 'recovered', 'model_count': count,
                          'listener_container': NEW, 'listener_pid': last_pid,
                          'source_sha256': expected, 'retained_stopped_container': OLD,
                          'public_checks': 'pricing_metadata_and_auth_pass', 'model_calls': 0}))
    except Exception as error:
        # Keep the failed new container stopped so it cannot steal the port later.
        try:
            run(['docker', 'update', '--restart=no', NEW])
            run(['docker', 'stop', '--time', '15', NEW])
            run(['docker', 'update', '--restart=' + old_policy, OLD])
            run(['docker', 'start', OLD])
            for attempt in range(10):
                if stable_owner(inspect(OLD)):
                    get('/sign-in')
                    break
                time.sleep(1)
            else:
                raise RuntimeError('old_owner_not_stable')
            print(json.dumps({'result': 'rolled_back', 'error_class': type(error).__name__,
                              'listener_container': OLD, 'new_restart_policy': 'no'}), flush=True)
        except Exception as rollback_error:
            print(json.dumps({'result': 'rollback_failed', 'error_class': type(rollback_error).__name__}), flush=True)
        raise RuntimeError('recovery_failed_see_safe_result') from None


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Messages above are fixed internal codes, never upstream or Docker output.
        print(json.dumps({'fatal': str(error) if isinstance(error, RuntimeError) else type(error).__name__}), flush=True)
        sys.exit(1)
