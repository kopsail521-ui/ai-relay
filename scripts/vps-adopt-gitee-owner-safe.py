#!/usr/bin/env python3
"""Normalize pinned Gitee Docker names without restarting the serving container.

No build/deploy/model calls. Requires all five identity pins from read-only evidence.
"""
import argparse
import copy
import fcntl
import importlib.util
import json
from pathlib import Path
import re
import time

NAME = 'ai-relay-gitee-passthrough'
LOCK = '/run/lock/keyo-image-deploy.lock'


def load_runner():
    spec = importlib.util.spec_from_file_location('keyo_adopt_gitee_runner',
                                                Path(__file__).with_name('vps-deploy-gitee-safe.py'))
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    return runner


def valid_pins(pins):
    for key in ('canonical_id', 'owner_id'):
        if not re.fullmatch(r'[0-9a-f]{64}', str(getattr(pins, key, ''))):
            raise ValueError('A full Docker identity is required')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,150}', str(pins.owner_name)):
        raise ValueError('Invalid owner name')
    if any(type(getattr(pins, key)) is not int or getattr(pins, key) <= 0 for key in ('pid', 'start_ticks')):
        raise ValueError('Positive process identity is required')


def inspect_id(helper, identity):
    info = helper.inspect(identity)
    if info.get('Id') != identity:
        raise RuntimeError('Docker identity changed')
    return info


def optional_inspect(helper, name):
    try:
        return helper.inspect(name)
    except Exception as error:
        if getattr(error, 'status', None) == 404 or 'status=404' in str(error):
            return None
        raise


def name_of(info):
    return str(info.get('Name', '')).lstrip('/')


def process_pin(pid, owner_id, proc=Path('/proc')):
    directory = proc / str(pid)
    with (directory / 'stat').open('rb') as stream:
        raw = stream.read(16385)
    if len(raw) > 16384:
        raise RuntimeError('Invalid process identity')
    tail = raw.decode(errors='replace').rpartition(') ')[2].split()
    ticks = int(tail[19])
    with (directory / 'cgroup').open('rb') as stream:
        raw = stream.read(16385)
    if len(raw) > 16384:
        raise RuntimeError('Invalid process cgroup')
    ids = {value for line in raw.decode(errors='replace').splitlines() for value in
           re.findall(r'(?:^|/)docker(?:-|/)([0-9a-f]{64})(?:\.scope)?(?=/|$)', line.strip())}
    if ids != {owner_id}:
        raise RuntimeError('Listener does not belong to pinned container')
    return ticks


def runtime_snapshot(info):
    return copy.deepcopy({key: info.get(key) for key in ('Image', 'Config', 'HostConfig', 'Mounts')})


def check_wallet(runner, helper, owner):
    plan = copy.deepcopy(owner['Config'])
    plan['HostConfig'] = copy.deepcopy(owner['HostConfig'])
    runner.validate_wallet(helper, owner, plan, helper.inspect('ai-relay-new-api'))


def verify_owner(runner, native, helper, pins, expected_name, baseline=None):
    owner = inspect_id(helper, pins.owner_id)
    state = owner.get('State') or {}
    env = helper.environments(owner.get('Config') or {})
    if (name_of(owner) != expected_name or state.get('Running') is not True
            or state.get('Restarting') is not False or state.get('Pid') != pins.pid
            or (owner.get('HostConfig') or {}).get('NetworkMode') != 'host'
            or env.get('PORT', '3010') != '3010'
            or env.get('LISTEN_HOST', '127.0.0.1') not in ('127.0.0.1', '::1', '0.0.0.0', '::')):
        raise RuntimeError('Pinned serving container is not stable')
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', str(owner.get('Image'))):
        raise RuntimeError('Serving image identity is invalid')
    listener = runner.listener(native)
    if not listener['complete'] or listener['pids'] != [pins.pid]:
        raise RuntimeError('Port 3010 has an unrecognized owner')
    if process_pin(pins.pid, pins.owner_id) != pins.start_ticks:
        raise RuntimeError('Pinned serving process has changed')
    check_wallet(runner, helper, owner)
    hashes = runner.source_hashes(native, pins.owner_id)
    if not hashes.get('server.mjs') or not hashes.get('catalog.json'):
        raise RuntimeError('Serving source manifest is incomplete')
    health = runner.local_health(owner['Config'])
    snapshot = {'runtime': runtime_snapshot(owner), 'sources': hashes, 'health': health}
    if baseline is not None and snapshot != baseline:
        raise RuntimeError('Serving configuration, sources or health changed')
    again = inspect_id(helper, pins.owner_id)
    second_listener = runner.listener(native)
    if (name_of(again) != expected_name or runtime_snapshot(again) != snapshot['runtime']
            or (again.get('State') or {}).get('Pid') != pins.pid
            or (again.get('State') or {}).get('Running') is not True
            or (again.get('State') or {}).get('Restarting') is not False
            or not second_listener['complete'] or second_listener['pids'] != [pins.pid]
            or process_pin(pins.pid, pins.owner_id) != pins.start_ticks):
        raise RuntimeError('Serving identity changed during verification')
    return snapshot


def verify_conflict(helper, pins, expected=None):
    conflict = inspect_id(helper, pins.canonical_id)
    by_name = helper.inspect(NAME)
    state = conflict.get('State') or {}
    if (by_name.get('Id') != pins.canonical_id or name_of(conflict) != NAME
            or state.get('Pid') != 0 or state.get('ExitCode') != 1
            or not (state.get('Restarting') is True or state.get('Running') is False)):
        raise RuntimeError('Canonical conflict is not the pinned failed container')
    if expected is not None and runtime_snapshot(conflict) != expected:
        raise RuntimeError('Canonical conflict configuration changed')
    return conflict


def ensure_disabled(native, helper, identity):
    inspect_id(helper, identity)
    try:
        native.update_restart(helper, identity, {'Name': 'no', 'MaximumRetryCount': 0})
    except Exception:
        # A timed-out update may have succeeded; its state is the authority.
        if (inspect_id(helper, identity).get('HostConfig') or {}).get('RestartPolicy', {}).get('Name') != 'no':
            raise
    if (inspect_id(helper, identity).get('HostConfig') or {}).get('RestartPolicy', {}).get('Name') != 'no':
        raise RuntimeError('Conflicting restart loop was not disabled')


def rename_verified(helper, identity, target):
    inspect_id(helper, identity)
    try:
        helper.api('POST', '/containers/' + identity + '/rename?name=' + target)
    except Exception:
        # Reconcile an unknown response without renaming or stopping anything else.
        if name_of(inspect_id(helper, identity)) != target:
            raise
    if name_of(inspect_id(helper, identity)) != target:
        raise RuntimeError('Container rename was not confirmed')


def conflict_stopped(native, helper, pins, baseline=None):
    bad = inspect_id(helper, pins.canonical_id)
    if not native.stopped(bad) or (bad.get('HostConfig') or {}).get('RestartPolicy', {}).get('Name') != 'no':
        raise RuntimeError('Conflicting container is not safely stopped')
    if baseline is not None:
        actual, expected = runtime_snapshot(bad), copy.deepcopy(baseline)
        for item in (actual, expected):
            item['HostConfig'].pop('RestartPolicy', None)
        if actual != expected:
            raise RuntimeError('Conflicting container configuration changed')
    return bad


def rollback_names(native, helper, pins, original_owner_name, backup_name):
    result = {'result': 'GITEE_ADOPT_ROLLBACK', 'bad_loop_disabled': False, 'names_restored': False}
    try:
        ensure_disabled(native, helper, pins.canonical_id)
        result['bad_loop_disabled'] = True
        owner = inspect_id(helper, pins.owner_id)
        if name_of(owner) == NAME and optional_inspect(helper, original_owner_name) is None:
            rename_verified(helper, pins.owner_id, original_owner_name)
        owner = inspect_id(helper, pins.owner_id)
        bad = inspect_id(helper, pins.canonical_id)
        canonical = optional_inspect(helper, NAME)
        if name_of(owner) == original_owner_name and name_of(bad) == backup_name and canonical is None:
            rename_verified(helper, pins.canonical_id, NAME)
        owner = inspect_id(helper, pins.owner_id)
        bad = inspect_id(helper, pins.canonical_id)
        result['names_restored'] = name_of(owner) == original_owner_name and name_of(bad) == NAME
        result['owner_running'] = ((owner.get('State') or {}).get('Running') is True
                                   and (owner.get('State') or {}).get('Pid') == pins.pid)
        result['owner_has_canonical_name'] = name_of(owner) == NAME
        result['status'] = 'names_restored' if result['names_restored'] else 'manual_name_review_required'
    except Exception:
        result['status'] = 'manual_name_review_required'
    print(json.dumps(result), flush=True)
    return result


def emit_success(result, pins, snapshot, backup=None, resumed=False):
    record = {'result': result, 'owner_id': pins.owner_id, 'canonical_name': NAME,
              'pid': pins.pid, 'start_ticks': pins.start_ticks, 'owner_never_restarted': True,
              'source_sha256': snapshot['sources'], 'health': snapshot['health'],
              'image_id': snapshot['runtime']['Image']}
    if backup:
        record['disabled_conflict_name'] = backup
    if resumed:
        record['resumed_interruption'] = True
    print(json.dumps(record), flush=True)
    return record


def adopt(runner, native, helper, pins):
    valid_pins(pins)
    stage, mutation_started, backup = 'preflight', False, None
    try:
        canonical = optional_inspect(helper, NAME)
        if canonical is None:
            # An earlier invocation may have exited after moving the failed
            # canonical aside. Resume only this exact, disabled conflict state.
            if pins.owner_id == pins.canonical_id or pins.owner_name == NAME:
                raise RuntimeError('Distinct interrupted identities required')
            bad = conflict_stopped(native, helper, pins)
            backup = name_of(bad)
            expected_backup = re.escape(NAME) + r'-conflict-[0-9]{14}-' + pins.canonical_id[:12]
            if re.fullmatch(expected_backup, backup) is None:
                raise RuntimeError('Pinned conflict is not a recognized adoption backup')
            before_bad = runtime_snapshot(bad)
            baseline = verify_owner(runner, native, helper, pins, pins.owner_name)
            time.sleep(1)
            verify_owner(runner, native, helper, pins, pins.owner_name, baseline)
            bad = conflict_stopped(native, helper, pins, before_bad)
            if name_of(bad) != backup or optional_inspect(helper, NAME) is not None:
                raise RuntimeError('Interrupted adoption names changed')
            stage, mutation_started = 'resume_rename_serving_owner', True
            rename_verified(helper, pins.owner_id, NAME)
            stage = 'resumed_stable_verification'
            for _ in range(2):
                verify_owner(runner, native, helper, pins, NAME, baseline)
                bad = conflict_stopped(native, helper, pins, before_bad)
                if name_of(bad) != backup:
                    raise RuntimeError('Interrupted conflict name changed')
                time.sleep(1)
            return emit_success('GITEE_ADOPT_OK', pins, baseline, backup, resumed=True)
        if canonical.get('Id') == pins.owner_id:
            baseline = verify_owner(runner, native, helper, pins, NAME)
            if pins.canonical_id != pins.owner_id:
                conflict_stopped(native, helper, pins)
            time.sleep(1)
            verify_owner(runner, native, helper, pins, NAME, baseline)
            return emit_success('GITEE_ADOPT_ALREADY_NORMALIZED', pins, baseline)
        if pins.owner_id == pins.canonical_id or pins.owner_name == NAME:
            raise RuntimeError('Distinct serving and conflicting identities required')
        bad = verify_conflict(helper, pins)
        before_bad = runtime_snapshot(bad)
        baseline = verify_owner(runner, native, helper, pins, pins.owner_name)
        time.sleep(1)
        verify_owner(runner, native, helper, pins, pins.owner_name, baseline)
        verify_conflict(helper, pins, before_bad)
        backup = NAME + '-conflict-' + time.strftime('%Y%m%d%H%M%S', time.gmtime()) + '-' + pins.canonical_id[:12]
        if optional_inspect(helper, backup) is not None:
            raise RuntimeError('Conflict backup name already exists')
        stage, mutation_started = 'disable_failed_canonical', True
        ensure_disabled(native, helper, pins.canonical_id)
        stage = 'stop_failed_canonical'
        native.stop_and_wait(helper, pins.canonical_id, pins.canonical_id)
        conflict_stopped(native, helper, pins, before_bad)
        verify_owner(runner, native, helper, pins, pins.owner_name, baseline)
        if helper.inspect(NAME).get('Id') != pins.canonical_id:
            raise RuntimeError('Canonical name changed before rename')
        stage = 'rename_failed_canonical'
        rename_verified(helper, pins.canonical_id, backup)
        if optional_inspect(helper, NAME) is not None:
            raise RuntimeError('Canonical name was claimed concurrently')
        stage = 'rename_serving_owner'
        verify_owner(runner, native, helper, pins, pins.owner_name, baseline)
        rename_verified(helper, pins.owner_id, NAME)
        stage = 'stable_verification'
        for _ in range(2):
            verify_owner(runner, native, helper, pins, NAME, baseline)
            conflict_stopped(native, helper, pins, before_bad)
            time.sleep(1)
        return emit_success('GITEE_ADOPT_OK', pins, baseline, backup)
    except Exception:
        print(json.dumps({'result': 'GITEE_ADOPT_BLOCKED', 'stage': stage,
                          'mutation_started': mutation_started, 'owner_stop_requested': False}), flush=True)
        if mutation_started:
            rollback_names(native, helper, pins, pins.owner_name, backup)
        raise RuntimeError('Gitee owner normalization did not complete; inspect sanitized markers') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('canonical-id', 'owner-id', 'owner-name'):
        parser.add_argument('--' + key, required=True)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--start-ticks', type=int, required=True)
    pins = parser.parse_args()
    valid_pins(pins)
    runner = load_runner()
    native = runner.load_native()
    helper = native.load_helper()
    with open(LOCK, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        adopt(runner, native, helper, pins)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'result': 'GITEE_ADOPT_ENTRYPOINT_FAILED', 'details_redacted': True}), flush=True)
        raise SystemExit(1)
