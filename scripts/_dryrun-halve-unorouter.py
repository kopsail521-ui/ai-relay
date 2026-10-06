import json, os, sqlite3, subprocess, sys, tempfile

tmp = tempfile.mkdtemp()
db = os.path.join(tmp, "one-api.db")
c = sqlite3.connect(db)
cur = c.cursor()
cur.execute("CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT)")
cfg = json.load(open("config/unorouter-paid-models.json", encoding="utf-8"))
mr = {}
for m in cfg["models"]:
    mr[m["id"]] = round(float(m["cost_in"]), 6)  # live state: ratio = cost (price = cost x2)
mr["glm-5.2"] = 0.7  # non-unorouter, must stay untouched
cur.execute("INSERT INTO options(key,value) VALUES ('ModelRatio',?)", (json.dumps(mr),))
c.commit(); c.close()

env = {**os.environ, "KEYO_ROOT": "."}
r = subprocess.run([sys.executable, "scripts/vps-halve-unorouter-paid.py", db], capture_output=True, text=True, env=env, cwd=".")
# script reads /opt/ai-relay/config on VPS; locally it falls back to CFG_LOCAL via cwd
print(r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr); sys.exit(1)

# second run must refuse (below cost guard)
r2 = subprocess.run([sys.executable, "scripts/vps-halve-unorouter-paid.py", db], capture_output=True, text=True, env=env, cwd=".")
print("--- second run (guard) ---")
print("\n".join(r2.stdout.splitlines()[:4]))
print("second run exit:", r2.returncode, "(expected nonzero)")
if r2.returncode == 0:
    print("GUARD FAILED — second run changed prices again!")
    sys.exit(1)

c = sqlite3.connect(db); cur = c.cursor()
mr2 = json.loads(cur.execute("SELECT value FROM options WHERE key='ModelRatio'").fetchone()[0])
print("glm-5.2 untouched:", mr2["glm-5.2"] == 0.7)
print("deepseek-v4.1-flash:", mr2["deepseek-v4.1-flash"], "(expect cost/2 =", round(cfg["models"][0]["cost_in"]/2, 6), ")")
c.close()
print("DRYRUN_HALVE_OK")
