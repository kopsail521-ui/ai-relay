#!/usr/bin/env python3
"""Inspect or release only Gitee media gateway; never calls a model.

sudo python3 scripts/vps-deploy-gitee-safe.py --inspect  # default, read only
sudo python3 scripts/vps-deploy-gitee-safe.py --deploy   # after reviewed sync
"""
import argparse
import copy
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import posixpath
import re
import time

ROOT = Path('/opt/ai-relay')
NAME = 'ai-relay-gitee-passthrough'
SOURCE_DIR = 'services/gitee-passthrough'
SOURCES = ('server.mjs', 'decisions.mjs', 'fix-marketplace-meta.mjs', 'catalog.json')
PORT = 3010


def load_native():
    spec = importlib.util.spec_from_file_location('keyo_gitee_native_primitives',
                                                Path(__file__).with_name('vps-deploy-native-images-safe.py'))
    native = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(native)
    native.ROOT = ROOT
    native.error_marker = error_marker
    return native


def error_marker(stage, error):
    record = {'result': 'GITEE_RELEASE_STAGE_ERROR', 'stage': stage,
              'category': 'local_transport_timeout' if isinstance(error, TimeoutError) else 'operation_failed'}
    status = getattr(error, 'status', None)
    if isinstance(status, int) and 400 <= status <= 599:
        record['docker_status'] = status
    # Exception messages, inspect JSON, command output and env values are private.
    print(json.dumps(record), flush=True)


def manifest():
    return {name: hashlib.sha256((ROOT / SOURCE_DIR / name).read_bytes()).hexdigest() for name in SOURCES}


def expected_build():
    source = (ROOT / SOURCE_DIR / 'server.mjs').read_text()
    match = re.search(r'const BUILD_ID = "([A-Za-z0-9_.-]{1,100})";', source)
    if not match:
        raise RuntimeError('Reviewed source has no safe build marker')
    return match[1]


def replacement(helper, original, image):
    # Do not call the native-image replacement builder: its ACK/trusted-proxy
    # environment and storage additions do not belong to the Gitee service.
    plan = copy.deepcopy(original['Config'])
    if plan.get('Healthcheck') is None:
        plan.pop('Healthcheck', None)
    plan['Image'] = image
    plan['HostConfig'] = copy.deepcopy(original['HostConfig'])
    configured = {bind.split(':')[1] for bind in plan['HostConfig'].get('Binds') or []}
    configured.update(m['Target'] for m in plan['HostConfig'].get('Mounts') or [])
    configured.update(plan['HostConfig'].get('Tmpfs') or {})
    # Config.Volumes would create fresh anonymous volumes. Reattach existing
    # identities while retaining explicit bind and structured mount definitions.
    for mount in helper.mounts(original):
        if mount['Destination'] not in configured and mount['Type'] in ('volume', 'bind'):
            source = mount.get('Name') if mount['Type'] == 'volume' else mount['Source']
            helper.append_bind(plan, source + ':' + mount['Destination'] + (':rw' if mount.get('RW') else ':ro'))
    if plan['HostConfig'].get('NetworkMode') not in ('host', 'none'):
        plan['NetworkingConfig'] = {'EndpointsConfig': {
            name: {key: copy.deepcopy(network[key]) for key in ('IPAMConfig', 'Links', 'Aliases', 'DriverOpts')
                   if network.get(key) is not None}
            for name, network in original.get('NetworkSettings', {}).get('Networks', {}).items()}}
    return plan


def validate_wallet(helper, original, plan, wallet):
    env = helper.environments(plan)
    db = helper.absolute_target(env.get('NEW_API_DB', '/data/one-api.db'), 'NEW_API_DB')
    mount = helper.covering_mount(original, db)
    if not helper.persistent_mount(mount) or mount['Destination'] == db:
        raise RuntimeError('Existing wallet database directory must be persistently writable')
    for target in (posixpath.dirname(db), db + '-wal', db + '-shm'):
        if helper.covering_mount(original, target) != mount:
            raise RuntimeError('Wallet directory or SQLite sidecars are shadowed by another mount')
    if mount['Type'] == 'bind' and not Path(mount['Source']).is_dir():
        raise RuntimeError('Wallet bind source must be an existing directory')
    # The helper requires an explicit path. Supply its effective default only in
    # the validation copy; the replacement's Env list remains byte-for-byte equal.
    effective_plan = copy.deepcopy(plan)
    if 'NEW_API_DB' not in env:
        effective_plan.setdefault('Env', []).append('NEW_API_DB=' + db)
    helper.validate_wallet(original, effective_plan, wallet)


def listener(native):
    lines = native.run_command(['ss', '-H', '-lntp', '( sport = :3010 )']).splitlines()
    owners = sorted({int(pid) for line in lines for pid in re.findall(r'pid=(\d+)', line)})
    return {'pids': owners, 'listening': bool(lines),
            'complete': bool(lines) and all(re.search(r'pid=\d+', line) for line in lines)}


def live_process(native, helper, name, image=None, identity=None):
    current = helper.inspect(name)
    state = current.get('State') or {}
    pid = state.get('Pid')
    owner = listener(native)
    if (state.get('Running') is not True or state.get('Restarting') is not False
            or not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0
            or not owner['complete'] or owner['pids'] != [pid]):
        raise RuntimeError('Canonical Gitee container does not exclusively own stable port 3010')
    if image is not None and current.get('Image') != image:
        raise RuntimeError('Gitee image identity changed')
    if identity is not None and current.get('Id') != identity:
        raise RuntimeError('Gitee container identity changed')
    return pid


def runtime_preflight(native, helper, original):
    env = helper.environments(original['Config'])
    if ((original.get('HostConfig') or {}).get('NetworkMode') != 'host'
            or env.get('PORT', str(PORT)) != str(PORT)
            or env.get('LISTEN_HOST', '127.0.0.1') not in ('127.0.0.1', '::1', '0.0.0.0', '::')):
        raise RuntimeError('Preserved runtime must expose canonical host-network port 3010')
    return live_process(native, helper, NAME, original['Image'], original['Id'])


def source_hashes(native, name):
    raw = native.run_command(['docker', 'exec', name, 'sha256sum', *('/app/' + source for source in SOURCES)])
    hashes = {}
    for line in raw.splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})\s+/app/([A-Za-z0-9_.-]+)', line)
        if not match or match[2] not in SOURCES or match[2] in hashes:
            raise RuntimeError('Invalid Gitee source manifest')
        hashes[match[2]] = match[1]
    if set(hashes) != set(SOURCES):
        raise RuntimeError('Incomplete Gitee source manifest')
    return hashes


def local_health(config):
    # No authentication, upstream, wallet read/write or generation calls.
    env = dict(item.split('=', 1) for item in config.get('Env', []) if '=' in item)
    host = '::1' if env.get('LISTEN_HOST') == '::1' else '127.0.0.1'
    connection = http.client.HTTPConnection(host, PORT, timeout=3)
    try:
        connection.request('GET', '/healthz')
        response = connection.getresponse()
        raw = response.read(65537)
        if response.status != 200 or len(raw) > 65536:
            raise RuntimeError('Invalid local Gitee health response')
        body = json.loads(raw)
        if (body.get('ok') is not True or body.get('db') is not True or body.get('key') is not True
                or not isinstance(body.get('models'), int) or body['models'] <= 0
                or not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', str(body.get('build', '')))):
            raise RuntimeError('Gitee health is not ready')
        return {'build': body['build'], 'ok': True, 'database_present': True, 'models': body['models']}
    finally:
        connection.close()


def active_backups(native, helper):
    active = []
    for name in native.run_command(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines():
        if name.startswith(NAME + '-') and re.fullmatch(r'[A-Za-z0-9_.-]+', name):
            state = helper.inspect(name).get('State') or {}
            if state.get('Running') or state.get('Restarting') or state.get('Pid', 0):
                active.append(name)
    if active:
        raise RuntimeError('Active Gitee backup exists; no process was stopped')


def preflight(native, helper):
    original = helper.inspect(NAME)
    runtime_preflight(native, helper, original)
    active_backups(native, helper)
    plan = replacement(helper, original, 'gitee-inspection-only')
    validate_wallet(helper, original, plan, helper.inspect('ai-relay-new-api'))
    sources = source_hashes(native, NAME)
    health = local_health(original['Config'])
    runtime_preflight(native, helper, original)
    return original, sources, health


def inspect_only(native, helper):
    original = helper.inspect(NAME)
    record = {'result': 'GITEE_PREFLIGHT_BLOCKED', 'container': NAME,
              'container_id': original['Id'], 'image_id': original['Image'],
              'pid': (original.get('State') or {}).get('Pid'),
              'network_mode': (original.get('HostConfig') or {}).get('NetworkMode'),
              'mounts': [{'type': m['Type'], 'destination': m['Destination'], 'writable': bool(m.get('RW'))}
                         for m in helper.mounts(original)],
              'listenerOwner': listener(native), 'read_only': True}
    try:
        _, sources, health = preflight(native, helper)
        record.update({'result': 'GITEE_PREFLIGHT_OK', 'health': health, 'source_sha256': sources,
                       'reviewed_source_sha256': manifest(), 'reviewed_build': expected_build()})
    except Exception:
        # Even a foreign listener produces useful diagnostics without exposing
        # process arguments, environment, raw health responses or exception text.
        print(json.dumps(record), flush=True)
        raise
    print(json.dumps(record), flush=True)


def verify(native, helper, image, identity, config, sources, build):
    # Bounded startup followed by two consecutive stable complete checks.
    for attempt in range(20):
        try:
            live_process(native, helper, NAME, image, identity)
            break
        except RuntimeError:
            if attempt == 19:
                raise RuntimeError('Gitee listener did not become ready') from None
            time.sleep(1)
    previous_pid = None
    for _ in range(2):
        pid = live_process(native, helper, NAME, image, identity)
        if source_hashes(native, NAME) != sources or local_health(config)['build'] != build:
            raise RuntimeError('Gitee source or build verification failed')
        if live_process(native, helper, NAME, image, identity) != pid or previous_pid not in (None, pid):
            raise RuntimeError('Gitee process changed during verification')
        previous_pid = pid
        time.sleep(1)
    return previous_pid


def restore(native, helper, original, backup, replacement_image, original_sources, original_build):
    current = native.missing_container(helper, NAME)
    if current is not None and current.get('Id') != original['Id']:
        if current.get('Image') != replacement_image:
            raise RuntimeError('Unrecognized Gitee replacement blocks rollback')
        native.update_restart(helper, NAME, {'Name': 'no', 'MaximumRetryCount': 0})
        native.stop_and_wait(helper, NAME, current['Id'])
        helper.api('DELETE', '/containers/' + NAME + '?force=true')
        current = None
    if current is None:
        saved = helper.inspect(backup)
        if saved.get('Id') != original['Id']:
            raise RuntimeError('Unrecognized Gitee backup blocks rollback')
        helper.api('POST', '/containers/' + backup + '/rename?name=' + NAME)
    native.stop_and_wait(helper, NAME, original['Id'])
    native.update_restart(helper, NAME, original['HostConfig']['RestartPolicy'])
    native.start_with_backoff(helper, NAME, original['Id'])
    verify(native, helper, original['Image'], original['Id'], original['Config'], original_sources, original_build)


def deploy(native, helper):
    original, original_sources, original_health = preflight(native, helper)
    suffix = str(time.time_ns()) + '-' + str(os.getpid())
    backup, image = NAME + '-previous-' + suffix, 'keyo-gitee-passthrough:reviewed-' + suffix
    if native.missing_container(helper, backup) is not None:
        raise RuntimeError('Unique Gitee backup already exists')
    plan = replacement(helper, original, image)
    sources, build = manifest(), expected_build()
    # Build errors and preflight races leave the current service untouched.
    helper.run_checked(['docker', 'build', '-t', image, str(ROOT / SOURCE_DIR)])
    built_image = helper.api('GET', '/images/' + image + '/json')['Id']
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', str(built_image)) or manifest() != sources:
        raise RuntimeError('Built Gitee image or source changed; current service retained')
    runtime_preflight(native, helper, original)
    active_backups(native, helper)
    validate_wallet(helper, original, plan, helper.inspect('ai-relay-new-api'))
    if source_hashes(native, NAME) != original_sources or local_health(original['Config'])['build'] != original_health['build']:
        raise RuntimeError('Current Gitee source changed during build')
    stage = 'disable_original_restart'
    try:
        native.update_restart(helper, NAME, {'Name': 'no', 'MaximumRetryCount': 0})
        stage = 'stop_original'
        native.stop_and_wait(helper, NAME, original['Id'])
        if listener(native)['listening']:
            raise RuntimeError('Port 3010 has a foreign listener; refusing to kill it')
        stage = 'rename_original'
        helper.api('POST', '/containers/' + NAME + '/rename?name=' + backup)
        stage = 'create_replacement'
        created = helper.api('POST', '/containers/create?name=' + NAME, plan)
        stage = 'start_replacement'
        native.start_with_backoff(helper, NAME, created['Id'])
        stage = 'verify_replacement'
        pid = verify(native, helper, built_image, created['Id'], plan, sources, build)
    except Exception as error:
        error_marker(stage, error)
        try:
            restore(native, helper, original, backup, built_image, original_sources, original_health['build'])
        except Exception as rollback_error:
            error_marker('rollback', rollback_error)
            print('GITEE_RELEASE_ROLLBACK_INCOMPLETE', flush=True)
            raise RuntimeError('Gitee release failed; rollback incomplete') from None
        print('GITEE_RELEASE_ROLLED_BACK', flush=True)
        raise RuntimeError('Gitee release failed; previous service restored') from None
    print(json.dumps({'result': 'GITEE_RELEASE_OK', 'pid': pid, 'image_id': built_image,
                      'source_sha256': sources, 'build': build, 'stable_checks': 2,
                      'listenerOwner': listener(native), 'rollback_container': backup}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--inspect', action='store_true', help='read-only preflight (default)')
    modes.add_argument('--deploy', action='store_true', help='build and safely replace Gitee gateway')
    args = parser.parse_args()
    native = load_native()
    helper = native.load_helper()
    if not args.deploy:
        inspect_only(native, helper)
        return
    # Share the existing local release lock with native image deployment.
    with open('/run/lock/keyo-image-deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy(native, helper)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        error_marker('entrypoint', error)
        raise SystemExit('Gitee release stopped; inspect sanitized markers and container state')
