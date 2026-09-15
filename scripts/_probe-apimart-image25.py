import re
from pathlib import Path
import urllib.request

env = {}
for line in Path(".env").read_text(encoding="utf-8", errors="ignore").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

base = (env.get("APIMART_BASE_URL") or "https://api.apimart.ai").rstrip("/")
key = env.get("APIMART_API_KEY") or ""
print("base", base, "has_key", bool(key))

paths = ["/v1/models", "/models", "/api/models", "/v1/pricing", "/pricing"]
for path in paths:
    try:
        req = urllib.request.Request(
            base + path, headers={"Authorization": "Bearer " + key, "Accept": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=25) as r:
            t = r.read().decode("utf-8", "ignore")
        print("OK", path, "len", len(t), "status", r.status)
        hits = sorted(set(re.findall(r"gpt-image[^\s\"'`,}]{0,48}", t, re.I)))
        print(" hits", hits[:40] or "(none)")
    except Exception as e:
        print("ERR", path, type(e).__name__, e)
