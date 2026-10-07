#!/usr/bin/env python3
"""只读诊断：Atria-dawn-v2 报「该模型已停用」的真因。

- 打印服务 Atria 的渠道整行（密钥列已打码）
- 打印 Atria / Prover 的 models、abilities 行
- 打印 ModelRatio / CompletionRatio / ModelPrice 中相关条目
- 用渠道自己的 key 直接问上游，看上游模型目录里 Atria 的状态
  （只回显状态字段，不回显 key）

用法（VPS）：
  sudo python3 /opt/ai-relay/scripts/vps-diag-atria.py
"""
import json
import sqlite3
import sys
import urllib.error
import urllib.request

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"
NAME = sys.argv[2] if len(sys.argv) > 2 else "Atria-dawn-v2"


def cols(cur, table):
    return [r[1] for r in cur.execute("pragma table_info(%s)" % table)]


def show_row(cur, table, where, params, redact=("key", "secret", "token")):
    names = cols(cur, table)
    sql = "SELECT * FROM %s WHERE %s" % (table, where)
    if "deleted_at" in names:
        sql = sql.replace("WHERE", "WHERE deleted_at IS NULL AND", 1) if "WHERE" in sql else sql
    cur.execute(sql, params)
    for row in cur.fetchall():
        for n, v in zip(names, row):
            if n in redact and v:
                v = v[:6] + "***" + v[-4:] if len(str(v)) > 12 else "***"
            print("  %-16s = %s" % (n, v))
        print("  " + "-" * 30)


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    print("=== channels 里提到 %s 的渠道 ===" % NAME)
    show_row(cur, "channels", "models LIKE ?", ("%%%s%%" % NAME,))

    print("=== models 行 ===")
    for name in ("Atria-dawn-v2", "Atria-dawn-v2:free",
                 "DeepSeek-Prover-V2-7B", "DeepSeek-Prover-V2-7B:free"):
        cur.execute("SELECT id, model_name, status, deleted_at FROM models WHERE model_name=?", (name,))
        rows = cur.fetchall()
        print("  %-28s %s" % (name, rows if rows else "【无此行】"))

    print("=== abilities 行 ===")
    for name in ("Atria-dawn-v2", "Atria-dawn-v2:free",
                 "DeepSeek-Prover-V2-7B", "DeepSeek-Prover-V2-7B:free"):
        cur.execute('SELECT "group", channel_id, enabled, priority, weight FROM abilities WHERE model=?', (name,))
        print("  %-28s %s" % (name, cur.fetchall()))

    print("=== options 相关条目 ===")
    for opt in ("ModelRatio", "CompletionRatio", "ModelPrice", "ModelPriceHelper"):
        cur.execute("SELECT value FROM options WHERE key=?", (opt,))
        row = cur.fetchone()
        data = json.loads(row[0]) if row and row[0] else {}
        hits = {k: v for k, v in data.items() if "Atria" in k or "Prover" in k}
        print("  %-16s %s" % (opt, json.dumps(hits, ensure_ascii=False) or "{}"))

    # 上游直查：模型目录里 Atria 的状态
    print("=== 上游模型目录状态 ===")
    cur.execute("SELECT id, name, base_url, key, models, model_mapping FROM channels WHERE models LIKE ?", ("%%%s%%" % NAME,))
    for cid, cname, base, key, models_s, mapping_s in cur.fetchall():
        base = (base or "").rstrip("/")
        if not base or not key:
            print("  channel %s(%s): base_url 或 key 为空" % (cid, cname))
            continue
        print("  channel %s(%s) base=%s" % (cid, cname, base))
        for path in ("/models", "/api/v1/models", "/v1/models"):
            try:
                r = urllib.request.Request(base + path, method="GET")
                r.add_header("Authorization", "Bearer " + key)
                with urllib.request.urlopen(r, timeout=30) as resp:
                    payload = json.loads(resp.read().decode())
                break
            except (urllib.error.HTTPError, urllib.error.URLError) as e:
                err = str(e)
        else:
            print("    上游模型目录取不到：%s" % err[:160])
            continue
        items = payload.get("data") or payload.get("models") or []
        for it in items:
            mid = it.get("id") or it.get("slug") or it.get("model_id")
            if NAME in str(mid):
                status = it.get("status") or it.get("deployment_status") or ""
                print("    上游模型 %-28s status=%-14s active=%s" % (
                    mid, status or "(未给状态字段)", it.get("active")))
        print("    该渠道 models 列表里是否有 %s 的 :free 别名: %s" % (
            NAME, NAME + ":free" in (models_s or "")))
        mapping = json.loads(mapping_s) if mapping_s else {}
        print("    model_mapping=%s" % json.dumps(mapping, ensure_ascii=False))
    conn.close()


if __name__ == "__main__":
    main()
