#!/usr/bin/env python3
"""Apply bounded memory/log/history settings, preserving inspected containers.

Only the seven named application containers are eligible. Each replacement
retains the old stopped container and rolls back on failed health verification.
Never deletes a volume, database, upload or arbitrary Docker image.
"""
import argparse
import copy
import fcntl
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

ROOT = Path('/opt/ai-relay')
MIB = 1024 * 1024
SLICE = 'keyo-services.slice'
# The aggregate slice caps the applications at 512MiB, leaving ~383MiB of
# physical RAM on this host for Caddy, SSH, Docker and OS agents. Per-service
# maxima can overlap inside that fixed pool; no CPU percentage reboot rule.
LIMITS = {
    'ai-relay-new-api': 192,
    'ai-relay-pricing': 80,
    'ai-relay-unofree-pool': 64,
    'ai-relay-volc-passthrough': 64,
    'ai-relay-gitee-passthrough': 96,
    'ai-relay-apimart-passthrough': 192,
    'ai-relay-creem-moderation': 192,
}
PORTS = {'ai-relay-new-api': (3000, '/api/status'), 'ai-relay-creem-moderation': (3001, '/healthz'),
         'ai-relay-gitee-passthrough': (3010, '/healthz'), 'ai-relay-apimart-passthrough': (3011, '/healthz')}


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Host operation failed: ' + args[0])
    return result.stdout.strip()


def helper():
    spec = importlib.util.spec_from_file_location('native_stability', ROOT / 'scripts/vps-deploy-native-images-safe.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def plan(original, limit_mib):
    body = copy.deepcopy(original['Config'])
    host = body['HostConfig'] = copy.deepcopy(original['HostConfig'])
    host['CgroupParent'] = SLICE
    # Preserve any already tighter operator limit.
    host['Memory'] = min(host.get('Memory') or limit_mib * MIB, limit_mib * MIB)
    host['MemorySwap'] = host['Memory'] + 32 * MIB
    host['PidsLimit'] = min(host.get('PidsLimit') or 256, 256) if (host.get('PidsLimit') or 0) > 0 else 256
    log = host.setdefault('LogConfig', {})
    if not log.get('Type') or log['Type'] == 'json-file':
        log['Type'] = 'json-file'
        options = log.setdefault('Config', {})
        options.setdefault('max-size', '10m')
        options.setdefault('max-file', '3')
    configured = {bind.split(':')[1] for bind in host.get('Binds') or []}
    configured.update(m['Target'] for m in host.get('Mounts') or [])
    configured.update(host.get('Tmpfs') or {})
    for mount in original.get('Mounts') or []:
        if mount['Destination'] not in configured:
            if mount['Type'] not in ('bind', 'volume'):
                raise RuntimeError('Unsupported storage mount')
            source = mount['Name'] if mount['Type'] == 'volume' else mount['Source']
            host.setdefault('Binds', [])
            if host['Binds'] is None:
                host['Binds'] = []
            host['Binds'].append(source + ':' + mount['Destination'] + (':rw' if mount.get('RW') else ':ro'))
    if host.get('NetworkMode') not in ('host', 'none'):
        body['NetworkingConfig'] = {'EndpointsConfig': {name: {key: copy.deepcopy(net[key]) for key in ('IPAMConfig', 'Links', 'Aliases', 'DriverOpts') if net.get(key) is not None}
                                                       for name, net in original['NetworkSettings']['Networks'].items()}}
    return body


def local_health(name):
    if name not in PORTS:
        return {}
    port, path = PORTS[name]
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    try:
        connection.request('GET', path)
        response = connection.getresponse()
        raw = response.read(65537)
        if response.status != 200 or len(raw) > 65536:
            raise RuntimeError('Health check failed')
        payload = json.loads(raw)
        if name == 'ai-relay-new-api':
            if payload.get('success') is not True:
                raise RuntimeError('Status response failed')
        elif payload.get('ok') is not True:
            raise RuntimeError('Health response failed')
        return payload
    finally:
        connection.close()


def verify(api, name, identity, expected):
    for attempt in range(20):
        try:
            for _ in range(2):
                current = api('GET', '/containers/' + name + '/json')
                state = current['State']
                if current['Id'] != identity or not state.get('Running') or state.get('Restarting') or not state.get('Pid'):
                    raise RuntimeError('Container not stable')
                for key in ('Memory', 'MemorySwap', 'PidsLimit', 'CgroupParent', 'LogConfig'):
                    if current['HostConfig'].get(key) != expected.get(key):
                        raise RuntimeError('Runtime limit verification failed')
                local_health(name)
                time.sleep(1)
            return
        except Exception:
            if attempt == 19:
                raise
            time.sleep(1)


def replace(native, api, name, original, replacement):
    backup = name + '-stability-previous-' + str(time.time_ns())
    identity = original['Id']
    replacement['Labels'] = dict(replacement.get('Labels') or {})
    replacement['Labels']['io.keyo.stability.rollout'] = backup
    inspect = lambda target: api('GET', '/containers/' + target + '/json')
    adapter = type('Adapter', (), {'inspect': staticmethod(inspect), 'api': staticmethod(api)})
    renamed = False
    created_id = None
    try:
        if inspect(name)['Id'] != identity:
            raise RuntimeError('Container changed before replacement')
        api('POST', '/containers/' + name + '/update', {'RestartPolicy': {'Name': 'no', 'MaximumRetryCount': 0}})
        native.stop_and_wait(adapter, name, identity)
        api('POST', '/containers/' + name + '/rename?name=' + backup)
        renamed = True
        created_id = api('POST', '/containers/create?name=' + name, replacement)['Id']
        native.start_with_backoff(adapter, name, created_id)
        verify(api, name, created_id, replacement['HostConfig'])
    except Exception:
        if renamed and not created_id:
            try:
                candidate = inspect(name)
            except Exception as error:
                if getattr(error, 'status', None) != 404 and not isinstance(error, KeyError):
                    raise RuntimeError('Cannot resolve container creation outcome') from None
            else:
                if (candidate.get('Config') or {}).get('Labels', {}).get('io.keyo.stability.rollout') != backup:
                    raise RuntimeError('Unrecognized container blocks rollback') from None
                created_id = candidate['Id']
        if created_id:
            if inspect(name)['Id'] != created_id:
                raise RuntimeError('Unexpected replacement identity; rollback stopped') from None
            api('POST', '/containers/' + name + '/update', {'RestartPolicy': {'Name': 'no', 'MaximumRetryCount': 0}})
            native.stop_and_wait(adapter, name, created_id)
            api('DELETE', '/containers/' + name + '?force=false&v=false')
        if renamed:
            if inspect(backup)['Id'] != identity:
                raise RuntimeError('Unexpected backup identity; rollback stopped') from None
            api('POST', '/containers/' + backup + '/rename?name=' + name)
        native.stop_and_wait(adapter, name, identity)
        api('POST', '/containers/' + name + '/update', {'RestartPolicy': original['HostConfig']['RestartPolicy']})
        native.start_with_backoff(adapter, name, identity)
        verify(api, name, identity, original['HostConfig'])
        print(json.dumps({'result': 'STABILITY_CONTAINER_ROLLED_BACK', 'name': name}), flush=True)
        raise RuntimeError('Replacement failed; previous container restored') from None
    print(json.dumps({'result': 'STABILITY_CONTAINER_OK', 'name': name, 'memory_mib': replacement['HostConfig']['Memory'] // MIB, 'rollback_container': backup}), flush=True)


def units():
    return {
        SLICE: '[Unit]\nDescription=Keyo application memory pool\n[Slice]\nMemoryAccounting=yes\nMemoryMax=512M\nMemorySwapMax=128M\nIOAccounting=yes\nIOReadIOPSMax=/ 900\nIOWriteIOPSMax=/ 600\n',
        'keyo-stability-recorder.service': '''[Unit]
Description=Bounded Keyo resource history
After=network.target
[Service]
Type=simple
ExecStart=/usr/bin/python3 /usr/local/lib/keyo-stability/vps-stability-recorder.py
Restart=on-failure
RestartSec=10
Nice=19
IOSchedulingClass=idle
CPUQuota=5%
MemoryMax=48M
MemorySwapMax=0
UMask=0077
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/log/keyo-stability
[Install]
WantedBy=multi-user.target
''',
        'keyo-stability-retention.service': '''[Unit]
Description=Retain bounded Keyo rollback versions and closed application logs
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/ai-relay/scripts/vps-stability-hardening.py --maintain
Nice=19
IOSchedulingClass=idle
MemoryMax=64M
TimeoutStartSec=180
''',
        'keyo-stability-retention.timer': '''[Unit]
Description=Keyo storage retention
[Timer]
OnBootSec=30min
OnUnitActiveSec=12h
RandomizedDelaySec=15min
[Install]
WantedBy=timers.target
''',
    }


def retention_candidates(containers, now):
    result = []
    for name in LIMITS:
        pattern = re.compile(re.escape(name) + r'-(?:stability-previous-\d+|previous-\d+-\d+)$')
        candidates = []
        for row in containers:
            candidate_name = row.get('Name', '').lstrip('/')
            state = row.get('State') or {}
            restart = (row.get('HostConfig') or {}).get('RestartPolicy') or {}
            if not pattern.fullmatch(candidate_name) or state.get('Running') or state.get('Restarting') or state.get('Pid') or restart.get('Name') != 'no':
                continue
            try:
                import datetime
                finished = datetime.datetime.fromisoformat(state['FinishedAt'].replace('Z', '+00:00')).timestamp()
            except (ValueError, KeyError):
                continue
            candidates.append((finished, row))
        # Keep at least two rollback containers, and every backup from the last
        # day. Volumes are never removed, including anonymous mounted volumes.
        candidates.sort(key=lambda item: item[0], reverse=True)
        result.extend(row for finished, row in candidates[2:] if now - finished > 86400)
    return result


def maintain(api):
    containers = [api('GET', '/containers/' + row['Id'] + '/json') for row in api('GET', '/containers/json?all=true')]
    removed = []
    for row in retention_candidates(containers, time.time()):
        current = api('GET', '/containers/' + row['Id'] + '/json')
        if current['State'].get('Running') or current['State'].get('Restarting') or current['State'].get('Pid'):
            continue
        api('DELETE', '/containers/' + row['Id'] + '?force=false&v=false')
        removed.append(row['Id'])
        still_used = any(other['Id'] not in removed and other['Image'] == row['Image'] for other in containers)
        if not still_used:
            try:
                api('DELETE', '/images/' + row['Image'] + '?force=false&noprune=true')
            except Exception:
                pass  # Docker may retain an image referenced by another tag.
    logs = ROOT / 'data/logs'
    active = next((row for row in containers if row.get('Name') == '/ai-relay-new-api'), None)
    opened = set()
    if active and active['State'].get('Pid'):
        try:
            for fd in Path('/proc/' + str(active['State']['Pid']) + '/fd').iterdir():
                try:
                    opened.add(Path(os.readlink(fd)).resolve())
                except OSError:
                    pass
        except OSError:
            return  # Missing process evidence must not delete any app log.
    else:
        return
    files = sorted((path for path in logs.glob('oneapi-*.log') if re.fullmatch(r'oneapi-\d{14}\.log', path.name) and path.is_file() and not path.is_symlink()), key=lambda path: path.stat().st_mtime, reverse=True)
    total = sum(path.stat().st_size for path in files)
    deleted_logs = 0
    for path in reversed(files[2:]):
        age = time.time() - path.stat().st_mtime
        if path.resolve() in opened or age < 86400 or (total <= 200 * MIB and age < 7 * 86400):
            continue
        size = path.stat().st_size
        path.unlink()
        total -= size
        deleted_logs += 1
    print(json.dumps({'result': 'STABILITY_RETENTION_OK', 'removed_stopped_backups': len(removed), 'removed_closed_logs': deleted_logs}), flush=True)


def apply(native, api):
    info = json.loads(run(['docker', 'info', '--format', '{{json .}}']))
    if info.get('CgroupDriver') != 'systemd' or info.get('CgroupVersion') != '2':
        raise RuntimeError('Expected systemd and cgroup v2; no limits were applied')
    if os.statvfs('/').f_bavail * os.statvfs('/').f_frsize < 2 * 1024 ** 3:
        raise RuntimeError('Insufficient free disk for a safe rollout')
    originals = {name: api('GET', '/containers/' + name + '/json') for name in LIMITS}
    plans = {name: plan(originals[name], limit) for name, limit in LIMITS.items()}
    for name, original in originals.items():
        if not original['State'].get('Running') or original['State'].get('Restarting'):
            raise RuntimeError('Application not healthy before hardening')
        state = local_health(name).get('resources') or {}
        if state.get('active_requests', 0) or state.get('image_jobs', 0):
            raise RuntimeError('Media work in flight; retry hardening after completion')
    print(json.dumps({'result': 'STABILITY_PREFLIGHT_OK', 'containers': len(originals)}), flush=True)
    directory = Path('/var/log/keyo-stability')
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    library = Path('/usr/local/lib/keyo-stability')
    library.mkdir(mode=0o755, exist_ok=True)
    shutil.copyfile(ROOT / 'scripts/vps-stability-recorder.py', library / 'vps-stability-recorder.py')
    for name, source in units().items():
        (Path('/etc/systemd/system') / name).write_text(source)
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'start', SLICE])
    group = run(['systemctl', 'show', SLICE, '--property=ControlGroup', '--value'])
    if not re.fullmatch(r'/[A-Za-z0-9_./-]+', group) or '..' in group:
        raise RuntimeError('Invalid memory pool path')
    control = Path('/sys/fs/cgroup') / group.lstrip('/')
    if (control / 'memory.max').read_text().strip() != str(512 * MIB) or (control / 'memory.swap.max').read_text().strip() != str(128 * MIB):
        raise RuntimeError('Aggregate memory limit did not apply')
    io_limits = (control / 'io.max').read_text()
    if 'riops=900' not in io_limits or 'wiops=600' not in io_limits:
        raise RuntimeError('Aggregate disk I/O limit did not apply')
    print(json.dumps({'result': 'STABILITY_POOL_OK', 'memory_mib': 512, 'swap_mib': 128, 'io_max': io_limits.strip()}), flush=True)
    run(['systemctl', 'enable', '--now', 'keyo-stability-recorder.service'])
    run(['systemctl', 'enable', '--now', 'keyo-stability-retention.timer'])
    for name, original in originals.items():
        expected = plans[name]['HostConfig']
        if all(original['HostConfig'].get(key) == expected.get(key) for key in ('Memory', 'MemorySwap', 'PidsLimit', 'CgroupParent', 'LogConfig')):
            verify(api, name, original['Id'], expected)
            continue
        print(json.dumps({'result': 'STABILITY_REPLACING_CONTAINER', 'name': name}), flush=True)
        replace(native, api, name, original, plans[name])
    print(json.dumps({'result': 'STABILITY_HARDENING_OK', 'aggregate_memory_mib': 512, 'aggregate_swap_mib': 128, 'read_iops_max': 900, 'write_iops_max': 600, 'history_max_mib': 15}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--maintain', action='store_true')
    args = parser.parse_args()
    if not args.apply and not args.maintain:
        print(json.dumps({'result': 'STABILITY_PLAN', 'limits_mib': LIMITS, 'aggregate_memory_mib': 512, 'units': list(units())}))
        return
    native = helper()
    with open('/run/lock/keyo-image-deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.maintain:
            maintain(native.docker_api)
        else:
            apply(native, native.docker_api)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No raw Docker errors or inspect output: both may contain credentials.
        print(json.dumps({'result': 'STABILITY_HARDENING_STOPPED', 'category': type(error).__name__}), flush=True)
        raise SystemExit(1)
