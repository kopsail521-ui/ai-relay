#!/usr/bin/env python3
"""Offline Docker inspect/Engine fixtures. Never contacts Docker or reads .env.
Run: python scripts/test-vps-deploy-images-offline.py
"""
import base64
import contextlib
import copy
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASH = 'C:/Program Files/Git/usr/bin/bash.exe' if os.name == 'nt' else 'bash'
# Windows lacks fcntl. The helper's lock entrypoint is exercised with a mock.
if os.name == 'nt':
    sys.modules['fcntl'] = types.SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=Mock())
spec = importlib.util.spec_from_file_location('image_deploy', ROOT / 'scripts/vps-deploy-images.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def fixture(service, root):
    native = service == 'native'
    source = str(root / ('data/new-api' if native else 'static/uploads'))
    target = '/data' if native else '/uploads'
    env = ['FIXTURE_VALUE=offline=value', 'PORT=' + ('4011' if native else '4001'), 'LISTEN_HOST=127.0.0.1']
    env += ['NEW_API_DB=/data/one-api.db', 'IMAGE_TRUSTED_PROXIES=127.0.0.1/32'] if native else ['UPLOAD_DIR=/uploads', 'VIDEO_CATALOG=/app/video-catalog.json']
    return {
        'Id': service + '-old-id', 'Image': 'sha256:old-' + service, 'State': {'Running': True},
        'Config': {'Image': 'old-image', 'Env': env, 'User': '1000:1001', 'Cmd': ['node', 'server.mjs', '--fixture'],
                   'Entrypoint': ['fixture-entry'], 'WorkingDir': '/app', 'Labels': {'fixture': service},
                   'Volumes': {'/cache': {}}, 'ExposedPorts': {'4001/tcp': {}}, 'Healthcheck': {'Test': ['CMD', 'true']}},
        'HostConfig': {'Binds': [source + ':' + target + ':rw'], 'Mounts': [], 'NetworkMode': 'relay-net',
                       'PortBindings': {'4001/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '9001'}]},
                       'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0}, 'Memory': 123456,
                       'ReadonlyRootfs': True, 'CapDrop': ['ALL'], 'Tmpfs': {'/tmp': 'rw,noexec'}},
        'Mounts': [{'Type': 'bind', 'Source': source, 'Destination': target, 'RW': True},
                   {'Type': 'volume', 'Name': service + '-anonymous-cache', 'Source': '/var/lib/docker/volumes/cache/_data', 'Destination': '/cache', 'RW': True}],
        'NetworkSettings': {'Networks': {'relay-net': {'IPAMConfig': {'IPv4Address': '172.30.0.7'},
            'Links': ['peer:peer'], 'Aliases': ['fixture-service'], 'DriverOpts': {'fixture': 'yes'},
            'IPAddress': '172.30.0.7', 'EndpointID': 'runtime-only'},
            'metrics-net': {'IPAMConfig': None, 'Aliases': ['metrics'], 'DriverOpts': None}}},
    }


def wallet_fixture(root):
    result = fixture('native', root)
    result['Config'] = {'Env': [], 'WorkingDir': '/data'}
    return result


class Engine:
    """Stateful subset of Docker Engine API with one-shot failure injection."""
    def __init__(self, root):
        self.containers = {deploy.SERVICES[s][0]: fixture(s, root) for s in deploy.SERVICES}
        self.containers['ai-relay-new-api'] = wallet_fixture(root)
        self.events = []
        self.fail = None
        self.fail_build = None
        self.fail_health = None

    def api(self, method, route, body=None):
        self.events.append((method, route, copy.deepcopy(body)))
        url = urlsplit(route)
        if self.fail and method == self.fail[0] and url.path == self.fail[1]:
            self.fail = None
            raise RuntimeError('Injected Docker failure')
        if url.path == '/containers/create':
            name = parse_qs(url.query)['name'][0]
            if name in self.containers:
                raise RuntimeError('Docker operation failed status=409')
            self.containers[name] = {'Id': name + '-new-id', 'Config': copy.deepcopy(body), 'State': {'Running': False}}
            return {'Id': name + '-new-id'}
        _, _, name, *tail = url.path.split('/')
        if name not in self.containers:
            raise RuntimeError('Docker operation failed status=404')
        container = self.containers[name]
        action = tail[0] if tail else None
        if method == 'GET' and action == 'json':
            return copy.deepcopy(container)
        if method == 'DELETE':
            del self.containers[name]
        elif action == 'stop':
            container['State']['Running'] = False
        elif action == 'start':
            container['State']['Running'] = True
        elif action == 'rename':
            new_name = parse_qs(url.query)['name'][0]
            if new_name in self.containers:
                raise RuntimeError('Docker operation failed status=409')
            self.containers[new_name] = self.containers.pop(name)
        else:
            raise AssertionError('Unexpected mock API operation')

    def build(self, args, timeout=600):
        self.events.append(('BUILD', args[-1], None))
        if self.fail_build and args[-1].endswith(self.fail_build):
            raise RuntimeError('Injected build failure')

    def health(self, name, port, config=None, service=None):
        self.events.append(('HEALTH', service, None))
        if self.fail_health == service:
            raise RuntimeError('Injected health failure')


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'data/new-api').mkdir(parents=True)
        (self.root / 'data/new-api/one-api.db').write_bytes(b'offline-db-fixture')
        (self.root / 'static/uploads').mkdir(parents=True)
        (self.root / 'services/apimart-passthrough').mkdir(parents=True)
        (self.root / 'services/apimart-passthrough/catalog.json').write_text('{}')
        self.addCleanup(patch.stopall)
        patch.object(deploy, 'ROOT', self.root).start()
        # Unmocked external access always fails, never falls through to Docker.
        patch.object(deploy, 'UnixHTTP', side_effect=AssertionError('Real Docker forbidden')).start()
        patch.object(deploy.subprocess, 'run', side_effect=AssertionError('Real subprocess forbidden')).start()

    def replacement(self, container, service='native'):
        return deploy.replacement(container, service, 'fixture-reviewed')

    def run_engine(self, engine, selected=('native', 'moderation')):
        with patch.object(deploy, 'api', engine.api), patch.object(deploy, 'run_checked', engine.build), patch.object(deploy, 'health', engine.health), contextlib.redirect_stdout(io.StringIO()):
            deploy.deploy(list(selected))

    def assert_old_running(self, engine):
        for service in deploy.SERVICES:
            container = engine.containers[deploy.SERVICES[service][0]]
            self.assertEqual(container['Id'], service + '-old-id')
            self.assertTrue(container['State']['Running'])

    def test_preserve_env_network_mount_port_user_command(self):
        for service in deploy.SERVICES:
            with self.subTest(service=service):
                old = fixture(service, self.root)
                before = copy.deepcopy(old)
                body = self.replacement(old, service)
                self.assertEqual(old, before)
                for key in ('User', 'Cmd', 'Entrypoint', 'WorkingDir', 'Labels', 'Volumes', 'ExposedPorts', 'Healthcheck'):
                    self.assertEqual(body[key], old['Config'][key])
                self.assertEqual(body['Env'][:len(old['Config']['Env'])], old['Config']['Env'])
                for key in ('NetworkMode', 'PortBindings', 'RestartPolicy', 'Memory', 'ReadonlyRootfs', 'CapDrop', 'Tmpfs'):
                    self.assertEqual(body['HostConfig'][key], old['HostConfig'][key])
                self.assertEqual(body['HostConfig']['Binds'][0], old['HostConfig']['Binds'][0])
                self.assertIn(service + '-anonymous-cache:/cache:rw', body['HostConfig']['Binds'])
                for name, network in old['NetworkSettings']['Networks'].items():
                    expected = {k: v for k, v in network.items() if k in ('IPAMConfig', 'Links', 'Aliases', 'DriverOpts') and v is not None}
                    self.assertEqual(body['NetworkingConfig']['EndpointsConfig'][name], expected)

    def test_host_and_none_network_modes(self):
        for mode in ('host', 'none'):
            old = fixture('native', self.root)
            old['HostConfig']['NetworkMode'] = mode
            self.assertNotIn('NetworkingConfig', self.replacement(old))

    def test_structured_mounts_null_binds_and_anonymous_volume(self):
        old = fixture('native', self.root)
        old['HostConfig']['Binds'] = None
        old['HostConfig']['Mounts'] = [{'Type': 'bind', 'Source': str(self.root / 'data/new-api'), 'Target': '/data', 'ReadOnly': False}]
        body = self.replacement(old)
        self.assertEqual(body['HostConfig']['Mounts'], old['HostConfig']['Mounts'])
        self.assertEqual(body['HostConfig']['Binds'], ['native-anonymous-cache:/cache:rw'])

    def test_named_volume_wallet_is_shared(self):
        old = fixture('native', self.root)
        wallet = wallet_fixture(self.root)
        for container in (old, wallet):
            container['Mounts'][0] = {'Type': 'volume', 'Name': 'wallet-db', 'Destination': '/data', 'RW': True}
            container['HostConfig']['Binds'] = None
        body = self.replacement(old)
        self.assertIn('wallet-db:/data:rw', body['HostConfig']['Binds'])
        deploy.validate_wallet(old, body, wallet)

    def test_default_storage_and_actual_custom_db_filename(self):
        old = fixture('native', self.root)
        old['Mounts'] = []
        old['HostConfig']['Binds'] = None
        old['Config']['Env'] = ['NEW_API_DB=/data/custom.db', 'IMAGE_TRUSTED_PROXIES=127.0.0.1/32']
        with self.assertRaisesRegex(RuntimeError, 'Existing New API database'):
            self.replacement(old)
        (self.root / 'data/new-api/custom.db').write_bytes(b'fixture')
        body = self.replacement(old)
        self.assertIn(str(self.root / 'data/new-api') + ':/data:rw', body['HostConfig']['Binds'])
        self.assertEqual(deploy.environments(body)['IMAGE_DELIVERY_ACK_DIR'], '/data/custom.db.image-delivery')

    def test_default_db_missing_refuses_without_creating_directory(self):
        old = fixture('native', self.root)
        old['Mounts'] = []
        old['HostConfig']['Binds'] = None
        (self.root / 'data/new-api/one-api.db').unlink()
        (self.root / 'data/new-api').rmdir()
        with self.assertRaisesRegex(RuntimeError, 'Existing New API database'):
            self.replacement(old)
        self.assertFalse((self.root / 'data/new-api').exists())

    def test_db_readonly_file_tmpfs_and_nested_overlay_rejected(self):
        for case in ('readonly', 'file', 'tmpfs', 'nested'):
            with self.subTest(case=case):
                old = fixture('native', self.root)
                mount = old['Mounts'][0]
                if case == 'readonly': mount['RW'] = False
                elif case == 'file': mount['Destination'] = '/data/one-api.db'
                elif case == 'tmpfs': mount['Type'] = 'tmpfs'
                else:
                    old['Mounts'].append({'Type': 'bind', 'Source': '/fixture-wal', 'Destination': '/data/one-api.db-wal', 'RW': True})
                    # Explicit file mount hides the DB directory's WAL semantics.
                    old['Mounts'].append({'Type': 'bind', 'Source': '/fixture-db', 'Destination': '/data/one-api.db', 'RW': True})
                with self.assertRaises(RuntimeError): self.replacement(old)

    def test_relative_and_traversing_storage_paths_rejected(self):
        for value in ('relative.db', '/data/../outside.db'):
            old = fixture('native', self.root)
            old['Config']['Env'] = ['NEW_API_DB=' + value, 'IMAGE_TRUSTED_PROXIES=127.0.0.1/32']
            with self.assertRaises(RuntimeError): self.replacement(old)

    def test_ack_exact_directory_bind_and_named_volume_accepted(self):
        for kind in ('bind', 'volume'):
            old = fixture('native', self.root)
            old['Config']['Env'].append('IMAGE_DELIVERY_ACK_DIR=/acks')
            old['Mounts'].append({'Type': kind, 'Source': str(self.root / 'static/uploads'), 'Name': 'delivery-acks', 'Destination': '/acks', 'RW': True})
            body = self.replacement(old)
            self.assertEqual(deploy.environments(body)['IMAGE_DELIVERY_ACK_DIR'], '/acks')

    def test_ack_readonly_tmpfs_missing_and_file_rejected(self):
        for case in ('readonly', 'tmpfs', 'missing', 'file'):
            with self.subTest(case=case):
                old = fixture('native', self.root)
                old['Config']['Env'].append('IMAGE_DELIVERY_ACK_DIR=/acks')
                if case != 'missing':
                    old['Mounts'].append({'Type': 'tmpfs' if case == 'tmpfs' else 'bind', 'Source': str(self.root / 'data/new-api/one-api.db') if case == 'file' else str(self.root / 'static/uploads'), 'Destination': '/acks', 'RW': case != 'readonly'})
                with self.assertRaises(RuntimeError): self.replacement(old)

    def test_upload_catalog_defaults_with_null_binds(self):
        old = fixture('moderation', self.root)
        old['Mounts'] = []
        old['HostConfig']['Binds'] = None
        old['Config']['Env'] = ['FIXTURE_VALUE=keep']
        body = self.replacement(old, 'moderation')
        self.assertIn(str(self.root / 'static/uploads') + ':/opt/ai-relay/static/uploads:rw', body['HostConfig']['Binds'])
        self.assertIn(str(self.root / 'services/apimart-passthrough/catalog.json') + ':/app/video-catalog.json:ro', body['HostConfig']['Binds'])

    def test_upload_readonly_and_tmpfs_rejected(self):
        for case in ('readonly', 'tmpfs'):
            old = fixture('moderation', self.root)
            old['Mounts'][0]['RW'] = case != 'readonly'
            if case == 'tmpfs': old['Mounts'][0]['Type'] = 'tmpfs'
            with self.assertRaises(RuntimeError): self.replacement(old, 'moderation')

    def test_trusted_proxy_defaults_only_for_loopback_host(self):
        old = fixture('native', self.root)
        old['Config']['Env'] = [v for v in old['Config']['Env'] if not v.startswith('IMAGE_TRUSTED_PROXIES=')]
        with self.assertRaisesRegex(RuntimeError, 'Explicit IMAGE_TRUSTED_PROXIES'): self.replacement(old)
        old['HostConfig']['NetworkMode'] = 'host'
        self.assertEqual(deploy.environments(self.replacement(old))['IMAGE_TRUSTED_PROXIES'], '127.0.0.1/32,::1/128')
        old['Config']['Env'] = [v for v in old['Config']['Env'] if not v.startswith('LISTEN_HOST=')] + ['LISTEN_HOST=0.0.0.0']
        with self.assertRaises(RuntimeError): self.replacement(old)

    def test_wallet_remote_and_log_configuration_fail_closed(self):
        native = fixture('native', self.root)
        body = self.replacement(native)
        for setting in ('REDIS_CONN_STRING=fixture-do-not-print', 'SQL_DSN=postgres://fixture-do-not-print', 'SQL_DSN=sqlite://wrong-dialect', 'LOG_SQL_DSN=fixture-do-not-print'):
            with self.subTest(key=setting.split('=')[0]):
                wallet = wallet_fixture(self.root)
                wallet['Config']['Env'] = [setting]
                with self.assertRaises(RuntimeError) as caught: deploy.validate_wallet(native, body, wallet)
                self.assertNotIn(setting.split('=', 1)[1], str(caught.exception))

    def test_wallet_batch_updates_are_compatible(self):
        native = fixture('native', self.root)
        wallet = wallet_fixture(self.root)
        wallet['Config']['Env'] = ['SQL_DSN=local', 'LOG_SQL_DSN=local', 'BATCH_UPDATE_ENABLED=true', 'SQLITE_PATH=one-api.db?_busy_timeout=30000']
        deploy.validate_wallet(native, self.replacement(native), wallet)

    def test_wallet_local_dialect_and_same_file_accepted(self):
        native = fixture('native', self.root)
        wallet = wallet_fixture(self.root)
        wallet['Config']['Env'] = ['SQL_DSN=local', 'LOG_SQL_DSN=local', 'BATCH_UPDATE_ENABLED=false', 'REDIS_CONN_STRING=', 'SQLITE_PATH=one-api.db?_busy_timeout=30000']
        before = copy.deepcopy(wallet)
        deploy.validate_wallet(native, self.replacement(native), wallet)
        self.assertEqual(wallet, before)

    def test_wallet_mismatched_file_and_missing_mount_rejected(self):
        native = fixture('native', self.root)
        for case in ('file', 'mount', 'readonly'):
            wallet = wallet_fixture(self.root)
            if case == 'file': wallet['Config']['Env'] = ['SQLITE_PATH=/data/other.db']
            elif case == 'mount': wallet['Mounts'] = []
            else: wallet['Mounts'][0]['RW'] = False
            with self.assertRaises(RuntimeError): deploy.validate_wallet(native, self.replacement(native), wallet)

    def test_engine_success_builds_before_stop_and_retains_old(self):
        engine = Engine(self.root)
        self.run_engine(engine)
        kinds = [event[0] for event in engine.events]
        self.assertEqual(kinds.count('BUILD'), 2)
        first_stop = next(i for i, e in enumerate(engine.events) if '/stop?' in e[1])
        self.assertTrue(all(i < first_stop for i, e in enumerate(engine.events) if e[0] == 'BUILD'))
        for service, (name, _, _, _) in deploy.SERVICES.items():
            self.assertTrue(engine.containers[name]['State']['Running'])
            self.assertEqual(engine.containers[name + '-images-rollback']['Id'], service + '-old-id')
        self.assertEqual([e[1] for e in engine.events if e[0] == 'HEALTH'], ['native', 'moderation'])

    def test_engine_second_build_failure_never_stops(self):
        engine = Engine(self.root)
        engine.fail_build = 'creem-moderation-proxy'
        with self.assertRaisesRegex(RuntimeError, 'build failure'): self.run_engine(engine)
        self.assertFalse(any('/stop?' in event[1] for event in engine.events))
        self.assert_old_running(engine)

    def test_engine_wallet_rejection_before_build_or_stop(self):
        engine = Engine(self.root)
        engine.containers['ai-relay-new-api']['Config']['Env'] = ['REDIS_CONN_STRING=fixture-do-not-print']
        with self.assertRaisesRegex(RuntimeError, 'REDIS_CONN_STRING'): self.run_engine(engine)
        self.assertFalse(any(e[0] == 'BUILD' or '/stop?' in e[1] for e in engine.events))
        self.assert_old_running(engine)

    def test_engine_moderation_only_never_inspects_wallet(self):
        engine = Engine(self.root)
        del engine.containers['ai-relay-new-api']
        self.run_engine(engine, ['moderation'])
        self.assertFalse(any('ai-relay-new-api' in e[1] for e in engine.events))
        self.assertEqual(engine.containers[deploy.SERVICES['native'][0]]['Id'], 'native-old-id')

    def test_engine_failure_at_create_start_health_restores_both(self):
        for stage in ('create', 'start', 'health'):
            with self.subTest(stage=stage):
                engine = Engine(self.root)
                if stage == 'health': engine.fail_health = 'moderation'
                elif stage == 'create':
                    # First create succeeds; fail second create via wrapper.
                    original_api = engine.api
                    def fail_second(method, route, body=None):
                        if route == '/containers/create?name=' + deploy.SERVICES['moderation'][0]:
                            engine.fail = ('POST', '/containers/create')
                        return original_api(method, route, body)
                    engine.api = fail_second
                else: engine.fail = ('POST', '/containers/' + deploy.SERVICES['moderation'][0] + '/start')
                with self.assertRaises(RuntimeError): self.run_engine(engine)
                self.assert_old_running(engine)
                self.assertFalse(any(name.endswith('-images-rollback') for name in engine.containers))

    def test_engine_rename_failure_restarts_stopped_original(self):
        for service in deploy.SERVICES:
            engine = Engine(self.root)
            engine.fail = ('POST', '/containers/' + deploy.SERVICES[service][0] + '/rename')
            with self.assertRaises(RuntimeError): self.run_engine(engine)
            self.assert_old_running(engine)

    def test_engine_rollback_failure_reports_incomplete(self):
        engine = Engine(self.root)
        engine.fail_health = 'moderation'
        engine.fail = ('DELETE', '/containers/' + deploy.SERVICES['moderation'][0])
        with self.assertRaisesRegex(RuntimeError, 'rollback incomplete for: moderation'): self.run_engine(engine)
        self.assertEqual(engine.containers[deploy.SERVICES['native'][0]]['Id'], 'native-old-id')
        self.assertIn(deploy.SERVICES['moderation'][0] + '-images-rollback', engine.containers)

    def test_existing_rollback_blocks_build_and_stop(self):
        engine = Engine(self.root)
        engine.containers[deploy.SERVICES['native'][0] + '-images-rollback'] = fixture('native', self.root)
        with self.assertRaisesRegex(RuntimeError, 'Rollback container already exists'): self.run_engine(engine)
        self.assertFalse(any(e[0] == 'BUILD' or '/stop?' in e[1] for e in engine.events))

    def test_manual_restore_missing_replacement_retains_volume_state(self):
        engine = Engine(self.root)
        name = deploy.SERVICES['native'][0]
        old = engine.containers.pop(name)
        engine.containers[name + '-images-rollback'] = old
        with patch.object(deploy, 'api', engine.api): deploy.restore('native')
        self.assertEqual(engine.containers[name]['Id'], 'native-old-id')
        self.assertTrue(engine.containers[name]['State']['Running'])
        self.assertEqual((self.root / 'data/new-api/one-api.db').read_bytes(), b'offline-db-fixture')

    def test_health_uses_container_exec_port_and_service_assertions(self):
        for service in deploy.SERVICES:
            mocked = Mock(return_value=types.SimpleNamespace(returncode=0))
            with patch.object(deploy.subprocess, 'run', mocked):
                deploy.health('fixture', 1, fixture(service, self.root)['Config'], service)
            args = mocked.call_args.args[0]
            self.assertEqual(args[:6], ['docker', 'exec', 'fixture', 'node', '--input-type=module', '-e'])
            self.assertIn('4011' if service == 'native' else '4001', args[-1])
            self.assertIn('delivery_ack_writable' if service == 'native' else "storage==='ready'", args[-1])

    def test_health_failure_timeout_and_invalid_port_do_not_leak(self):
        mocked = Mock(return_value=types.SimpleNamespace(returncode=1))
        with patch.object(deploy.subprocess, 'run', mocked), patch.object(deploy.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'health check failed'): deploy.health('fixture', 3011, service='native')
        self.assertEqual(mocked.call_count, 20)
        with self.assertRaisesRegex(RuntimeError, '^Invalid health check port$'):
            deploy.health('fixture', 3011, {'Env': ['PORT=fixture-do-not-print']})

    def test_command_error_withholds_process_output(self):
        result = types.SimpleNamespace(returncode=1, stdout=b'fixture-do-not-print', stderr=b'fixture-do-not-print')
        with patch.object(deploy.subprocess, 'run', return_value=result):
            with self.assertRaises(RuntimeError) as caught: deploy.run_checked(['docker', 'build', 'fixture'])
        self.assertNotIn('fixture-do-not-print', str(caught.exception))

    def test_diagnostics_main_performs_no_writes_locks_exec_or_auth(self):
        engine = Engine(self.root)
        output = io.StringIO()
        vfs = types.SimpleNamespace(f_bavail=3, f_frsize=4096, f_favail=4)
        for action in ('diagnostics', 'diagnose'):
            output.seek(0); output.truncate(0)
            with patch.object(deploy, 'api', engine.api), patch.object(sys, 'argv', ['helper', action]), patch('builtins.open', side_effect=AssertionError('No file opens')), patch.object(Path, 'mkdir', side_effect=AssertionError('No mkdir')), patch.object(deploy.fcntl, 'flock', side_effect=AssertionError('No locks')), patch.object(deploy.os, 'statvfs', return_value=vfs, create=True), contextlib.redirect_stdout(output):
                deploy.main()
            records = [json.loads(line) for line in output.getvalue().splitlines()]
            self.assertEqual(len(records), 2)
            self.assertNotIn('FIXTURE_VALUE', output.getvalue())
            self.assertTrue(all(e[0] == 'GET' for e in engine.events))

    def test_main_actions_lock_and_selection(self):
        for action, selected in (('all', ['native', 'moderation']), ('deploy', ['native', 'moderation']), ('native', ['native']), ('moderation', ['moderation'])):
            with patch.object(sys, 'argv', ['helper', action]), patch('builtins.open', unittest.mock.mock_open()), patch.object(deploy.fcntl, 'flock') as flock, patch.object(deploy, 'deploy') as run:
                deploy.main()
            run.assert_called_once_with(selected)
            flock.assert_called_once()


class PackagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = "import {imageDeployCommand} from './scripts/print-vps-image-fixes.mjs'; console.log(JSON.stringify(Object.fromEntries(['deploy','all','native','moderation'].map(a=>[a,imageDeployCommand(a)]))));"
        result = subprocess.run(['node', '--input-type=module', '-e', source], cwd=ROOT, capture_output=True, text=True, check=True)
        cls.commands = json.loads(result.stdout)

    def test_runtime_package_matches_docker_copy_and_local_imports(self):
        for action, command in self.commands.items():
            packed = {name: gzip.decompress(base64.b64decode(encoded)) for encoded, name in re.findall(r"printf '%s' '([^']+)' \| base64 -d \| gunzip \| sudo tee '/opt/ai-relay/([^']+)'", command)}
            self.assertEqual(len(packed), 18)
            self.assertEqual(command.splitlines()[0], 'set -euo pipefail')
            self.assertTrue(command.endswith('vps-deploy-images.py ' + action))
            self.assertFalse(any('.env' in name for name in packed))
            for directory in ('services/apimart-passthrough', 'services/creem-moderation-proxy'):
                dockerfile = packed[directory + '/Dockerfile'].decode()
                for line in dockerfile.splitlines():
                    if line.startswith('COPY '):
                        for name in line.split()[1:-1]: self.assertIn(directory + '/' + name, packed)
                for filename, contents in packed.items():
                    if filename.startswith(directory + '/') and filename.endswith('.mjs'):
                        for name in re.findall(r'from [\"\x27]\./([^\"\x27]+)', contents.decode()): self.assertIn(directory + '/' + name, packed)
            for name, contents in packed.items(): self.assertEqual(contents, (ROOT / name).read_bytes())

    def test_cli_print_only_never_runs_generated_commands(self):
        for flag, action in (('', 'deploy'), ('--native-only', 'native'), ('--moderation-only', 'moderation')):
            args = ['node', str(ROOT / 'scripts/print-vps-image-fixes.mjs'), '--stdout'] + ([flag] if flag else [])
            result = subprocess.run(args, capture_output=True, text=True, check=True)
            self.assertIn(self.commands[action], result.stdout)
            self.assertIn('READ ONLY diagnostics', result.stdout)

    def test_helper_and_oauth_wrapper_fail_fast_in_offline_bash(self):
        command = self.commands['moderation']
        # Shell functions intercept every command; no Docker, sudo or filesystem access.
        prelude = "sudo() { if [ \"$1\" = python3 ]; then return 37; fi; if [ \"$1\" = tee ]; then while IFS= read -r line; do :; done; fi; return 0; }; base64() { while IFS= read -r line; do :; done; }; gunzip() { while IFS= read -r line; do :; done; }; sleep() { :; }; curl() { printf 'UNEXPECTED_CURL\\n'; };\n"
        wrapper = (ROOT / 'scripts/print-vps-oauth-legal-remind.mjs').read_text(encoding='utf8')
        self.assertIn('].join("\\n")', wrapper)
        self.assertIn('"set -euo pipefail"', wrapper)
        for text in (command + '\nprintf UNEXPECTED_AFTER', 'set -euo pipefail\ntrue\n' + command + '\nsleep 2\ncurl fixture || true\nprintf UNEXPECTED_AFTER'):
            result = subprocess.run([BASH, '--noprofile', '--norc', '-s'], input=prelude + text, capture_output=True, text=True)
            self.assertEqual(result.returncode, 37)
            self.assertNotIn('UNEXPECTED', result.stdout)

    def test_pack_pipeline_fail_fast(self):
        prelude = "sudo() { return 0; }; base64() { return 41; }; gunzip() { return 0; };\n"
        result = subprocess.run([BASH, '--noprofile', '--norc', '-s'], input=prelude + self.commands['native'] + '\nprintf UNEXPECTED_AFTER', capture_output=True, text=True)
        self.assertEqual(result.returncode, 41)
        self.assertNotIn('UNEXPECTED', result.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
