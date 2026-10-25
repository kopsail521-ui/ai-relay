#!/usr/bin/env python3
"""Offline sanitizer and command-boundary checks; no Docker, HTTP or env reads."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('image_diagnostics', ROOT / 'scripts/vps-image-forwarding-diagnostics.py')
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)
REQUEST_ID = diagnostics.REQUEST_IDS[0]


class ImageDiagnosticsTests(unittest.TestCase):
    def test_exact_failure_preserves_diagnostic_cause(self):
        line = '2026-10-25T01:02:03.123456789Z [native-image] forwarding failed id=' + REQUEST_ID + ' reason=TypeError cause=UND_ERR_NOT_SUPPORTED'
        self.assertEqual(diagnostics.safe_failure_records(line), [{
            'request_id': REQUEST_ID, 'error_name': 'TypeError',
            'cause': 'UND_ERR_NOT_SUPPORTED', 'timestamp': '2026-10-25T01:02:03.123456789Z',
        }])

    def test_other_requests_raw_errors_headers_and_extra_suffix_are_rejected(self):
        valid = '[native-image] forwarding failed id=' + REQUEST_ID + ' reason=TypeError cause=UND_ERR_NOT_SUPPORTED'
        lines = [valid.replace(REQUEST_ID, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
                 'Authorization: Bearer fixture-secret', '{"prompt":"private","image":"private"}',
                 valid + ' body=fixture-secret', 'exception fixture-secret ' + valid]
        self.assertEqual(diagnostics.safe_failure_records('\n'.join(lines)), [])

    def test_unknown_tokens_are_never_printed_and_output_is_bounded(self):
        line = '[native-image] forwarding failed id=' + REQUEST_ID + ' reason=FixtureSecret cause=FixtureSecret code=FixtureSecret'
        records = diagnostics.safe_failure_records('\n'.join([line] * 40))
        self.assertEqual(len(records), 30)
        self.assertNotIn('FixtureSecret', json.dumps(records))
        self.assertEqual(records[0]['cause'], 'unrecognized')

    def test_only_allowlisted_numeric_environment_is_exported(self):
        exported = diagnostics.numeric_limits([
            'CREEM_API_KEY=fixture-secret', 'IMAGE_FORWARD_TIMEOUT_MS=360000',
            'PROXY_MAX_BODY_BYTES=134217728', 'UPLOAD_MAX_BYTES=fixture-secret',
            'PORT=3011', 'IMAGE_TRANSPORT_TIMEOUT_MS=60000\nfixture-secret',
        ])
        self.assertEqual(exported['PROXY_MAX_BODY_BYTES'], 134217728)
        self.assertEqual(exported['UPLOAD_MAX_BYTES'], 'invalid_numeric_value')
        self.assertEqual(exported['IMAGE_TRANSPORT_TIMEOUT_MS'], 'invalid_numeric_value')
        self.assertEqual(exported['IMAGE_POLL_MAX_MS'], 'not_set')
        self.assertNotIn('fixture-secret', json.dumps(exported))
        self.assertNotIn('CREEM_API_KEY', exported)

    def test_aggregate_transport_failures_without_exporting_other_identifiers(self):
        line = '2026-10-25T04:00:00Z [native-image] forwarding failed id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa reason=TypeError cause=UND_ERR_NOT_SUPPORTED'
        totals = diagnostics.failure_totals(line + '\n' + line + '\n' + line + ' body=fixture-secret')
        self.assertEqual(totals['counts'], {'TypeError/UND_ERR_NOT_SUPPORTED': 2})
        self.assertEqual(totals['latest_timestamp'], '2026-10-25T04:00:00Z')
        self.assertNotIn('aaaaaaaa', json.dumps(totals))
        self.assertNotIn('fixture-secret', json.dumps(totals))

    def test_resource_state_exports_only_numeric_limits_and_oom_status(self):
        record = diagnostics.safe_container_record('ai-relay-apimart-passthrough', {
            'State': {'OOMKilled': True, 'ExitCode': 137, 'Error': 'fixture-secret'},
            'RestartCount': 2, 'HostConfig': {'Memory': 123, 'MemorySwap': 456, 'LogConfig': 'fixture-secret'},
        })
        self.assertEqual(record['resource_state'], {'oom_killed': True, 'exit_code': 137, 'restart_count': 2, 'Memory': 123, 'MemorySwap': 456})
        self.assertNotIn('fixture-secret', json.dumps(record))

    def test_main_only_executes_read_commands_and_sanitizes_both_log_streams(self):
        seen = []
        def command(args, timeout=20):
            seen.append(args)
            if args[:3] == ['docker', 'ps', '-a']:
                return 0, 'ai-relay-creem-moderation\nunrelated-secret-name\nai-relay-creem-moderation-images-rollback\n', ''
            if args[:2] == ['docker', 'inspect']:
                info = {'Image': 'sha256:' + 'a' * 64,
                        'State': {'Running': True, 'Restarting': False, 'Pid': 123, 'StartedAt': '2026-10-25T01:00:00Z', 'Error': 'fixture-secret'},
                        'Config': {'Env': ['PORT=3001', 'CREEM_API_KEY=fixture-secret']}}
                return 0, json.dumps([info]), ''
            if args[:2] == ['docker', 'logs']:
                return 0, 'private request body fixture-secret', '[native-image] forwarding failed id=' + REQUEST_ID + ' reason=TypeError cause=UND_ERR_NOT_SUPPORTED\n'
            if args[:2] == ['docker', 'exec'] and args[3] == 'node':
                return 0, '{"node":"22.20.0","undici":"6.22.0","secret":"fixture-secret"}', ''
            if args[:2] == ['docker', 'exec'] and args[3] == 'sha256sum':
                return 0, 'b' * 64 + '  /app/server.mjs\n', ''
            self.fail('Unexpected command shape')
        output = io.StringIO()
        with patch.object(diagnostics, 'command', command), patch.object(diagnostics, 'source_hash', return_value='c' * 64), contextlib.redirect_stdout(output):
            diagnostics.main()
        text = output.getvalue()
        self.assertNotIn('fixture-secret', text)
        self.assertNotIn('unrelated-secret-name', text)
        report = json.loads(text)
        self.assertEqual(len(report['containers']), 2)
        self.assertEqual(report['containers'][0]['matched_failures'][0]['cause'], 'UND_ERR_NOT_SUPPORTED')
        for args in seen:
            self.assertEqual(args[0], 'docker')
            self.assertIn(args[1], ('ps', 'inspect', 'logs', 'exec'))
            if args[1] == 'exec':
                self.assertIn(args[3], ('node', 'sha256sum'))
                self.assertNotIn('fetch(', ' '.join(args))
                self.assertNotIn('process.env', ' '.join(args))

    def test_failed_log_read_never_exports_partial_output_or_stderr(self):
        inspect = json.dumps([{'Config': {}, 'State': {}}])
        line = '[native-image] forwarding failed id=' + REQUEST_ID + ' reason=TypeError cause=UND_ERR_NOT_SUPPORTED'
        def command(args, timeout=20):
            return (0, inspect, '') if args[1] == 'inspect' else (1, line, 'fixture-secret')
        with patch.object(diagnostics, 'command', command):
            record = diagnostics.container_evidence('ai-relay-creem-moderation')
        self.assertEqual(record['log_status'], 'unavailable')
        self.assertEqual(record['matched_failures'], [])
        self.assertNotIn('fixture-secret', json.dumps(record))


if __name__ == '__main__':
    unittest.main(verbosity=2)
