#!/usr/bin/env python3
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location("unorouter_price_guard", Path(__file__).with_name("unorouter-price-guard.py"))
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
run = _MODULE.run


CATALOG = {"counts": {"models": 1}, "models": [{
    "model_name": "demo-model", "input_price": 0.081, "output_price": 0.241,
    "online": True, "is_free": False,
}]}


def fixture():
    tmp = tempfile.TemporaryDirectory()
    db = Path(tmp.name) / "one-api.db"
    state = Path(tmp.name) / "state.json"
    conn = sqlite3.connect(db)
    conn.executescript("""
      CREATE TABLE options(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE channels(id INTEGER PRIMARY KEY, name TEXT, deleted_at INTEGER);
      CREATE TABLE abilities("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER);
    """)
    conn.execute("INSERT INTO channels(id,name,deleted_at) VALUES(1,'Keyo Chat',NULL)")
    conn.execute("INSERT INTO abilities VALUES('default','demo-model',1,1)")
    conn.execute("INSERT INTO abilities VALUES('default','demo-model',2,1)")
    conn.execute("INSERT INTO options VALUES('ModelRatio','{\"demo-model\":0.05}')")
    conn.execute("INSERT INTO options VALUES('CompletionRatio','{\"demo-model\":3}')")
    conn.commit(); conn.close()
    return tmp, db, state


class GuardTests(unittest.TestCase):
    def config(self, enabled=True):
        return {"enabled": enabled, "channel_name": "Keyo Chat", "max_cost_share_of_sell": 0.8,
                "recovery_checks": 2, "models": ["demo-model"]}

    def test_over_cap_only_disables_target_channel(self):
        tmp, db, state = fixture(); self.addCleanup(tmp.cleanup)
        result = run(self.config(), db, state, catalog=CATALOG)
        self.assertEqual(result["models"][0]["reason"], "upstream_price_over_cap")
        conn = sqlite3.connect(db)
        self.assertEqual(conn.execute("SELECT enabled FROM abilities WHERE channel_id=1").fetchone()[0], 0)
        self.assertEqual(conn.execute("SELECT enabled FROM abilities WHERE channel_id=2").fetchone()[0], 1)
        conn.close()

    def test_recovery_requires_two_good_reads(self):
        tmp, db, state = fixture(); self.addCleanup(tmp.cleanup)
        run(self.config(), db, state, catalog=CATALOG)
        good = {"models": [{"model_name": "demo-model", "input_price": 0.01, "output_price": 0.02, "online": True}]}
        run(self.config(), db, state, catalog=good)
        conn = sqlite3.connect(db)
        try:
            self.assertEqual(conn.execute("SELECT enabled FROM abilities WHERE channel_id=1").fetchone()[0], 0)
        finally:
            conn.close()
        run(self.config(), db, state, catalog=good)
        conn = sqlite3.connect(db); self.assertEqual(conn.execute("SELECT enabled FROM abilities WHERE channel_id=1").fetchone()[0], 1); conn.close()

    def test_report_only_does_not_change_database(self):
        tmp, db, state = fixture(); self.addCleanup(tmp.cleanup)
        result = run(self.config(False), db, state, catalog=CATALOG)
        self.assertEqual(result["result"], "PRICE_GUARD_DISABLED")
        conn = sqlite3.connect(db); self.assertEqual(conn.execute("SELECT enabled FROM abilities WHERE channel_id=1").fetchone()[0], 1); conn.close()

    def test_stale_price_data_fails_closed(self):
        tmp, db, state = fixture(); self.addCleanup(tmp.cleanup)
        config = self.config(); config["stale_after_sec"] = 0
        original = _MODULE.fetch_catalog
        _MODULE.fetch_catalog = lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("network"))
        self.addCleanup(lambda: setattr(_MODULE, "fetch_catalog", original))
        result = run(config, db, state, catalog=None)
        self.assertTrue(result["stale"])
        conn = sqlite3.connect(db); self.assertEqual(conn.execute("SELECT enabled FROM abilities WHERE channel_id=1").fetchone()[0], 0); conn.close()


if __name__ == "__main__":
    unittest.main()
