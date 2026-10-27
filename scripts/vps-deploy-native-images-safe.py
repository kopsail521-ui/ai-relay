#!/usr/bin/env python3
"""Deploy only the native image gateway, preserving inspected runtime state.

Run after a reviewed source sync: sudo python3 scripts/vps-deploy-native-images-safe.py native
No generation, upstream, authentication or database requests are issued here.
"""
import copy
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time


ROOT = Path('/opt/ai-relay')
NAME = 'ai-relay-apimart-passthrough'
SOURCE_DIR = 'services/apimart-passthrough'
SOURCES = ('server.mjs', 'request-budget.mjs', 'video-contracts.mjs', 'task-responses.mjs',
           'image-contracts.mjs', 'image-ledger.mjs', 'image-service.mjs', 'catalog.json')
KNOWN_LOOP_NAME = NAME + '-images-rollback'
KNOWN_LOOP_IMAGE = 'sha256:df7b55a4f1ac22c1dba65fc650273e6ead60755e8ca58f50c7fbd812dca3ccd7'
DOCKER_TIMEOUT_SECONDS = 95


class DockerFailure(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__('Docker operation failed with status=' + str(status))


class NativeUnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        # A stop?t=30 can consume all 30 seconds before Docker kills PID 1.
        # The transport must outlive that server-side deadline and its response.
        self.sock.settimeout(DOCKER_TIMEOUT_SECONDS)
        self.sock.connect('/var/run/docker.sock')


def docker_api(method, route, body=None):
    connection = NativeUnixHTTP('localhost', timeout=DOCKER_TIMEOUT_SECONDS)
    try:
        connection.request(method, '/v1.41' + route,
                           json.dumps(body) if body is not None else None,
                           {'Content-Type': 'application/json'})
        response = connection.getresponse()
        data = response.read()
        if response.status >= 400:
            raise DockerFailure(response.status)
        # 204 and idempotent 304 stop/start responses both have no JSON body.
        return json.loads(data) if data else None
    finally:
        connection.close()


def error_marker(stage, error):
    category = 'operation_failed'
    if isinstance(error, TimeoutError):
        category = 'docker_socket_timeout'
    elif isinstance(error, DockerFailure):
        category = 'docker_http_error'
    elif isinstance(error, (ConnectionError, OSError)):
        category = 'local_transport_error'
    elif isinstance(error, ValueError):
        category = 'invalid_response'
    record = {'result': 'NATIVE_RELEASE_STAGE_ERROR', 'stage': stage, 'category': category}
    status = getattr(error, 'status', None)
    if isinstance(status, int) and 400 <= status <= 599:
        record['docker_status'] = status
    print(json.dumps(record), flush=True)


def load_helper():
    spec = importlib.util.spec_from_file_location('keyo_image_deployment', ROOT / 'scripts/vps-deploy-images.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    # Keep inspect-preserving construction/storage validation, but never inherit
    # the old helper's 30-second socket timeout for a 30-second Docker stop.
    helper.api = docker_api
    return helper


def run_command(args, timeout=20):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError('Required local command unavailable or timed out') from None
    if result.returncode:
        # Neither process output nor arguments are safe to print wholesale.
        raise RuntimeError('Required local command failed')
    return result.stdout


def manifest():
    return {name: hashlib.sha256((ROOT / SOURCE_DIR / name).read_bytes()).hexdigest() for name in SOURCES}


def missing_container(helper, name):
    try:
        return helper.inspect(name)
    except RuntimeError as error:
        if 'status=404' not in str(error):
            raise
        return None


def port_owned_by(pid):
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return False
    lines = run_command(['ss', '-H', '-lntp', '( sport = :3011 )']).splitlines()
    if not lines:
        return False
    for line in lines:
        owners = re.findall(r'pid=(\d+)', line)
        if not owners or any(int(owner) != pid for owner in owners):
            return False
    return True


def live_process(helper, name, expected_image=None):
    current = helper.inspect(name)
    state = current.get('State') or {}
    pid = state.get('Pid')
    if state.get('Running') is not True or state.get('Restarting') is not False or not port_owned_by(pid):
        raise RuntimeError('Native gateway does not own a stable live listener')
    if expected_image is not None and current.get('Image') != expected_image:
        raise RuntimeError('Native gateway image verification failed')
    return pid


def source_matches(name, expected):
    paths = ['/app/' + source for source in SOURCES]
    raw = run_command(['docker', 'exec', name, 'sha256sum', *paths])
    actual = {}
    for line in raw.splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})\s+/app/([A-Za-z0-9_.-]+)', line)
        if not match or match[2] not in SOURCES or match[2] in actual:
            raise RuntimeError('Native gateway source verification failed')
        actual[match[2]] = match[1]
    if actual != expected:
        raise RuntimeError('Native gateway source verification failed')


def verify(helper, name, config, expected_image, expected_sources=None):
    # Docker start returns before Node has opened its socket. Allow a bounded
    # startup window, then require two complete consecutive stable rounds.
    for attempt in range(20):
        try:
            live_process(helper, name, expected_image)
            break
        except RuntimeError:
            if attempt == 19:
                raise RuntimeError('Native gateway listener did not become ready') from None
            time.sleep(1)
    stable_pid = None
    for _ in range(2):
        pid = live_process(helper, name, expected_image)
        if expected_sources is not None:
            source_matches(name, expected_sources)
        helper.health(name, 3011, config, 'native')
        # A process exiting during the HTTP probe cannot satisfy this round.
        if live_process(helper, name, expected_image) != pid:
            raise RuntimeError('Native gateway process changed during verification')
        if stable_pid is not None and pid != stable_pid:
            raise RuntimeError('Native gateway process changed between verification rounds')
        stable_pid = pid
        time.sleep(1)
    return stable_pid


def runtime_preflight(helper, original):
    env = helper.environments(original['Config'])
    if (original.get('HostConfig') or {}).get('NetworkMode') != 'host':
        raise RuntimeError('Native safe deployment requires the inspected host network')
    if env.get('PORT', '3011') != '3011' or env.get('LISTEN_HOST', '127.0.0.1') not in ('127.0.0.1', '::1', '0.0.0.0', '::'):
        raise RuntimeError('Native safe deployment requires the existing local port 3011')
    return live_process(helper, NAME, original['Image'])


def permitted_loop(helper, name, info):
    state = info.get('State') or {}
    env = helper.environments(info.get('Config') or {})
    return (name == KNOWN_LOOP_NAME and info.get('Image') == KNOWN_LOOP_IMAGE
            and state.get('Running') is True and state.get('Restarting') is True
            and state.get('Pid') == 0 and not isinstance(state.get('Pid'), bool)
            and (info.get('HostConfig') or {}).get('NetworkMode') == 'host'
            and env.get('PORT', '3011') == '3011')


def active_backups(helper):
    names = run_command(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines()
    allowed = []
    for name in names:
        if not name.startswith(NAME + '-') or not re.fullmatch(r'[A-Za-z0-9_.-]+', name):
            continue
        info = helper.inspect(name)
        state = info.get('State') or {}
        if state.get('Running') or state.get('Restarting') or state.get('Pid', 0):
            if not permitted_loop(helper, name, info):
                raise RuntimeError('Unknown active native backup; no service was stopped')
            allowed.append(name)
    return allowed


def update_restart(helper, name, policy):
    helper.api('POST', '/containers/' + name + '/update', {'RestartPolicy': copy.deepcopy(policy)})


def stopped(info):
    state = info.get('State') or {}
    return state.get('Running') is False and state.get('Restarting') is False and state.get('Pid') == 0


def stop_and_wait(helper, name, expected_id):
    # A timed-out HTTP response is an unknown operation outcome. Re-inspect and
    # wait/retry the SAME stop; never race rename/start against a stopping PID.
    for attempt in range(3):
        info = helper.inspect(name)
        if info.get('Id') != expected_id:
            raise RuntimeError('Unexpected container identity during native stop')
        if stopped(info):
            return
        try:
            helper.api('POST', '/containers/' + name + '/stop?t=30')
        except (TimeoutError, ConnectionError, OSError, DockerFailure) as error:
            error_marker('stop_wait_retry', error)
            if isinstance(error, DockerFailure) and error.status not in (304, 409, 500, 503):
                raise
        for _ in range(5):
            info = helper.inspect(name)
            if info.get('Id') != expected_id:
                raise RuntimeError('Unexpected container identity during native stop')
            if stopped(info):
                return
            time.sleep(1)
        time.sleep(attempt + 1)
    raise RuntimeError('Native container did not finish stopping')


def start_with_backoff(helper, name, expected_id):
    for attempt in range(4):
        info = helper.inspect(name)
        if info.get('Id') != expected_id:
            raise RuntimeError('Unexpected container identity during native start')
        state = info.get('State') or {}
        if state.get('Running') is True and state.get('Restarting') is False and state.get('Pid', 0) > 0:
            return
        try:
            helper.api('POST', '/containers/' + name + '/start')
            return
        except (TimeoutError, ConnectionError, OSError, DockerFailure) as error:
            error_marker('start_wait_retry', error)
            if isinstance(error, DockerFailure) and error.status not in (304, 409, 500, 503):
                raise
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def restore_native(helper, original, backup, replacement_image):
    stage = 'rollback_inspect'
    try:
        current = missing_container(helper, NAME)
        if current is not None and current.get('Id') != original.get('Id'):
            if current.get('Image') != replacement_image:
                raise RuntimeError('Unexpected native container blocks rollback')
            stage = 'rollback_stop_replacement'
            update_restart(helper, NAME, {'Name': 'no', 'MaximumRetryCount': 0})
            stop_and_wait(helper, NAME, current['Id'])
            helper.api('DELETE', '/containers/' + NAME + '?force=true')
            current = None
        if current is None:
            stage = 'rollback_rename_original'
            saved = helper.inspect(backup)
            if saved.get('Id') != original.get('Id'):
                raise RuntimeError('Unexpected native backup blocks rollback')
            helper.api('POST', '/containers/' + backup + '/rename?name=' + NAME)
        stage = 'rollback_wait_original_stop'
        stop_and_wait(helper, NAME, original['Id'])
        stage = 'rollback_restore_restart_policy'
        update_restart(helper, NAME, original['HostConfig']['RestartPolicy'])
        stage = 'rollback_start_original'
        start_with_backoff(helper, NAME, original['Id'])
        stage = 'rollback_verify_original'
        verify(helper, NAME, original['Config'], original['Image'])
    except Exception as error:
        error_marker(stage, error)
        raise


def deploy_native():
    helper = load_helper()
    original = helper.inspect(NAME)
    runtime_preflight(helper, original)
    loops = active_backups(helper)
    suffix = str(time.time_ns()) + '-' + str(os.getpid())
    backup = NAME + '-previous-' + suffix
    image = 'keyo-apimart-passthrough:native-' + suffix
    if missing_container(helper, backup) is not None:
        raise RuntimeError('Unique native backup name is already in use')
    plan = helper.replacement(original, 'native', image)
    helper.validate_wallet(original, plan, helper.inspect('ai-relay-new-api'))
    expected = manifest()
    helper.run_checked(['docker', 'build', '-t', image, str(ROOT / SOURCE_DIR)])
    built_image = helper.api('GET', '/images/' + image + '/json')['Id']
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', str(built_image)):
        raise RuntimeError('Built native image identity is unavailable')
    if manifest() != expected:
        raise RuntimeError('Native source changed during build; current service retained')
    runtime_preflight(helper, original)
    if active_backups(helper) != loops:
        raise RuntimeError('Native backup state changed during build; current service retained')
    for name in loops:
        # Re-inspect immediately before the exceptional, explicitly pinned stop.
        if not permitted_loop(helper, name, helper.inspect(name)):
            raise RuntimeError('Known inactive native restart loop changed; current service retained')
        runtime_preflight(helper, original)
        update_restart(helper, name, {'Name': 'no', 'MaximumRetryCount': 0})
        stop_and_wait(helper, name, helper.inspect(name)['Id'])
        stopped = helper.inspect(name).get('State') or {}
        if stopped.get('Running') or stopped.get('Restarting') or stopped.get('Pid', 0):
            raise RuntimeError('Known native restart loop did not stop; current service retained')
        print('NATIVE_KNOWN_RESTART_LOOP_STOPPED', flush=True)
    # No environment values, arbitrary Docker output or request logs are printed.
    stage = 'disable_original_restart'
    try:
        update_restart(helper, NAME, {'Name': 'no', 'MaximumRetryCount': 0})
        stage = 'stop_original'
        stop_and_wait(helper, NAME, original['Id'])
        stage = 'rename_original'
        helper.api('POST', '/containers/' + NAME + '/rename?name=' + backup)
        stage = 'create_replacement'
        created = helper.api('POST', '/containers/create?name=' + NAME, plan)
        stage = 'start_replacement'
        start_with_backoff(helper, NAME, created['Id'])
        stage = 'verify_replacement'
        pid = verify(helper, NAME, plan, built_image, expected)
    except Exception as error:
        error_marker(stage, error)
        try:
            restore_native(helper, original, backup, built_image)
        except Exception:
            print('NATIVE_RELEASE_ROLLBACK_INCOMPLETE')
            raise RuntimeError('Native deployment failed; native rollback incomplete') from None
        print('NATIVE_RELEASE_ROLLED_BACK')
        raise RuntimeError('Native deployment failed; previous native service restored') from None
    print(json.dumps({'result': 'NATIVE_RELEASE_OK', 'pid': pid, 'image_id': built_image,
                      'source_sha256': expected, 'stable_checks': 2, 'rollback_container': backup}))


def main():
    if len(sys.argv) != 2 or sys.argv[1] != 'native':
        raise RuntimeError('Only the explicit native deployment action is supported')
    with open('/run/lock/keyo-image-deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy_native()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Full exception text can include runtime configuration and is withheld.
        raise SystemExit('Native release stopped; inspect sanitized release markers and container state')
