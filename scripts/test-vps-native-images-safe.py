#!/usr/bin/env python3
"""Native release regression fixtures. No Docker, network or credentials."""
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


ROOT = Path(__file__).resolve().parents[1]
if os.name == 'nt':
    sys.modules['fcntl'] = types.SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=Mock())


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load('native_safe_release', 'vps-deploy-native-images-safe.py')
baseline = load('native_base_fixtures', 'test-vps-deploy-images-offline.py')
helper = baseline.deploy
OLD_IMAGE = 'sha256:' + 'a' * 64
NEW_IMAGE = 'sha256:' + 'b' * 64
HASHES = {name: 'c' * 64 for name in release.SOURCES}


class Engine:
    def __init__(self, root, failure=None, backup='stopped'):
        self.failure, self.events, self.new_started = failure, [], False
        self.warmup_checks = 0
        self.stop_timeout_seen = False
        self.pending_stop_inspects = 0
        self.rollback_start_conflicts = 0
        original = baseline.fixture('native', root)
        original['Image'] = OLD_IMAGE
        original['HostConfig']['NetworkMode'] = 'host'
        original['Config']['Env'] = [e for e in original['Config']['Env'] if not e.startswith('PORT=')] + ['PORT=3011']
        original['State'] = {'Running': True, 'Restarting': False, 'Pid': 111}
        self.containers = {release.NAME: original, 'ai-relay-new-api': baseline.wallet_fixture(root)}
        old = copy.deepcopy(original)
        old.update(Id='retained-backup-id', Image=release.KNOWN_LOOP_IMAGE)
        old['State'] = {'Running': backup in ('known-loop', 'unknown-active'), 'Restarting': backup == 'known-loop', 'Pid': 333 if backup == 'unknown-active' else 0}
        self.containers[release.KNOWN_LOOP_NAME] = old

    def api(self, method, route, body=None):
        self.events.append((method, route, copy.deepcopy(body)))
        parsed = urlsplit(route)
        if parsed.path.startswith('/images/'):
            return {'Id': NEW_IMAGE}
        if parsed.path == '/containers/create':
            if self.failure == 'create':
                raise RuntimeError('Injected create failure')
            name = parse_qs(parsed.query)['name'][0]
            self.containers[name] = {'Id': 'new-native-id', 'Image': NEW_IMAGE,
                                     'Config': copy.deepcopy(body), 'HostConfig': copy.deepcopy(body['HostConfig']),
                                     'State': {'Running': False, 'Restarting': False, 'Pid': 0}}
            return {'Id': 'new-native-id'}
        _, _, name, *tail = parsed.path.split('/')
        if name not in self.containers:
            raise RuntimeError('Docker operation failed status=404')
        container = self.containers[name]
        action = tail[0] if tail else ''
        if method == 'GET' and action == 'json':
            if name == release.NAME and self.pending_stop_inspects:
                self.pending_stop_inspects -= 1
                if self.pending_stop_inspects == 0:
                    container['State'] = {'Running': False, 'Restarting': False, 'Pid': 0}
            return copy.deepcopy(container)
        if method == 'DELETE':
            del self.containers[name]
        elif action == 'update':
            container['HostConfig']['RestartPolicy'] = copy.deepcopy(body['RestartPolicy'])
        elif action == 'stop':
            if name == release.NAME and not self.stop_timeout_seen and self.failure in ('stop-timeout', 'stop-failure-after-request'):
                self.stop_timeout_seen = True
                self.pending_stop_inspects = 2
                if self.failure == 'stop-timeout':
                    raise TimeoutError('fixture-secret transport timed out while stop was still pending')
                raise release.DockerFailure(400)
            container['State'] = {'Running': False, 'Restarting': False, 'Pid': 0}
        elif action == 'rename':
            if self.failure == 'rename' and name == release.NAME:
                raise RuntimeError('Injected rename failure')
            new_name = parse_qs(parsed.query)['name'][0]
            self.containers[new_name] = self.containers.pop(name)
        elif action == 'start':
            is_new = container['Image'] == NEW_IMAGE
            if not is_new and self.failure == 'rollback-start-conflict' and self.rollback_start_conflicts < 2:
                self.rollback_start_conflicts += 1
                raise release.DockerFailure(409)
            if is_new and self.failure == 'start':
                raise RuntimeError('Injected start failure')
            self.new_started = is_new
            container['State'] = {'Running': True, 'Restarting': is_new and self.failure == 'restarting',
                                  'Pid': 0 if is_new and self.failure == 'restarting' else (222 if is_new else 111)}
        else:
            raise AssertionError('Unexpected mocked Engine operation')

    def build(self, args, timeout=600):
        self.events.append(('BUILD', args, None))
        if self.failure == 'build':
            raise RuntimeError('Injected build failure')

    def command(self, args, timeout=20):
        self.events.append(('COMMAND', args, None))
        if args[0] == 'ss':
            current = self.containers.get(release.NAME)
            pid = current['State']['Pid'] if current else 0
            if self.new_started and self.failure == 'warmup' and self.warmup_checks < 2:
                self.warmup_checks += 1
                return ''
            if self.failure == 'foreign-before' or (self.new_started and self.failure == 'foreign-after'):
                pid = 999
            return f'LISTEN 0 511 127.0.0.1:3011 0.0.0.0:* users:(("node",pid={pid},fd=20))\n' if pid else ''
        if args[:3] == ['docker', 'ps', '-a']:
            return '\n'.join(self.containers)
        if args[:2] == ['docker', 'exec'] and args[3] == 'sha256sum':
            hashes = dict(HASHES)
            if self.failure == 'source':
                hashes['image-contracts.mjs'] = 'd' * 64
            return '\n'.join(hashes[name] + '  /app/' + name for name in release.SOURCES)
        raise AssertionError('Unexpected mocked local command')

    def health(self, name, port, config=None, service=None):
        self.events.append(('HEALTH', name, None))
        if self.containers[name]['Image'] == NEW_IMAGE and self.failure in ('health', 'rollback-start-conflict'):
            raise RuntimeError('Injected new health failure')
        if self.containers[name]['Image'] == NEW_IMAGE and self.failure == 'unstable':
            self.containers[name]['State']['Pid'] += 1


class NativeReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'data/new-api').mkdir(parents=True)
        (self.root / 'data/new-api/one-api.db').write_bytes(b'preserve-task-wallet-data')
        self.addCleanup(patch.stopall)
        patch.object(release, 'ROOT', self.root).start()
        patch.object(helper, 'ROOT', self.root).start()
        patch.object(release.time, 'sleep').start()
        patch.object(release, 'load_helper', return_value=helper).start()
        patch.object(release, 'manifest', return_value=dict(HASHES)).start()
        patch.object(helper, 'UnixHTTP', side_effect=AssertionError('Real Docker forbidden')).start()
        patch.object(release.subprocess, 'run', side_effect=AssertionError('Real subprocess forbidden')).start()

    def run_engine(self, engine):
        with patch.object(helper, 'api', engine.api), patch.object(helper, 'run_checked', engine.build), patch.object(helper, 'health', engine.health), patch.object(release, 'run_command', engine.command), contextlib.redirect_stdout(io.StringIO()) as output:
            release.deploy_native()
        return output.getvalue()

    def assert_original_running(self, engine):
        current = engine.containers[release.NAME]
        self.assertEqual(current['Image'], OLD_IMAGE)
        self.assertEqual(current['State'], {'Running': True, 'Restarting': False, 'Pid': 111})
        self.assertEqual(current['HostConfig']['RestartPolicy']['Name'], 'unless-stopped')
        self.assertEqual((self.root / 'data/new-api/one-api.db').read_bytes(), b'preserve-task-wallet-data')
        self.assertFalse(any(e[0] == 'POST' and '/ai-relay-new-api/' in e[1] for e in engine.events))

    def test_success_preserves_runtime_and_existing_backup_checks_all_sources_twice(self):
        engine = Engine(self.root)
        original = copy.deepcopy(engine.containers[release.NAME])
        retained = copy.deepcopy(engine.containers[release.KNOWN_LOOP_NAME])
        output = self.run_engine(engine)
        self.assertIn('NATIVE_RELEASE_OK', output)
        current = engine.containers[release.NAME]
        self.assertEqual(current['Config']['Env'][:len(original['Config']['Env'])], original['Config']['Env'])
        for key in ('User', 'Cmd', 'Entrypoint', 'WorkingDir'):
            self.assertEqual(current['Config'][key], original['Config'][key])
        for key in ('NetworkMode', 'PortBindings', 'Memory', 'RestartPolicy'):
            self.assertEqual(current['HostConfig'][key], original['HostConfig'][key])
        self.assertEqual(engine.containers[release.KNOWN_LOOP_NAME], retained)
        backups = [v for k, v in engine.containers.items() if k.startswith(release.NAME + '-previous-')]
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0]['Id'], original['Id'])
        self.assertFalse(backups[0]['State']['Running'])
        self.assertEqual(backups[0]['HostConfig']['RestartPolicy']['Name'], 'no')
        healths = [event for event in engine.events if event[0] == 'HEALTH']
        self.assertEqual(len(healths), 2)
        hashes = [event for event in engine.events if event[0] == 'COMMAND' and event[1][0] == 'docker' and 'sha256sum' in event[1]]
        self.assertEqual(len(hashes), 2)
        self.assertEqual(set(hashes[0][1][4:]), {'/app/' + name for name in release.SOURCES})
        build = next(i for i, e in enumerate(engine.events) if e[0] == 'BUILD')
        stop = next(i for i, e in enumerate(engine.events) if e[0] == 'POST' and '/stop?' in e[1])
        self.assertLess(build, stop)

    def test_known_pinned_restart_loop_is_disabled_only_after_build(self):
        engine = Engine(self.root, backup='known-loop')
        output = self.run_engine(engine)
        self.assertIn('NATIVE_KNOWN_RESTART_LOOP_STOPPED', output)
        saved = engine.containers[release.KNOWN_LOOP_NAME]
        self.assertEqual(saved['Image'], release.KNOWN_LOOP_IMAGE)
        self.assertEqual(saved['HostConfig']['RestartPolicy']['Name'], 'no')
        self.assertFalse(saved['State']['Running'])
        build = next(i for i, e in enumerate(engine.events) if e[0] == 'BUILD')
        stop = next(i for i, e in enumerate(engine.events) if e[0] == 'POST' and release.KNOWN_LOOP_NAME + '/update' in e[1])
        self.assertLess(build, stop)

    def test_docker_started_process_has_bounded_socket_warmup(self):
        engine = Engine(self.root, failure='warmup')
        output = self.run_engine(engine)
        self.assertIn('NATIVE_RELEASE_OK', output)
        self.assertEqual(engine.warmup_checks, 2)

    def test_ambiguous_stop_timeout_waits_for_stopped_before_rename(self):
        engine = Engine(self.root, failure='stop-timeout')
        output = self.run_engine(engine)
        self.assertIn('NATIVE_RELEASE_OK', output)
        self.assertIn('docker_socket_timeout', output)
        self.assertNotIn('fixture-secret', output)
        self.assertEqual(engine.pending_stop_inspects, 0)

    def test_failed_stop_response_rolls_back_after_pending_stop_finishes(self):
        engine = Engine(self.root, failure='stop-failure-after-request')
        with self.assertRaisesRegex(RuntimeError, 'previous native service restored'):
            self.run_engine(engine)
        self.assertEqual(engine.pending_stop_inspects, 0)
        self.assert_original_running(engine)

    def test_rollback_start_retries_docker_conflicts_with_backoff(self):
        engine = Engine(self.root, failure='rollback-start-conflict')
        with self.assertRaisesRegex(RuntimeError, 'previous native service restored'):
            self.run_engine(engine)
        self.assertEqual(engine.rollback_start_conflicts, 2)
        self.assert_original_running(engine)

    def test_changed_pinned_image_or_unknown_active_backup_never_mutates(self):
        for case in ('image', 'active', 'pid'):
            engine = Engine(self.root, backup='known-loop')
            old = engine.containers[release.KNOWN_LOOP_NAME]
            if case == 'image':
                old['Image'] = OLD_IMAGE
            elif case == 'active':
                old['State']['Restarting'] = False
            else:
                old['State']['Pid'] = 444
            with self.assertRaisesRegex(RuntimeError, 'Unknown active'):
                self.run_engine(engine)
            self.assertFalse(any(e[0] in ('POST', 'DELETE', 'BUILD') for e in engine.events))
            self.assert_original_running(engine)

    def test_foreign_port_owner_rejected_before_build_or_stop(self):
        engine = Engine(self.root, failure='foreign-before')
        with self.assertRaises(RuntimeError):
            self.run_engine(engine)
        self.assertFalse(any(e[0] in ('POST', 'DELETE', 'BUILD') for e in engine.events))
        self.assert_original_running(engine)

    def test_build_failure_keeps_original_and_known_loop_unchanged(self):
        engine = Engine(self.root, failure='build', backup='known-loop')
        with self.assertRaises(RuntimeError):
            self.run_engine(engine)
        self.assertFalse(any(e[0] in ('POST', 'DELETE') for e in engine.events))
        self.assertTrue(engine.containers[release.KNOWN_LOOP_NAME]['State']['Restarting'])
        self.assert_original_running(engine)

    def test_create_start_health_source_restarting_and_foreign_failures_restore_only_native(self):
        for failure in ('rename', 'create', 'start', 'health', 'source', 'restarting', 'foreign-after', 'unstable'):
            with self.subTest(failure=failure):
                engine = Engine(self.root, failure=failure)
                with self.assertRaisesRegex(RuntimeError, 'previous native service restored'):
                    self.run_engine(engine)
                self.assert_original_running(engine)
                self.assertFalse(any(e[0] == 'DELETE' and release.KNOWN_LOOP_NAME in e[1] for e in engine.events))

    def test_runtime_or_wallet_mismatch_never_builds_or_stops(self):
        for case in ('network', 'port', 'wallet'):
            engine = Engine(self.root)
            if case == 'network':
                engine.containers[release.NAME]['HostConfig']['NetworkMode'] = 'unknown-network'
            elif case == 'port':
                engine.containers[release.NAME]['Config']['Env'].append('PORT=9999')
            else:
                engine.containers['ai-relay-new-api']['Config']['Env'] = ['REDIS_CONN_STRING=fixture-secret']
            with self.assertRaises(RuntimeError):
                self.run_engine(engine)
            self.assertFalse(any(e[0] in ('POST', 'DELETE', 'BUILD') for e in engine.events))

    def test_command_failures_do_not_print_environment_or_docker_output(self):
        failed = types.SimpleNamespace(returncode=1, stdout='fixture-secret', stderr='fixture-secret')
        with patch.object(release.subprocess, 'run', return_value=failed):
            with self.assertRaises(RuntimeError) as caught:
                release.run_command(['docker', 'inspect', 'fixture'])
        self.assertNotIn('fixture-secret', str(caught.exception))

    def test_docker_api_204_and_304_are_successful_without_json(self):
        for status in (204, 304):
            connection = Mock()
            connection.getresponse.return_value = types.SimpleNamespace(status=status, read=lambda: b'')
            with patch.object(release, 'NativeUnixHTTP', return_value=connection) as factory:
                self.assertIsNone(release.docker_api('POST', '/containers/fixture/stop?t=30'))
            factory.assert_called_once_with('localhost', timeout=95)
            connection.close.assert_called_once()

    def test_docker_api_error_only_exports_http_status(self):
        connection = Mock()
        connection.getresponse.return_value = types.SimpleNamespace(status=409, read=lambda: b'{"message":"fixture-secret"}')
        with patch.object(release, 'NativeUnixHTTP', return_value=connection):
            with self.assertRaises(release.DockerFailure) as caught:
                release.docker_api('POST', '/containers/fixture/start')
        self.assertEqual(caught.exception.status, 409)
        self.assertNotIn('fixture-secret', str(caught.exception))

    def test_unix_socket_deadline_exceeds_docker_stop_deadline(self):
        fake_socket = Mock()
        with patch.object(release.socket, 'socket', return_value=fake_socket), patch.object(release.socket, 'AF_UNIX', 1, create=True):
            connection = release.NativeUnixHTTP('localhost', timeout=95)
            connection.connect()
        fake_socket.settimeout.assert_called_once_with(95)
        fake_socket.connect.assert_called_once_with('/var/run/docker.sock')

    def test_sanitized_stage_markers_never_export_exception_text(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            release.error_marker('stop_original', TimeoutError('fixture-secret'))
            release.error_marker('rollback_start_original', release.DockerFailure(409))
        text = output.getvalue()
        self.assertNotIn('fixture-secret', text)
        records = [json.loads(line) for line in text.splitlines()]
        self.assertEqual(records[0]['category'], 'docker_socket_timeout')
        self.assertEqual(records[1]['docker_status'], 409)

    def test_workflow_routes_image_changes_away_from_legacy_deployment(self):
        legacy = (ROOT / '.github/workflows/keyo-apimart-passthrough.yml').read_text(encoding='utf8')
        self.assertNotIn('"services/apimart-passthrough/**"', legacy)
        self.assertNotIn('".github/workflows/keyo-apimart-passthrough.yml"', legacy)
        self.assertNotIn('image-*.mjs', legacy)
        source = (ROOT / '.github/workflows/keyo-image-native.yml').read_text(encoding='utf8')
        self.assertIn('services/apimart-passthrough/image-*.mjs', source)
        self.assertIn('vps-deploy-native-images-safe.py native', source)
        self.assertNotIn('vps-deploy-seedance-merge.sh', source)
        self.assertIn('needs: verify', source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
