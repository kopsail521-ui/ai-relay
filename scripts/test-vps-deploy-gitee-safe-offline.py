#!/usr/bin/env python3
"""Offline Gitee release fixtures: no Docker, .env, wallets or network calls."""
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


gitee = load('gitee_safe_fixture', 'vps-deploy-gitee-safe.py')
native = load('gitee_native_fixture', 'vps-deploy-native-images-safe.py')
helper = load('gitee_storage_fixture', 'vps-deploy-images.py')


def fixture(root):
    return {
        'Id': 'fixture-original', 'Image': 'sha256:' + '1' * 64,
        'State': {'Running': True, 'Restarting': False, 'Pid': 1001},
        'Config': {'Image': 'fixture-old-image', 'Env': ['LOCAL_SECRET=never-print-this', 'NEW_API_DB=/data/one-api.db',
                                                     'PORT=3010', 'LISTEN_HOST=127.0.0.1'],
                   'User': '1000:1001', 'Cmd': ['node', 'server.mjs'], 'Entrypoint': ['docker-entrypoint.sh'],
                   'WorkingDir': '/app', 'Labels': {'fixture': 'preserved'}, 'Volumes': {'/cache': {}},
                   'Healthcheck': {'Test': ['CMD', 'true']}},
        'HostConfig': {'Binds': [str(root / 'wallet') + ':/data:rw'], 'Mounts': [], 'NetworkMode': 'host',
                       'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0},
                       'Memory': 268435456, 'ReadonlyRootfs': True, 'Tmpfs': {'/tmp': 'rw,noexec'},
                       'CapDrop': ['ALL'], 'LogConfig': {'Type': 'json-file', 'Config': {'max-size': '10m'}}},
        'Mounts': [{'Type': 'bind', 'Source': str(root / 'wallet'), 'Destination': '/data', 'RW': True},
                   {'Type': 'volume', 'Name': 'existing-anonymous-cache', 'Destination': '/cache', 'RW': True}],
        'NetworkSettings': {'Networks': {'host': {}}},
    }


class Engine:
    def __init__(self, root):
        self.original = fixture(root)
        wallet = copy.deepcopy(self.original)
        wallet['Config'] = {'Env': [], 'WorkingDir': '/data'}
        self.containers = {gitee.NAME: copy.deepcopy(self.original), 'ai-relay-new-api': wallet}
        self.events = []
        self.fail_operation = None
        self.fail_build = False
        self.fail_health = False
        self.fail_sources = False
        self.foreign_pid = None
        self.stop_timeout = False
        self.build_hook = None
        self.old_sources = {name: 'a' * 64 for name in gitee.SOURCES}
        self.new_sources = gitee.manifest()

    def api(self, method, route, body=None):
        self.events.append((method, route, copy.deepcopy(body)))
        url = urlsplit(route)
        if self.fail_operation == (method, url.path):
            self.fail_operation = None
            raise RuntimeError('Private fixture failure never-print-this')
        if url.path.startswith('/images/'):
            return {'Id': 'sha256:' + '2' * 64}
        if url.path == '/containers/create':
            name = parse_qs(url.query)['name'][0]
            if name in self.containers:
                raise native.DockerFailure(409)
            self.containers[name] = {'Id': 'fixture-replacement', 'Image': 'sha256:' + '2' * 64,
                                     'Config': copy.deepcopy({k: v for k, v in body.items() if k not in ('HostConfig', 'NetworkingConfig')}),
                                     'HostConfig': copy.deepcopy(body['HostConfig']),
                                     'Mounts': copy.deepcopy(self.original['Mounts']),
                                     'State': {'Running': False, 'Restarting': False, 'Pid': 0}}
            return {'Id': 'fixture-replacement'}
        parts = url.path.split('/')
        name = parts[2]
        if name not in self.containers:
            raise native.DockerFailure(404)
        item = self.containers[name]
        action = parts[3] if len(parts) > 3 else ''
        if method == 'GET' and action == 'json':
            return copy.deepcopy(item)
        if method == 'DELETE':
            del self.containers[name]
        elif action == 'update':
            item['HostConfig']['RestartPolicy'] = copy.deepcopy(body['RestartPolicy'])
        elif action == 'stop':
            item['State'] = {'Running': False, 'Restarting': False, 'Pid': 0}
            if self.stop_timeout:
                self.stop_timeout = False
                raise TimeoutError('Private Docker timeout')
        elif action == 'start':
            item['State'] = {'Running': True, 'Restarting': False,
                             'Pid': 1001 if item['Id'] == 'fixture-original' else 2002}
        elif action == 'rename':
            new_name = parse_qs(url.query)['name'][0]
            if new_name in self.containers:
                raise native.DockerFailure(409)
            self.containers[new_name] = self.containers.pop(name)
        else:
            raise AssertionError('Unrecognized Engine fixture operation')

    def command(self, args, timeout=20):
        self.events.append(('COMMAND', copy.deepcopy(args), None))
        if args[0] == 'ss':
            pids = [self.foreign_pid] if self.foreign_pid is not None else [
                item['State']['Pid'] for name, item in self.containers.items()
                if name.startswith(gitee.NAME) and item['State']['Running']]
            return '\n'.join('LISTEN 0 511 127.0.0.1:3010 *:* users:(("node",pid=%d,fd=20))' % pid for pid in pids)
        if args[:3] == ['docker', 'ps', '-a']:
            return '\n'.join(self.containers)
        if args[:2] == ['docker', 'exec']:
            item = self.containers[args[2]]
            sources = self.old_sources if item['Id'] == 'fixture-original' else self.new_sources
            if self.fail_sources and item['Id'] != 'fixture-original':
                sources = dict(sources, **{'server.mjs': 'f' * 64})
            return '\n'.join(value + '  /app/' + name for name, value in sources.items()) + '\n'
        raise AssertionError('Unrecognized local fixture command')

    def build(self, args, timeout=600):
        self.events.append(('BUILD', copy.deepcopy(args), None))
        if self.fail_build:
            raise RuntimeError('Private build failed never-print-this')
        if self.build_hook:
            self.build_hook()

    def health(self, config):
        item = self.containers[gitee.NAME]
        if item['Id'] != 'fixture-original' and self.fail_health:
            raise RuntimeError('Private health failed never-print-this')
        return {'build': 'old-reviewed' if item['Id'] == 'fixture-original' else gitee.expected_build(),
                'ok': True, 'database_present': True, 'models': 20}


class GiteeReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'wallet').mkdir()
        directory = self.root / gitee.SOURCE_DIR
        directory.mkdir(parents=True)
        for name in gitee.SOURCES:
            (directory / name).write_text('const BUILD_ID = "fixture-reviewed-build";' if name == 'server.mjs' else '{}')
        self.addCleanup(patch.stopall)
        patch.object(gitee, 'ROOT', self.root).start()
        patch.object(helper, 'ROOT', self.root).start()
        patch.object(native.time, 'sleep').start()
        patch.object(native, 'NativeUnixHTTP', side_effect=AssertionError('Real Docker forbidden')).start()
        patch.object(helper, 'UnixHTTP', side_effect=AssertionError('Real Docker forbidden')).start()
        patch.object(gitee.http.client, 'HTTPConnection', side_effect=AssertionError('Real HTTP forbidden')).start()
        patch.object(native.subprocess, 'run', side_effect=AssertionError('Real subprocess forbidden')).start()
        self.engine = Engine(self.root)
        patch.object(helper, 'api', self.engine.api).start()
        patch.object(helper, 'run_checked', self.engine.build).start()
        patch.object(native, 'run_command', self.engine.command).start()
        patch.object(gitee, 'local_health', self.engine.health).start()
        patch.object(native, 'error_marker', gitee.error_marker).start()

    def run_release(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            gitee.deploy(native, helper)
        return out.getvalue()

    def assert_original(self):
        current = self.engine.containers[gitee.NAME]
        self.assertEqual(current['Id'], 'fixture-original')
        self.assertEqual(current['State'], self.engine.original['State'])
        self.assertEqual(current['HostConfig']['RestartPolicy'], self.engine.original['HostConfig']['RestartPolicy'])

    def assert_no_mutations(self):
        self.assertFalse(any(event[0] in ('POST', 'DELETE', 'BUILD') for event in self.engine.events))

    def test_preserves_config_hostconfig_and_anonymous_volume_without_native_env(self):
        original = fixture(self.root)
        before = copy.deepcopy(original)
        plan = gitee.replacement(helper, original, 'reviewed-image')
        self.assertEqual(original, before)
        for key, value in original['Config'].items():
            if key != 'Image': self.assertEqual(plan[key], value)
        for key, value in original['HostConfig'].items():
            if key != 'Binds': self.assertEqual(plan['HostConfig'][key], value)
        self.assertEqual(plan['HostConfig']['Binds'][0], original['HostConfig']['Binds'][0])
        self.assertIn('existing-anonymous-cache:/cache:rw', plan['HostConfig']['Binds'])
        self.assertEqual(plan['Env'], original['Config']['Env'])
        self.assertFalse(any('IMAGE_' in env for env in plan['Env']))

    def test_preserves_structured_mounts_with_null_binds(self):
        original = fixture(self.root)
        original['HostConfig']['Binds'] = None
        original['HostConfig']['Mounts'] = [{'Type': 'bind', 'Source': str(self.root / 'wallet'),
                                          'Target': '/data', 'ReadOnly': False}]
        plan = gitee.replacement(helper, original, 'reviewed-image')
        self.assertEqual(plan['HostConfig']['Mounts'], original['HostConfig']['Mounts'])
        self.assertEqual(plan['HostConfig']['Binds'], ['existing-anonymous-cache:/cache:rw'])

    def test_preserves_network_endpoints_without_rewriting_host_network(self):
        original = fixture(self.root)
        self.assertNotIn('NetworkingConfig', gitee.replacement(helper, original, 'image'))
        original['HostConfig']['NetworkMode'] = 'existing-network'
        original['NetworkSettings']['Networks'] = {'existing-network': {'Aliases': ['existing'],
                                                 'IPAMConfig': {'IPv4Address': '172.20.0.2'}, 'EndpointID': 'runtime-only'}}
        plan = gitee.replacement(helper, original, 'image')
        self.assertEqual(plan['NetworkingConfig'], {'EndpointsConfig': {'existing-network': {
            'Aliases': ['existing'], 'IPAMConfig': {'IPv4Address': '172.20.0.2'}}}})

    def test_inspect_is_read_only_and_redacts_environment(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out): gitee.inspect_only(native, helper)
        report = json.loads(out.getvalue())
        self.assertTrue(report['read_only'])
        self.assertEqual(report['listenerOwner']['pids'], [1001])
        self.assertEqual(report['source_sha256'], self.engine.old_sources)
        self.assertNotIn('never-print-this', out.getvalue())
        self.assertNotIn('LOCAL_SECRET', out.getvalue())
        self.assert_no_mutations()

    def test_blocked_inspection_still_reports_foreign_listener_safely(self):
        self.engine.foreign_pid = 9999
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(RuntimeError):
            gitee.inspect_only(native, helper)
        report = json.loads(out.getvalue())
        self.assertEqual(report['result'], 'GITEE_PREFLIGHT_BLOCKED')
        self.assertEqual(report['listenerOwner']['pids'], [9999])
        self.assertNotIn('never-print-this', out.getvalue())
        self.assert_no_mutations()

    def test_success_builds_before_stop_and_keeps_original_for_rollback(self):
        result = json.loads(self.run_release())
        self.assertEqual(result['result'], 'GITEE_RELEASE_OK')
        self.assertEqual(self.engine.containers[gitee.NAME]['Id'], 'fixture-replacement')
        backup = self.engine.containers[result['rollback_container']]
        self.assertEqual(backup['Id'], 'fixture-original')
        self.assertFalse(backup['State']['Running'])
        self.assertEqual(backup['HostConfig']['RestartPolicy']['Name'], 'no')
        build = next(i for i, e in enumerate(self.engine.events) if e[0] == 'BUILD')
        stop = next(i for i, e in enumerate(self.engine.events) if e[0] == 'POST' and '/stop?' in e[1])
        self.assertLess(build, stop)
        self.assertEqual(self.engine.containers[gitee.NAME]['Config']['Env'], self.engine.original['Config']['Env'])

    def test_build_failure_does_not_stop_current_service(self):
        self.engine.fail_build = True
        with self.assertRaises(RuntimeError): self.run_release()
        self.assert_original()
        self.assertFalse(any(e[0] in ('POST', 'DELETE') for e in self.engine.events))

    def test_foreign_nohup_listener_is_rejected_without_stop_or_kill(self):
        self.engine.foreign_pid = 9999
        with self.assertRaisesRegex(RuntimeError, 'exclusively own'): self.run_release()
        self.assert_original()
        self.assert_no_mutations()
        self.assertFalse(any(e[0] == 'COMMAND' and 'kill' in e[1] for e in self.engine.events))

    def test_active_unknown_backup_is_rejected_without_stopping(self):
        other = fixture(self.root)
        other['State']['Running'], other['State']['Pid'] = False, 0
        other['State']['Restarting'] = True
        self.engine.containers[gitee.NAME + '-unknown'] = other
        with self.assertRaisesRegex(RuntimeError, 'Active Gitee backup'): self.run_release()
        self.assert_no_mutations()

    def test_incompatible_wallet_and_shadowed_sidecars_are_rejected(self):
        for kind in ('redis', 'different-db', 'readonly', 'wal-overlay', 'file-mount'):
            with self.subTest(kind=kind):
                self.engine.containers[gitee.NAME] = fixture(self.root)
                wallet = copy.deepcopy(self.engine.original)
                wallet['Config'] = {'Env': [], 'WorkingDir': '/data'}
                self.engine.containers['ai-relay-new-api'] = wallet
                current = self.engine.containers[gitee.NAME]
                if kind == 'redis': wallet['Config']['Env'] = ['REDIS_CONN_STRING=private-fixture']
                elif kind == 'different-db': wallet['Config']['Env'] = ['SQLITE_PATH=/data/other.db']
                elif kind == 'readonly': current['Mounts'][0]['RW'] = False
                elif kind == 'wal-overlay': current['Mounts'].append({'Type': 'bind', 'Source': '/private-fixture', 'Destination': '/data/one-api.db-wal', 'RW': True})
                else: current['Mounts'][0]['Destination'] = '/data/one-api.db'
                self.engine.events.clear()
                with self.assertRaises(RuntimeError): self.run_release()
                self.assert_no_mutations()

    def test_named_volume_and_implicit_default_db_remain_preserved(self):
        original = fixture(self.root)
        original['Config']['Env'] = [v for v in original['Config']['Env'] if not v.startswith('NEW_API_DB=')]
        wallet = copy.deepcopy(original)
        wallet['Config'] = {'Env': [], 'WorkingDir': '/data'}
        for item in (original, wallet): item['Mounts'][0] = {'Type': 'volume', 'Name': 'shared-wallet', 'Destination': '/data', 'RW': True}
        plan = gitee.replacement(helper, original, 'image')
        gitee.validate_wallet(helper, original, plan, wallet)
        self.assertEqual(plan['Env'], original['Config']['Env'])

    def test_source_change_during_build_prevents_service_stop(self):
        self.engine.build_hook = lambda: (self.root / gitee.SOURCE_DIR / 'catalog.json').write_text('{"changed":true}')
        with self.assertRaises(RuntimeError): self.run_release()
        self.assert_original()
        self.assertFalse(any(e[0] in ('POST', 'DELETE') for e in self.engine.events))

    def test_health_or_source_failure_rolls_back_original(self):
        for kind in ('health', 'source'):
            with self.subTest(kind=kind):
                self.engine.containers = {gitee.NAME: fixture(self.root), 'ai-relay-new-api': copy.deepcopy(self.engine.containers['ai-relay-new-api'])}
                self.engine.fail_health = kind == 'health'
                self.engine.fail_sources = kind == 'source'
                with self.assertRaisesRegex(RuntimeError, 'previous service restored'): self.run_release()
                self.assert_original()

    def test_create_start_and_rename_failures_roll_back(self):
        for method, route in [('POST', '/containers/create'), ('POST', '/containers/' + gitee.NAME + '/start'),
                              ('POST', '/containers/' + gitee.NAME + '/rename')]:
            with self.subTest(route=route):
                self.engine.containers = {gitee.NAME: fixture(self.root), 'ai-relay-new-api': copy.deepcopy(self.engine.containers['ai-relay-new-api'])}
                self.engine.fail_operation = (method, route)
                with self.assertRaisesRegex(RuntimeError, 'previous service restored'): self.run_release()
                self.assert_original()

    def test_timed_out_stop_is_reinspected_before_rename(self):
        self.engine.stop_timeout = True
        result = self.run_release()
        self.assertIn('GITEE_RELEASE_OK', result)
        self.assertNotIn('Private Docker timeout', result)
        self.assertGreaterEqual(native.DOCKER_TIMEOUT_SECONDS, 95)

    def test_failure_markers_never_print_private_error_text(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out): gitee.error_marker('fixture', RuntimeError('never-print-this'))
        self.assertNotIn('never-print-this', out.getvalue())

    def test_runtime_changes_never_trigger_legacy_provisioning_or_real_models(self):
        workflows = SCRIPTS.parent / '.github/workflows'
        for filename in ('keyo-apimart-passthrough.yml', 'keyo-speech-gift-twins.yml'):
            source = (workflows / filename).read_text(encoding='utf8')
            self.assertNotRegex(source, r'(?m)^  push:')
            self.assertIn('workflow_dispatch:', source)
        safe = (workflows / 'keyo-gitee-safe.yml').read_text(encoding='utf8')
        self.assertIn('services/gitee-passthrough/**', safe)
        self.assertIn('server.integration.test.mjs', safe)
        self.assertIn('vps-deploy-gitee-safe.py --inspect', safe)
        self.assertIn('vps-deploy-gitee-safe.py --deploy', safe)
        self.assertIn('needs: verify', safe)
        self.assertNotIn('vps-run-gift-speech-smoke', safe)
        self.assertNotIn('vps-redeploy-gitee-passthrough', safe)


if __name__ == '__main__':
    unittest.main()
