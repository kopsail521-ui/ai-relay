import json
import os
import sqlite3
import subprocess
import sys
import tempfile

def test_offline():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        # Initialize schema mimicking one-api.db
        cur.execute("""
        CREATE TABLE channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type INTEGER,
            key TEXT,
            name TEXT,
            base_url TEXT,
            models TEXT,
            model_mapping TEXT,
            "group" TEXT,
            status INTEGER
        );
        """)
        cur.execute("""
        CREATE TABLE vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            icon TEXT,
            description TEXT,
            status INTEGER
        );
        """)
        cur.execute("""
        CREATE TABLE models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT,
            description TEXT,
            icon TEXT,
            tags TEXT,
            vendor_id INTEGER,
            endpoints TEXT,
            status INTEGER,
            sync_official INTEGER
        );
        """)
        cur.execute("""
        CREATE TABLE abilities (
            "group" TEXT,
            model TEXT,
            channel_id INTEGER,
            enabled INTEGER,
            priority INTEGER,
            weight INTEGER,
            PRIMARY KEY("group", model, channel_id)
        );
        """)
        cur.execute("""
        CREATE TABLE options (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        """)

        # Insert a sample Keyo Chat channel
        cur.execute("""
        INSERT INTO channels(type, key, name, base_url, models, model_mapping, "group", status)
        VALUES(1, 'sk-test', 'Keyo Chat', 'https://api.unorouter.com', 'deepseek-v4-flash', '{}', 'default', 1)
        """)
        conn.commit()
        conn.close()

        # Run vps-add-deepseek-v41.py against the temp db
        py_path = os.path.join(os.path.dirname(__file__), "vps-add-deepseek-v41.py")
        res = subprocess.run([sys.executable, py_path, db_path], capture_output=True, text=True)
        print("Script stdout:\n", res.stdout)
        if res.returncode != 0:
            print("Script stderr:\n", res.stderr)
            raise RuntimeError("vps-add-deepseek-v41.py failed!")

        # Verify DB contents
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        # 1. Channels
        cur.execute("SELECT models, model_mapping FROM channels WHERE name='Keyo Chat'")
        ch_models, ch_mapping = cur.fetchone()
        assert "deepseek-v4.1-flash-1017" in ch_models
        assert "deepseek-v4.1-flash-1017:free" in ch_models
        mapping_dict = json.loads(ch_mapping)
        assert mapping_dict.get("deepseek-v4.1-flash-1017:free") == "deepseek-v4.1-flash-1017"
        print("[OK] Channel models & model_mapping verified!")

        # 2. Models
        cur.execute("SELECT model_name, icon, tags FROM models")
        m_rows = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
        assert "deepseek-v4.1-flash-1017" in m_rows
        assert "deepseek-v4.1-flash-1017:free" in m_rows
        assert m_rows["deepseek-v4.1-flash-1017"][0] == "DeepSeek.Color"
        assert m_rows["deepseek-v4.1-flash-1017:free"][0] == "DeepSeek.Color"
        print("[OK] Models table verified!")

        # 3. Abilities
        cur.execute("SELECT model, channel_id FROM abilities WHERE \"group\"='default'")
        abilities = {r[0]: r[1] for r in cur.fetchall()}
        assert "deepseek-v4.1-flash-1017" in abilities
        assert "deepseek-v4.1-flash-1017:free" in abilities
        print("[OK] Abilities table verified!")

        # 4. Options
        cur.execute("SELECT key, value FROM options")
        opts = {r[0]: json.loads(r[1]) for r in cur.fetchall()}
        mr = opts.get("ModelRatio", {})
        cr = opts.get("CompletionRatio", {})
        mp = opts.get("ModelPrice", {})

        # Paid model: 3x markup
        assert mr.get("deepseek-v4.1-flash-1017") == 0.33, f"Expected 0.33, got {mr.get('deepseek-v4.1-flash-1017')}"
        assert cr.get("deepseek-v4.1-flash-1017") == 2.7273, f"Expected 2.7273, got {cr.get('deepseek-v4.1-flash-1017')}"
        assert "deepseek-v4.1-flash-1017" not in mp

        # Gift model: 10x markup
        assert mr.get("deepseek-v4.1-flash-1017:free") == 1.10, f"Expected 1.10, got {mr.get('deepseek-v4.1-flash-1017:free')}"
        assert cr.get("deepseek-v4.1-flash-1017:free") == 2.7273, f"Expected 2.7273, got {cr.get('deepseek-v4.1-flash-1017:free')}"
        assert "deepseek-v4.1-flash-1017:free" not in mp

        print("[OK] Options (ModelRatio, CompletionRatio, ModelPrice) verified!")
        conn.close()
        print("\nALL OFFLINE TESTS PASSED PERFECTLY!")

    finally:
        try:
            conn.close()
        except:
            pass
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except:
            pass

if __name__ == "__main__":
    test_offline()
