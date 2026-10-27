#!/usr/bin/env python3
"""Offline fixtures for resource limits, rollback, retention and history."""
import copy
import datetime
import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

if os.name == 'nt':
    sys.modules['fcntl'] = types.SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=Mock())
ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ops = load('vps-stability-hardening')
args = load('vps-runtime-args')
recorder = load('vps-stability-recorder')


def original():
    return {'Id': 'old-id', 'Image': 'sha256:old', 'Name': '/ai-relay-new-api',
            'Config': {'Image': 'fixture:old', 'Env': ['FIXTURE=with=value'], 'Cmd': ['--fixture'], 'User': '1000:1001', 'Labels': {}},
            'State': {'Running': True, 'Restarting': False, 'Pid': 111},
            'HostConfig': {'Binds': ['/fixture/database:/data:rw'], 'Memory': 0, 'MemorySwap': 0, 'PidsLimit': 0, 'LogConfig': {'Type': 'json-file', 'Config': {}}, 'NetworkMode': 'fixture-network', 'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0}},
            'Mounts': [{'Type': 'bind', 'Source': '/fixture/database', 'Destination': '/data', 'RW': True}, {'Type': 'volume', 'Name': 'unique-fixture-volume', 'Destination': '/cache', 'RW': True}],
            'NetworkSettings': {'Networks': {'fixture-network': {'Aliases': ['wallet'], 'IPAddress': '172.20.0.2', 'IPAMConfig': None}}}}


class Engine:
    def __init__(self):
        self.containers = {'ai-relay-new-api': original()}
        self.events = []

    def api(self, method, path, body=None):
        self.events.append((method, path, copy.deepcopy(body)))
        url = urlsplit(path)
        if url.path == '/containers/create':
            name = parse_qs(url.query)['name'][0]
            self.containers[name] = {'Id': 'new-id', 'Image': 'sha256:old', 'Config': copy.deepcopy(body), 'HostConfig': copy.deepcopy(body['HostConfig']), 'State': {'Running': False, 'Restarting': False, 'Pid': 0}}
            return {'Id': 'new-id'}
        parts = url.path.split('/')
        name = parts[2]
        row = self.containers[name]
        action = parts[3] if len(parts) > 3 else ''
        if method == 'GET':
            return copy.deepcopy(row)
        if method == 'DELETE':
            del self.containers[name]
        elif action == 'rename':
            self.containers[parse_qs(url.query)['name'][0]] = self.containers.pop(name)
        elif action == 'update':
            row['HostConfig'].update(copy.deepcopy(body))
        elif action in ('start', 'stop'):
            row['State'].update(Running=action == 'start', Restarting=False, Pid=222 if action == 'start' else 0)


class Stability(unittest.TestCase):
    def test_plan_preserves_data_env_command_network_and_applies_limits(self):
        source = original()
        before = copy.deepcopy(source)
        plan = ops.plan(source, 192)
        self.assertEqual(source, before)
        for key in ('Env', 'Cmd', 'User'):
            self.assertEqual(plan[key], source['Config'][key])
        self.assertIn('unique-fixture-volume:/cache:rw', plan['HostConfig']['Binds'])
        self.assertIn('/fixture/database:/data:rw', plan['HostConfig']['Binds'])
        self.assertEqual(plan['HostConfig']['Memory'], 192 * ops.MIB)
        self.assertEqual(plan['HostConfig']['LogConfig']['Config'], {'max-size': '10m', 'max-file': '3'})
        self.assertNotIn('IPAddress', plan['NetworkingConfig']['EndpointsConfig']['fixture-network'])
        self.assertEqual(plan['NetworkingConfig']['EndpointsConfig']['fixture-network']['Aliases'], ['wallet'])

    def test_bad_replacement_health_restores_original_identity_and_configuration(self):
        engine = Engine()
        source = original()
        adapter = types.SimpleNamespace(
            stop_and_wait=lambda helper, name, identity: helper.api('POST', '/containers/' + name + '/stop'),
            start_with_backoff=lambda helper, name, identity: helper.api('POST', '/containers/' + name + '/start'))

        def verify(api, name, identity, expected):
            if identity == 'new-id':
                raise RuntimeError('injected failed health')
            self.assertEqual(api('GET', '/containers/' + name + '/json')['Id'], 'old-id')
        with patch.object(ops, 'verify', side_effect=verify):
            with self.assertRaisesRegex(RuntimeError, 'previous container restored'):
                ops.replace(adapter, engine.api, 'ai-relay-new-api', source, ops.plan(source, 192))
        restored = engine.containers['ai-relay-new-api']
        self.assertEqual(restored['Config'], source['Config'])
        self.assertEqual(restored['HostConfig'], source['HostConfig'])
        self.assertTrue(restored['State']['Running'])
        deletes = [path for method, path, _ in engine.events if method == 'DELETE']
        self.assertEqual(deletes, ['/containers/ai-relay-new-api?force=false&v=false'])

    def test_retention_keeps_two_backups_and_all_recent_or_running_containers(self):
        now = 2000000
        rows = []
        for number, age in enumerate((10, 90000, 100000, 200000)):
            row = original()
            row['Name'] = '/ai-relay-new-api-stability-previous-' + str(number)
            row['HostConfig']['RestartPolicy']['Name'] = 'no'
            row['State'] = {'Running': False, 'Restarting': False, 'Pid': 0, 'FinishedAt': datetime.datetime.fromtimestamp(now - age, datetime.timezone.utc).isoformat()}
            rows.append(row)
        running = copy.deepcopy(rows[-1]); running['State']['Running'] = True
        foreign = copy.deepcopy(rows[-1]); foreign['Name'] = '/another-application-previous-123-4'
        self.assertEqual(ops.retention_candidates(rows + [running, foreign], now), rows[2:])

    def test_runtime_arguments_preserve_limits_and_custom_log_rotation(self):
        host = {'Memory': 12345, 'MemorySwap': 23456, 'NanoCpus': 1500000000, 'CgroupParent': ops.SLICE,
                'LogConfig': {'Type': 'json-file', 'Config': {'max-size': '7m', 'max-file': '2'}}}
        values = args.arguments(host)
        self.assertEqual(values[values.index('--memory') + 1], '12345')
        self.assertIn('7m', ' '.join(values)); self.assertNotIn('max-size=10m', values)
        self.assertEqual(values[values.index('--cgroup-parent') + 1], ops.SLICE)
        with self.assertRaises(ValueError):
            args.arguments({'CgroupParent': 'invalid\nvalue'})

    def test_history_accounts_disk_reads_and_pid_reuse_without_command_lines(self):
        row = {'name': 'node', 'state': 'R', 'start': 10, 'cpu_ticks': 100, 'read_bytes': 1000, 'write_bytes': 0, 'rss_kib': 200, 'swap_kib': 0}
        before = {'monotonic': 1, 'cpu': [0, 0, 0, 0, 0, 0, 0, 0], 'processes': {10: row}, 'disks': {}, 'memory_kib': {}, 'pressure': {}, 'vmstat': {}}
        after = copy.deepcopy(before); after['monotonic'] = 3; after['cpu'] = [5, 0, 5, 180, 10, 0, 0, 0]
        after['processes'][10].update(cpu_ticks=120, read_bytes=3000)
        with patch.object(recorder.os, 'sysconf', return_value=100, create=True):
            value = recorder.delta(before, after)
            self.assertEqual(value['processes'][0]['read_bytes_sec'], 1000)
            self.assertEqual(value['iowait_pct'], 5)
            after['processes'][10]['start'] = 11
            self.assertEqual(recorder.delta(before, after)['processes'][0]['read_bytes_sec'], 0)
        self.assertNotIn('argv', value['processes'][0])


if __name__ == '__main__':
    unittest.main(verbosity=2)
