#!/usr/bin/env python3
"""Disposable proc fixtures and mocked Docker/HTTP only; no VPS access."""
import importlib.util
import io
import json
from pathlib import Path
import posixpath
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('owner_diag', Path(__file__).with_name('vps-gitee-owner-diagnostics.py'))
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)
PRIVATE = 'SECRET_DO_NOT_OUTPUT_281739'
CID = 'e' * 64


def container():
    return {'Id': CID, 'Image': 'sha256:' + 'a' * 64, 'RestartCount': 8,
            'State': {'Status': 'restarting', 'Running': False, 'Restarting': True, 'Pid': 0, 'ExitCode': 1,
                      'Error': PRIVATE},
            'Config': {'Env': ['GITEE_API_KEY=' + PRIVATE, 'PORT=3010', 'LISTEN_HOST=127.0.0.1',
                               'NEW_API_DB=/data/one-api.db', 'UNEXPECTED=' + PRIVATE],
                       'Cmd': ['node', 'server.mjs'], 'WorkingDir': '/app', 'Labels': {'private': PRIVATE}},
            'HostConfig': {'NetworkMode': 'host', 'RestartPolicy': {'Name': 'always'}},
            'Mounts': [{'Type': 'bind', 'Source': '/opt/ai-relay/data/new-api', 'Destination': '/data', 'RW': True}]}


class OwnerDiagnosticTests(unittest.TestCase):
    def test_inspect_summary_never_outputs_secret_env_or_errors(self):
        report = diag.container_summary(container())
        raw = json.dumps(report)
        self.assertNotIn(PRIVATE, raw)
        self.assertNotIn('GITEE_API_KEY', raw)
        self.assertEqual(report['selected_env'], {'PORT': '3010', 'LISTEN_HOST': '127.0.0.1', 'NEW_API_DB': '/data/one-api.db'})
        self.assertEqual(report['state']['Pid'], 0)
        self.assertTrue(report['state']['Restarting'])
        self.assertEqual(report['mounts'][0]['source'], '/opt/ai-relay/data/new-api')

    def proc_fixture(self, folder, cmdline=None, cgroup=None):
        directory = folder / '1858'
        directory.mkdir()
        # Fields after comm: state, ppid, then fields 5..21, starttime.
        (directory / 'stat').write_text('1858 (node with ) spaces) S 1 ' + '0 ' * 17 + '123456 0 0\n')
        (directory / 'cmdline').write_bytes(cmdline or ('node\0' + diag.SCRIPT + '\0--api-key=' + PRIVATE + '\0').encode())
        (directory / 'cgroup').write_text(cgroup or '0::/system.slice/keyo-gitee.service\n')
        (directory / 'environ').write_text(PRIVATE)
        links = {str(directory / 'exe'): '/usr/bin/node', str(directory / 'cwd'): str(diag.ROOT),
                 str(directory / 'ns/mnt'): 'mnt:[42]', str(folder / '1/ns/mnt'): 'mnt:[42]'}
        return directory, links

    def test_exact_bare_host_script_unit_parent_and_start_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            proc = Path(temp)
            _, links = self.proc_fixture(proc)
            reads = []
            original_read = diag.limited_bytes
            def read(path, maximum):
                reads.append(path.name)
                return original_read(path, maximum)
            with patch.object(diag.os, 'readlink', side_effect=lambda path: links[str(path)]), patch.object(diag, 'limited_bytes', side_effect=read):
                report = diag.process_summary(1858, container(), proc)
            self.assertTrue(report['exact_host_gitee_script'])
            self.assertTrue(report['identity_stable'])
            self.assertTrue(report['mount_namespace_is_host'])
            self.assertFalse(report['docker_cgroup'])
            self.assertEqual(report['parent_pid'], 1)
            self.assertEqual(report['start_ticks'], 123456)
            self.assertEqual(report['recognized_service_units'], ['keyo-gitee.service'])
            self.assertNotIn('environ', reads)
            self.assertNotIn(PRIVATE, json.dumps(report))

    def test_unknown_flags_or_script_arguments_do_not_prove_identity(self):
        for args in (['node', '--eval', diag.SCRIPT], ['node', '--require', diag.SCRIPT],
                     ['node', '/unknown/private-script.mjs', diag.SCRIPT], ['node', '--token=' + PRIVATE, diag.SCRIPT]):
            self.assertIsNone(diag.script_argument(args, str(diag.ROOT)))
        self.assertEqual(diag.script_argument(['node', '--experimental-sqlite', 'server.mjs'], posixpath.dirname(diag.SCRIPT)), diag.SCRIPT)

    def test_nonallowlisted_process_paths_and_units_are_not_echoed(self):
        with tempfile.TemporaryDirectory() as temp:
            proc = Path(temp)
            directory, links = self.proc_fixture(proc, ('node\0/private/' + PRIVATE + '\0').encode(),
                                                  '0::/system.slice/' + PRIVATE + '.service\n')
            links[str(directory / 'cwd')] = '/private/' + PRIVATE
            links[str(directory / 'exe')] = '/private/' + PRIVATE
            with patch.object(diag.os, 'readlink', side_effect=lambda path: links[str(path)]):
                report = diag.process_summary(1858, container(), proc)
            self.assertIsNone(report['recognized_entry_script'])
            self.assertEqual(report['recognized_service_units'], [])
            self.assertNotIn(PRIVATE, json.dumps(report))

    def test_docker_namespace_and_identity_are_boolean_only(self):
        with tempfile.TemporaryDirectory() as temp:
            proc = Path(temp)
            directory, links = self.proc_fixture(proc, b'node\0/app/server.mjs\0', '0::/system.slice/docker-' + CID + '.scope\n')
            info = container()
            info['State']['Pid'] = 2000
            links[str(directory / 'cwd')] = '/app'
            links[str(directory / 'ns/mnt')] = 'mnt:[100]'
            links[str(proc / '2000/ns/mnt')] = 'mnt:[100]'
            with patch.object(diag.os, 'readlink', side_effect=lambda path: links[str(path)]):
                report = diag.process_summary(1858, info, proc)
            self.assertTrue(report['docker_entry_script'])
            self.assertEqual(report['docker_owner_id'], CID)
            self.assertTrue(report['cgroup_matches_canonical'])
            self.assertTrue(report['mount_namespace_is_canonical'])
            self.assertFalse(report['mount_namespace_is_host'])

    def test_http_only_uses_loopback_health_and_filters_body(self):
        response = Mock(status=200)
        response.read.return_value = json.dumps({'ok': True, 'db': True, 'key': True, 'models': 40,
                                                'build': 'old-build-2026-09-30', 'api_key': PRIVATE}).encode()
        connection = Mock()
        connection.getresponse.return_value = response
        with patch.object(diag.http.client, 'HTTPConnection', return_value=connection) as connect:
            result = diag.local_health()
        connect.assert_called_once_with('127.0.0.1', 3010, timeout=3)
        connection.request.assert_called_once_with('GET', '/healthz')
        connection.close.assert_called_once()
        self.assertEqual(result['build'], 'old-build-2026-09-30')
        self.assertNotIn(PRIVATE, json.dumps(result))

    def test_listener_parser_never_outputs_raw_ss_process_text(self):
        completed = types.SimpleNamespace(returncode=0, stdout='LISTEN 0 511 127.0.0.1:3010 0.0.0.0:* users:(("' + PRIVATE + '",pid=1858,fd=22))\n')
        with patch.object(diag.subprocess, 'run', return_value=completed) as run:
            result = diag.listeners()
        self.assertEqual(run.call_args.args[0], ['ss', '-H', '-lntp', '( sport = :3010 )'])
        self.assertEqual(result['pids'], [1858])
        self.assertNotIn(PRIVATE, json.dumps(result))

    def test_docker_helper_guard_rejects_every_mutation_and_other_container(self):
        helper = types.SimpleNamespace(api=Mock(return_value={'ok': True}))
        original = helper.api
        module = types.SimpleNamespace(load_helper=lambda: helper)
        loader = types.SimpleNamespace(exec_module=lambda _: None)
        with patch.object(diag.importlib.util, 'spec_from_file_location', return_value=types.SimpleNamespace(loader=loader)), \
                patch.object(diag.importlib.util, 'module_from_spec', return_value=module):
            loaded = diag.load_helper()
        self.assertEqual(loaded.api('GET', '/containers/' + diag.NAME + '/json'), {'ok': True})
        for method, route in [('POST', '/containers/' + diag.NAME + '/stop'), ('DELETE', '/containers/' + diag.NAME),
                              ('GET', '/containers/ai-relay-new-api/json'), ('GET', '/containers/' + diag.NAME + '/logs')]:
            with self.assertRaises(RuntimeError):
                loaded.api(method, route)
        original.assert_called_once_with('GET', '/containers/' + diag.NAME + '/json')

    def test_only_freshly_observed_exact_owner_id_can_be_inspected(self):
        with tempfile.TemporaryDirectory() as temp:
            proc = Path(temp)
            self.proc_fixture(proc, cgroup='0::/system.slice/docker-' + CID + '.scope\n')
            helper = types.SimpleNamespace(api=Mock(return_value=container()))
            original = helper.api
            module = types.SimpleNamespace(load_helper=lambda: helper)
            loader = types.SimpleNamespace(exec_module=lambda _: None)
            with patch.object(diag.importlib.util, 'spec_from_file_location', return_value=types.SimpleNamespace(loader=loader)), \
                    patch.object(diag.importlib.util, 'module_from_spec', return_value=module):
                loaded = diag.load_helper(proc)
            with self.assertRaises(RuntimeError):
                loaded.api('GET', '/containers/' + CID + '/json')
            self.assertEqual(loaded.inspect_observed_owner(1858)['Id'], CID)
            original.assert_called_once_with('GET', '/containers/' + CID + '/json')
            with self.assertRaises(RuntimeError):
                loaded.api('GET', '/containers/' + CID + '/json')
            with self.assertRaises(ValueError):
                loaded.inspect_observed_owner('../environ')

    def test_actual_owner_filtered_config_mounts_and_partial_source_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            proc = Path(temp)
            directory, _ = self.proc_fixture(proc, cgroup='0::/docker/' + CID + '\n')
            app = directory / 'root/app'
            app.mkdir(parents=True)
            (app / 'server.mjs').write_text('old server')
            (app / 'catalog.json').write_text('{"models":[]}')
            info = container()
            info['Name'] = '/gitee-running-legacy'
            info['State'].update(Pid=1858, Status='running', Running=True, Restarting=False)
            helper = types.SimpleNamespace(inspect_observed_owner=Mock(return_value=info))
            process = {'pid': 1858, 'docker_owner_id': CID, 'parent_pid': 1, 'start_ticks': 123456}
            result = diag.observed_owner_summary(helper, process, container(), proc)
            self.assertEqual(result['container']['name'], 'gitee-running-legacy')
            self.assertTrue(result['inspected_identity_matches_observed'])
            self.assertTrue(result['container_main_pid_is_listener'])
            self.assertTrue(result['wallet_mount_matches_canonical'])
            self.assertIsNotNone(result['source_files_sha256']['server.mjs'])
            self.assertIsNotNone(result['source_files_sha256']['catalog.json'])
            self.assertIsNone(result['source_files_sha256']['decisions.mjs'])
            self.assertNotIn(PRIVATE, json.dumps(result))

    def test_changed_owner_identity_does_not_report_source_as_verified(self):
        with tempfile.TemporaryDirectory() as temp:
            proc = Path(temp)
            self.proc_fixture(proc)
            info = container()
            info['Id'] = 'f' * 64
            info['State']['Pid'] = 1858
            info['Mounts'][0]['Source'] = '/opt/ai-relay/other-wallet'
            helper = types.SimpleNamespace(inspect_observed_owner=Mock(return_value=info))
            process = {'pid': 1858, 'docker_owner_id': CID, 'parent_pid': 1, 'start_ticks': 123456}
            result = diag.observed_owner_summary(helper, process, container(), proc)
            self.assertFalse(result['inspected_identity_matches_observed'])
            self.assertFalse(result['wallet_mount_matches_canonical'])
            self.assertTrue(all(value is None for value in result['source_files_sha256'].values()))

    def test_main_failure_prints_no_exception_data(self):
        output = io.StringIO()
        with patch.object(diag, 'load_helper', side_effect=RuntimeError(PRIVATE)), patch('sys.stdout', output), self.assertRaises(SystemExit):
            diag.main()
        self.assertNotIn(PRIVATE, output.getvalue())
        self.assertEqual(json.loads(output.getvalue())['result'], 'GITEE_OWNER_READONLY_UNAVAILABLE')


if __name__ == '__main__':
    unittest.main(verbosity=2)
