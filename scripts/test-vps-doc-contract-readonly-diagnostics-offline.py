#!/usr/bin/env python3
"""Temporary SQLite only; forbid reads of credentials, users and logs."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('vps-doc-contract-readonly-diagnostics.py')
spec = importlib.util.spec_from_file_location('doc_contract_diagnostics', SCRIPT)
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class DiagnosticsTests(unittest.TestCase):
    def test_existing_readonly_database_filtered_membership_and_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.db'
            db = sqlite3.connect(path)
            db.executescript('''CREATE TABLE channels (id INTEGER, type INTEGER, status INTEGER, models TEXT, key TEXT, name TEXT, base_url TEXT);
                INSERT INTO channels VALUES (1,24,1,' gemini-3.8-flash-tts ,gemini-3.1-flash-tts-preview,private-other-model','private-key','private-name','private-url');
                INSERT INTO channels VALUES (2,1,2,'gemini-3.8-flash-tts','private-key','private-name','private-url');
                INSERT INTO channels VALUES (3,1,1,'other-model','private-key','private-name','private-url');''')
            db.close()
            before = path.read_bytes()
            original_connect = sqlite3.connect
            reads = []
            def readonly_connect(database_uri, **kwargs):
                self.assertTrue(database_uri.endswith('?mode=ro'))
                self.assertTrue(kwargs['uri'])
                connection = original_connect(database_uri, **kwargs)
                def authorize(action, table, column, *args):
                    if action == sqlite3.SQLITE_READ:
                        reads.append((table, column))
                        return sqlite3.SQLITE_OK if table == 'channels' and column in ('id', 'type', 'status', 'models') else sqlite3.SQLITE_DENY
                    return sqlite3.SQLITE_OK
                connection.set_authorizer(authorize)
                return connection
            with patch.object(diagnostics.sqlite3, 'connect', side_effect=readonly_connect):
                result = diagnostics.collect(path)
            self.assertEqual(result['models']['gemini-3.8-flash-tts'], [
                {'channel_id': 1, 'type': 24, 'status': 1}, {'channel_id': 2, 'type': 1, 'status': 2}])
            self.assertEqual(result['models']['gemini-3.1-flash-tts-preview'], [{'channel_id': 1, 'type': 24, 'status': 1}])
            self.assertEqual(set(reads), {('channels', c) for c in ('id', 'type', 'status', 'models')})
            self.assertNotIn('private', json.dumps(result))
            self.assertEqual(path.read_bytes(), before)

    def test_missing_database_is_not_created(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'absent.db'
            with self.assertRaises(RuntimeError): diagnostics.collect(path)
            self.assertFalse(path.exists())


if __name__ == '__main__':
    unittest.main()
