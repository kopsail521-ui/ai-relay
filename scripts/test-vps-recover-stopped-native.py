#!/usr/bin/env python3
"""Offline guards for the pinned native-container recovery; no Docker/network."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    'recover_stopped_native', Path(__file__).with_name('vps-recover-stopped-native.py'))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class Fixture:
    def __init__(self):
        self.container = {
            'Id': 'pinned-existing-container', 'Image': recovery.IMAGE,
            'State': {'Running': False, 'Restarting': False, 'Pid': 0,
                      'StartedAt': recovery.STARTED},
            'Config': {'Env': ['PORT=3011', 'GRSAI_API_KEY=local-fixture-secret']},
            'HostConfig': {'NetworkMode': 'host',
                           'RestartPolicy': {'Name': 'unless-stopped'},
                           'Binds': ['/fixture/wallet:/data']},
        }
        self.events, self.started, self.healths = [], False, 0
        self.foreign_before = False
        self.foreign_after = False
        self.unidentified = False
        self.fail_health = False
        self.unstable = False

    def command(self, args, timeout=20):
        self.events.append(list(args))
        if args == ['docker', 'inspect', recovery.NAME]:
            return json.dumps([copy.deepcopy(self.container)])
        if args == ['ss', '-H', '-lntp', '( sport = :3011 )']:
            if self.unidentified:
                return 'LISTEN 0 511 127.0.0.1:3011 0.0.0.0:*\n'
            if self.foreign_before or self.started and self.foreign_after:
                return 'LISTEN 0 511 127.0.0.1:3011 0.0.0.0:* users:(("foreign",pid=999,fd=20))\n'
            if self.started:
                pid = self.container['State']['Pid']
                return f'LISTEN 0 511 127.0.0.1:3011 0.0.0.0:* users:(("node",pid={pid},fd=20))\n'
            return ''
        if args == ['docker', 'start', recovery.NAME]:
            self.started = True
            self.container['State'] = {
                'Running': True, 'Restarting': False, 'Pid': 321,
                'StartedAt': '2026-10-25T00:00:00.000000000Z',
            }
            return recovery.NAME
        if args[:6] == ['docker', 'exec', recovery.NAME, 'node', '--input-type=module', '-e']:
            assert len(args) == 7
            assert "http://127.0.0.1:3011/healthz" in args[6]
            assert 'image_ledger' in args[6] and 'delivery_ack_writable' in args[6]
            assert '/v1/images/' not in args[6]
            self.healths += 1
            if self.fail_health:
                raise RuntimeError('Injected ledger health failure')
            if self.unstable:
                self.container['State']['Pid'] += 1
            return ''
        raise AssertionError(f'Unexpected recovery operation: {args[0:2]}')


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(recovery.time, 'sleep').start()
        patch.object(recovery.subprocess, 'run', side_effect=AssertionError('Real subprocess forbidden')).start()

    def run_fixture(self, fixture):
        with patch.object(recovery, 'command', fixture.command), contextlib.redirect_stdout(io.StringIO()) as output:
            recovery.recover()
        return json.loads(output.getvalue())

    def assert_not_started(self, fixture):
        self.assertFalse(fixture.started)
        self.assertFalse(any(event[:2] == ['docker', 'start'] for event in fixture.events))
        self.assertEqual(fixture.healths, 0)

    def test_success_starts_same_container_and_preserves_runtime_storage(self):
        fixture = Fixture()
        original = copy.deepcopy(fixture.container)
        result = self.run_fixture(fixture)
        self.assertEqual(result['result'], 'ORIGINAL_NATIVE_RECOVERED')
        self.assertEqual(result['image_id'], recovery.IMAGE)
        self.assertEqual(result['pid'], 321)
        self.assertEqual(result['stable_checks'], 2)
        self.assertEqual(result['model_calls'], 0)
        self.assertEqual(fixture.healths, 2)
        self.assertEqual(fixture.container['Id'], original['Id'])
        self.assertEqual(fixture.container['Image'], original['Image'])
        self.assertEqual(fixture.container['Config'], original['Config'])
        self.assertEqual(fixture.container['HostConfig'], original['HostConfig'])
        self.assertEqual(sum(event[:2] == ['docker', 'start'] for event in fixture.events), 1)
        self.assertFalse(any(event[0] == 'docker' and event[1] in ('stop', 'rm', 'run', 'create', 'pull', 'build', 'rename', 'update') for event in fixture.events))

    def test_changed_image_or_original_start_time_fail_before_mutation(self):
        for field in ('image', 'started'):
            with self.subTest(field=field):
                fixture = Fixture()
                if field == 'image':
                    fixture.container['Image'] = 'sha256:' + '0' * 64
                else:
                    fixture.container['State']['StartedAt'] = 'different-original-start'
                with self.assertRaises(RuntimeError):
                    self.run_fixture(fixture)
                self.assert_not_started(fixture)

    def test_changed_running_restarting_pid_network_or_port_fail_before_mutation(self):
        for field in ('running', 'restarting', 'pid', 'network', 'port'):
            with self.subTest(field=field):
                fixture = Fixture()
                if field == 'running':
                    fixture.container['State']['Running'] = True
                elif field == 'restarting':
                    fixture.container['State']['Restarting'] = True
                elif field == 'pid':
                    fixture.container['State']['Pid'] = 123
                elif field == 'network':
                    fixture.container['HostConfig']['NetworkMode'] = 'bridge'
                else:
                    fixture.container['Config']['Env'] = ['PORT=9999']
                with self.assertRaises(RuntimeError):
                    self.run_fixture(fixture)
                self.assert_not_started(fixture)

    def test_foreign_or_unidentified_listener_fails_before_start(self):
        for field in ('foreign_before', 'unidentified'):
            with self.subTest(field=field):
                fixture = Fixture()
                setattr(fixture, field, True)
                with self.assertRaises(RuntimeError):
                    self.run_fixture(fixture)
                self.assert_not_started(fixture)

    def test_foreign_owner_after_start_is_never_reported_as_recovered(self):
        fixture = Fixture()
        fixture.foreign_after = True
        with self.assertRaises(RuntimeError):
            self.run_fixture(fixture)
        self.assertTrue(fixture.started)
        self.assertEqual(fixture.healths, 0)

    def test_ledger_health_failure_is_not_reported_as_recovered(self):
        fixture = Fixture()
        fixture.fail_health = True
        with self.assertRaises(RuntimeError):
            self.run_fixture(fixture)
        self.assertTrue(fixture.started)
        self.assertEqual(fixture.healths, 1)

    def test_pid_changes_after_health_are_not_reported_as_recovered(self):
        fixture = Fixture()
        fixture.unstable = True
        with self.assertRaises(RuntimeError):
            self.run_fixture(fixture)
        self.assertTrue(fixture.started)
        self.assertEqual(fixture.healths, 1)


if __name__ == '__main__':
    unittest.main()
