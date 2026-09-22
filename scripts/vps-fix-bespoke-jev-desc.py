#!/usr/bin/env python3
"""Update Bespoke-Nimble-9B marketplace description (Open-Jev / Jev)."""
import os
import sqlite3
import sys
import time

MODEL = "Bespoke-Nimble-9B"
DESC = (
    "Bespoke Nimble 9B（BespokeLabs，Open-Jev 路线）：不是通用对话模型，是「类型化判别决策」专用 LoRA"
    "（底座 Qwen3.5-9B-Instruct）。输入 state + questions，一次返回 choice / score / noul；"
    "每字段最多 26 选项；>2048 tokens 拒绝而非截断。计费：输入 $0.032 / 输出 $0（每百万 tokens）。"
)


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT id FROM models WHERE model_name=? LIMIT 1", (MODEL,))
    row = cur.fetchone()
    if not row:
        raise SystemExit("model missing: " + MODEL)
    mid = row[0]
    now = int(time.time())
    try:
        cur.execute(
            "UPDATE models SET description=?, updated_time=? WHERE id=?",
            (DESC, now, mid),
        )
    except sqlite3.OperationalError:
        cur.execute("UPDATE models SET description=? WHERE id=?", (DESC, mid))
    conn.commit()
    cur.execute("SELECT substr(description,1,80) FROM models WHERE id=?", (mid,))
    print("desc", cur.fetchone()[0])
    print("DONE_BESPOKE_JEV_DESC")
    conn.close()


if __name__ == "__main__":
    main()
