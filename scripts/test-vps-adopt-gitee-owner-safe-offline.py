#!/usr/bin/env python3
"""Mock Engine, local proc and wallet metadata only. No Docker/network/model calls."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

SCRIPTS = Path(__file__).resolve().parent
if os.name == 'nt':
    sys.modules.setdefault('fcntl', types.SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=Mock()))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


adopt = load('adopt_fixture', 'vps-adopt-gitee-owner-safe.py')
runner = load('adopt_runner_fixture', 'vps-deploy-gitee-safe.py')
native = load('adopt_native_fixture', 'vps-deploy-native-images-safe.py')
helper = load('adopt_helper_fixture', 'vps-deploy-images.py')
BAD, OWNER, OTHER = 'e' * 64, '9' * 64, 'f' * 64
OLD_NAME = adopt.NAME + '-clef-backup-20261014000149-83576'
PRIVATE = 'PRIVATE_DO_NOT_PRINT_729183'


def fixture(root, identity, name, serving):
    return {'Id': identity, 'Name': '/' + name, 'Image': 'sha256:' + ('3' if serving else '0') * 64,
            'Config': {'Env': ['GITEE_API_KEY=' + PRIVATE, 'NEW_API_DB=/data/one-api.db',
                               'PORT=3010', 'LISTEN_HOST=127.0.0.1'], 'User': '1000:1001',
                       'Cmd': ['node', 'server.mjs'], 'Entrypoint': ['docker-entrypoint.sh'],
                       'WorkingDir': '/app', 'Image': 'legacy-local', 'Labels': {'private': PRIVATE}},
            'HostConfig': {'NetworkMode': 'host', 'RestartPolicy': {'Name': 'always', 'MaximumRetryCount': 0},
                           'Binds': [str(root / 'wallet') + ':/data:rw'], 'Memory': 268435456},
            'Mounts': [{'Type': 'bind', 'Source': str(root / 'wallet'), 'Destination': '/data', 'RW': True}],
            'State': {'Running': True, 'Restarting': not serving, 'Pid': 1858 if serving else 0,
                      'Status': 'running' if serving else 'restarting', 'ExitCode': 0 if serving else 1}}


class Engine:
    def __init__(self, root):
        self.items = {BAD: fixture(root, BAD, adopt.NAME, False), OWNER: fixture(root, OWNER, OLD_NAME, True)}
        wallet = fixture(root, OTHER, 'ai-relay-new-api', True)
        wallet['Config'] = {'Env': [], 'WorkingDir': '/data'}
        self.items[OTHER] = wallet
        self.events = []
        self.health_fail = False
        self.final_health_change = False
        self.stop_mode = None
        self.unknown_renames = set()
        self.fail_owner_rename = False
        self.ignore_owner_rename = False
        self.claim_canonical_after_bad_rename = False
        self.claim_old_owner_after_rename = False
        self.foreign_pid = None
        self.proc_owner = OWNER
        self.proc_ticks = 924
        self.canonical_inspects = 0
        self.canonical_changes_before_mutation = False
        self.source_changes_after_rename = False
        self.config_changes_after_rename = False

    def find(self, key):
        if key in self.items:
            return self.items[key]
        for item in self.items.values():
            if item['Name'].lstrip('/') == key:
                return item
        raise native.DockerFailure(404)

    def api(self, method, route, body=None):
        self.events.append((method, route, copy.deepcopy(body)))
        parsed = urlsplit(route)
        parts = parsed.path.split('/')
        key, action = parts[2], parts[3]
        item = self.find(key)
        if method == 'GET' and action == 'json':
            if key == adopt.NAME:
                self.canonical_inspects += 1
                if self.canonical_changes_before_mutation and self.canonical_inspects >= 3:
                    changed = copy.deepcopy(item)
                    changed['Id'] = 'a' * 64
                    return changed
            return copy.deepcopy(item)
        if method != 'POST':
            raise AssertionError('Forbidden mutation')
        if action == 'update':
            if item['Id'] != BAD: raise AssertionError('Live owner update forbidden')
            item['HostConfig']['RestartPolicy'] = copy.deepcopy(body['RestartPolicy'])
        elif action == 'stop':
            if item['Id'] != BAD: raise AssertionError('Live owner stop forbidden')
            if self.stop_mode == 'never': raise TimeoutError(PRIVATE)
            item['State'].update(Running=False, Restarting=False, Pid=0, Status='exited')
            if self.stop_mode == 'after':
                self.stop_mode = None
                raise TimeoutError(PRIVATE)
        elif action == 'rename':
            target = parse_qs(parsed.query)['name'][0]
            if item['Id'] == OWNER and target == adopt.NAME:
                if self.fail_owner_rename: raise RuntimeError(PRIVATE)
                if self.ignore_owner_rename: return
            try:
                self.find(target)
            except native.DockerFailure:
                pass
            else:
                raise native.DockerFailure(409)
            item['Name'] = '/' + target
            if item['Id'] == BAD and self.claim_canonical_after_bad_rename:
                alien = fixture(Path('/irrelevant'), 'a' * 64, adopt.NAME, False)
                self.items[alien['Id']] = alien
            if item['Id'] == OWNER and target == adopt.NAME:
                if self.claim_old_owner_after_rename:
                    alien = fixture(Path('/irrelevant'), 'b' * 64, OLD_NAME, False)
                    self.items[alien['Id']] = alien
                if self.config_changes_after_rename:
                    item['Config']['Labels']['external_change'] = 'yes'
            if item['Id'] in self.unknown_renames:
                self.unknown_renames.remove(item['Id'])
                raise TimeoutError(PRIVATE)
        else:
            raise AssertionError('No start/restart/delete/build is permitted')

    def command(self, args, timeout=20):
        self.events.append(('COMMAND', copy.deepcopy(args), None))
        if args[0] == 'ss':
            pid = self.foreign_pid if self.foreign_pid is not None else 1858
            return 'LISTEN 0 511 127.0.0.1:3010 *:* users:(("node",pid=%s,fd=20))' % pid
        if args[:3] == ['docker', 'exec', OWNER]:
            sources = {'server.mjs': '8' * 64, 'decisions.mjs': None,
                       'fix-marketplace-meta.mjs': '0' * 64, 'catalog.json': 'b' * 64}
            if self.source_changes_after_rename and self.items[OWNER]['Name'] == '/' + adopt.NAME:
                sources['server.mjs'] = 'f' * 64
            return json.dumps(sources)
        raise AssertionError('Unexpected process or Docker command')

    def process(self, pid, identity):
        if pid != 1858 or identity != self.proc_owner:
            raise RuntimeError(PRIVATE)
        return self.proc_ticks

    def health(self, config):
        renamed = self.items[OWNER]['Name'] == '/' + adopt.NAME
        if self.health_fail and renamed:
            raise RuntimeError(PRIVATE)
        return {'build': None, 'ok': True, 'database_present': True,
                'models': 40 if self.final_health_change and renamed else 39}


class AdoptionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'wallet').mkdir()
        self.engine = Engine(self.root)
        self.pins = types.SimpleNamespace(canonical_id=BAD, owner_id=OWNER, owner_name=OLD_NAME, pid=1858, start_ticks=924)
        self.initial_owner = copy.deepcopy(self.engine.items[OWNER])
        self.addCleanup(patch.stopall)
        patch.object(helper, 'ROOT', self.root).start()
        patch.object(helper, 'api', self.engine.api).start()
        patch.object(native, 'run_command', self.engine.command).start()
        patch.object(native.time, 'sleep').start()
        patch.object(native.subprocess, 'run', side_effect=AssertionError('Real subprocess forbidden')).start()
        patch.object(native, 'NativeUnixHTTP', side_effect=AssertionError('Real Docker forbidden')).start()
        patch.object(helper, 'UnixHTTP', side_effect=AssertionError('Real Docker forbidden')).start()
        patch.object(runner, 'local_health', self.engine.health).start()
        patch.object(adopt, 'process_pin', self.engine.process).start()
        patch.object(adopt.time, 'sleep').start()

    def execute(self, expect_failure=False):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            if expect_failure:
                with self.assertRaises((RuntimeError, ValueError)):
                    adopt.adopt(runner, native, helper, self.pins)
                result = None
            else:
                result = adopt.adopt(runner, native, helper, self.pins)
        raw = output.getvalue()
        self.assertNotIn(PRIVATE, raw)
        self.assertNotIn('GITEE_API_KEY', raw)
        self.assert_no_owner_disruption()
        return result, [json.loads(line) for line in raw.splitlines()]

    def assert_no_owner_disruption(self):
        owner = self.engine.items[OWNER]
        self.assertTrue(owner['State']['Running'])
        self.assertFalse(owner['State']['Restarting'])
        self.assertEqual(owner['State']['Pid'], 1858)
        for method, route, _ in self.engine.events:
            if method == 'POST':
                self.assertRegex(route, r'^/containers/[0-9a-f]{64}/(?:update|stop\?t=30|rename\?name=[A-Za-z0-9_.-]+)$')
                if '/containers/' + OWNER + '/' in route:
                    self.assertIn('/rename?', route)
            self.assertNotEqual(method, 'DELETE')

    def assert_no_mutations(self):
        self.assertFalse(any(event[0] in ('POST', 'DELETE') for event in self.engine.events))

    def assert_rolled_back(self):
        self.assertEqual(self.engine.items[OWNER]['Name'], '/' + OLD_NAME)
        self.assertEqual(self.engine.items[BAD]['Name'], '/' + adopt.NAME)
        self.assertEqual(self.engine.items[BAD]['HostConfig']['RestartPolicy']['Name'], 'no')

    def test_success_preserves_live_config_mounts_and_pid(self):
        result, _ = self.execute()
        self.assertEqual(result['result'], 'GITEE_ADOPT_OK')
        self.assertEqual(self.engine.items[OWNER]['Name'], '/' + adopt.NAME)
        self.assertTrue(self.engine.items[BAD]['Name'].startswith('/' + adopt.NAME + '-conflict-'))
        self.assertFalse(self.engine.items[BAD]['State']['Running'])
        self.assertEqual(self.engine.items[BAD]['HostConfig']['RestartPolicy']['Name'], 'no')
        for key in ('Image', 'Config', 'HostConfig', 'Mounts', 'State'):
            self.assertEqual(self.engine.items[OWNER][key], self.initial_owner[key])
        self.assertIsNone(result['source_sha256']['decisions.mjs'])
        self.assertIsNone(result['health']['build'])

    def test_repeating_successful_pins_is_verified_and_idempotent(self):
        self.execute()
        self.engine.events.clear()
        result, _ = self.execute()
        self.assertEqual(result['result'], 'GITEE_ADOPT_ALREADY_NORMALIZED')
        self.assert_no_mutations()

    def interrupted_gap(self):
        backup = adopt.NAME + '-conflict-20261025010000-' + BAD[:12]
        self.engine.items[BAD]['Name'] = '/' + backup
        self.engine.items[BAD]['State'].update(Running=False, Restarting=False, Pid=0, Status='exited')
        self.engine.items[BAD]['HostConfig']['RestartPolicy'] = {'Name': 'no', 'MaximumRetryCount': 0}
        return backup

    def test_interrupted_gap_resumes_with_only_live_owner_rename(self):
        backup = self.interrupted_gap()
        result, _ = self.execute()
        self.assertEqual(result['result'], 'GITEE_ADOPT_OK')
        self.assertTrue(result['resumed_interruption'])
        self.assertEqual(self.engine.items[OWNER]['Name'], '/' + adopt.NAME)
        self.assertEqual(self.engine.items[BAD]['Name'], '/' + backup)
        mutations = [event for event in self.engine.events if event[0] == 'POST']
        self.assertEqual(len(mutations), 1)
        self.assertEqual(mutations[0][1], '/containers/' + OWNER + '/rename?name=' + adopt.NAME)
        for key in ('Image', 'Config', 'HostConfig', 'Mounts', 'State'):
            self.assertEqual(self.engine.items[OWNER][key], self.initial_owner[key])

    def test_interrupted_gap_rejects_wrong_backup_or_running_or_restartable_bad(self):
        backup = self.interrupted_gap()
        self.engine.items[BAD]['Name'] = '/' + adopt.NAME + '-unrelated-backup'
        self.execute(True)
        self.assert_no_mutations()
        self.engine.items[BAD]['Name'] = '/' + backup
        self.engine.items[BAD]['State'].update(Running=True, Pid=2000)
        self.execute(True)
        self.assert_no_mutations()
        self.engine.items[BAD]['State'].update(Running=False, Pid=0)
        self.engine.items[BAD]['HostConfig']['RestartPolicy']['Name'] = 'always'
        self.execute(True)
        self.assert_no_mutations()

    def test_interrupted_gap_rejects_new_canonical_occupant(self):
        self.interrupted_gap()
        alien = fixture(self.root, 'a' * 64, adopt.NAME, False)
        self.engine.items[alien['Id']] = alien
        self.execute(True)
        self.assert_no_mutations()
        self.assertEqual(self.engine.items[alien['Id']]['Name'], '/' + adopt.NAME)

    def test_interrupted_resume_failure_rolls_back_using_existing_backup(self):
        self.interrupted_gap()
        self.engine.fail_owner_rename = True
        _, output = self.execute(True)
        self.assert_rolled_back()
        self.assertTrue(output[-1]['names_restored'])
        self.assertTrue(output[-1]['bad_loop_disabled'])

    def test_invalid_pin_syntax_never_reaches_docker(self):
        self.pins.owner_id = '9;bad-command'
        self.execute(True)
        self.assertEqual(self.engine.events, [])

    def test_wrong_canonical_or_owner_identity_blocks_without_mutation(self):
        self.pins.canonical_id = 'a' * 64
        self.execute(True)
        self.assert_no_mutations()
        self.pins.canonical_id = BAD
        self.pins.owner_id = 'a' * 64
        self.execute(True)
        self.assert_no_mutations()

    def test_canonical_is_no_longer_failed_blocks_without_mutation(self):
        self.engine.items[BAD]['State']['ExitCode'] = 0
        self.execute(True)
        self.assert_no_mutations()

    def test_wrong_pid_cgroup_and_start_ticks_each_block(self):
        for field, value in [('pid', 2000), ('start_ticks', 925)]:
            original = getattr(self.pins, field)
            setattr(self.pins, field, value)
            self.execute(True)
            self.assert_no_mutations()
            setattr(self.pins, field, original)
        self.engine.proc_owner = 'a' * 64
        self.execute(True)
        self.assert_no_mutations()

    def test_wrong_owner_name_or_network_or_listener_blocks(self):
        self.pins.owner_name = 'wrong-name'
        self.execute(True)
        self.pins.owner_name = OLD_NAME
        self.engine.items[OWNER]['HostConfig']['NetworkMode'] = 'bridge'
        self.execute(True)
        self.engine.items[OWNER]['HostConfig']['NetworkMode'] = 'host'
        self.engine.foreign_pid = 2000
        self.execute(True)
        self.assert_no_mutations()

    def test_wallet_mismatch_or_single_file_mount_blocks(self):
        other = self.root / 'other-wallet'
        other.mkdir()
        self.engine.items[OWNER]['Mounts'][0]['Source'] = str(other)
        self.execute(True)
        self.assert_no_mutations()
        self.engine.items[OWNER]['Mounts'][0]['Source'] = str(self.root / 'wallet')
        self.engine.items[OWNER]['Mounts'][0]['Destination'] = '/data/one-api.db'
        self.execute(True)
        self.assert_no_mutations()

    def test_canonical_identity_changes_on_final_preflight_no_mutation(self):
        self.engine.canonical_changes_before_mutation = True
        self.execute(True)
        self.assert_no_mutations()

    def test_stop_timeout_after_applied_stop_is_reconciled(self):
        self.engine.stop_mode = 'after'
        result, _ = self.execute()
        self.assertEqual(result['result'], 'GITEE_ADOPT_OK')

    def test_never_finishing_bad_stop_keeps_live_owner_and_disables_bad_loop(self):
        self.engine.stop_mode = 'never'
        _, output = self.execute(True)
        self.assert_rolled_back()
        self.assertTrue(output[-1]['bad_loop_disabled'])

    def test_unknown_rename_responses_are_reconciled_by_id(self):
        self.engine.unknown_renames = {BAD, OWNER}
        result, _ = self.execute()
        self.assertEqual(result['result'], 'GITEE_ADOPT_OK')

    def test_owner_rename_failure_restores_original_names(self):
        self.engine.fail_owner_rename = True
        _, output = self.execute(True)
        self.assert_rolled_back()
        self.assertTrue(output[-1]['names_restored'])

    def test_rename_success_response_without_effect_is_not_trusted(self):
        self.engine.ignore_owner_rename = True
        self.execute(True)
        self.assert_rolled_back()

    def test_final_health_source_or_config_change_rolls_names_back(self):
        for flag in ('health_fail', 'final_health_change', 'source_changes_after_rename', 'config_changes_after_rename'):
            with self.subTest(flag=flag):
                setattr(self.engine, flag, True)
                self.execute(True)
                self.assert_rolled_back()
                setattr(self.engine, flag, False)
                self.engine.items[BAD]['State'].update(Running=True, Restarting=True, ExitCode=1)
                self.engine.items[BAD]['HostConfig']['RestartPolicy']['Name'] = 'always'

    def test_concurrent_canonical_claim_is_not_deleted_or_renamed(self):
        self.engine.claim_canonical_after_bad_rename = True
        _, output = self.execute(True)
        self.assertEqual(self.engine.items['a' * 64]['Name'], '/' + adopt.NAME)
        self.assertEqual(self.engine.items[OWNER]['Name'], '/' + OLD_NAME)
        self.assertEqual(self.engine.items[BAD]['HostConfig']['RestartPolicy']['Name'], 'no')
        self.assertFalse(output[-1]['names_restored'])
        self.assertEqual(output[-1]['status'], 'manual_name_review_required')

    def test_old_name_collision_during_rollback_keeps_serving_owner_canonical(self):
        self.engine.claim_old_owner_after_rename = True
        self.engine.health_fail = True
        _, output = self.execute(True)
        self.assertEqual(self.engine.items[OWNER]['Name'], '/' + adopt.NAME)
        self.assertEqual(self.engine.items[BAD]['HostConfig']['RestartPolicy']['Name'], 'no')
        self.assertEqual(output[-1]['status'], 'manual_name_review_required')


class ProcessPinTests(unittest.TestCase):
    def test_real_parser_checks_exact_cgroup_and_ticks_without_reading_environ(self):
        with tempfile.TemporaryDirectory() as temp:
            proc = Path(temp)
            directory = proc / '1858'
            directory.mkdir()
            (directory / 'stat').write_text('1858 (node) S 1592 ' + '0 ' * 17 + '924 0\n')
            (directory / 'cgroup').write_text('0::/system.slice/docker-' + OWNER + '.scope\n')
            self.assertEqual(adopt.process_pin(1858, OWNER, proc), 924)
            with self.assertRaises(RuntimeError): adopt.process_pin(1858, BAD, proc)


if __name__ == '__main__':
    unittest.main(verbosity=2)
