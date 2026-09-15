import json
import re
import urllib.request
from pathlib import Path

env = {}
for line in Path(".env").read_text(encoding="utf-8", errors="ignore").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

bases = [
    (env.get("GRSAI_BASE_URL") or "https://grsaiapi.com").rstrip("/"),
    "https://grsai.dakka.com.cn",
]
key = env.get("GRSAI_API_KEY") or ""
print("has_key", bool(key))

want = re.compile(r"gpt-image-2\.5", re.I)
paths = [
    "/v1/models",
    "/models",
    "/api/models",
    "/v1/api/models",
    "/pricing",
    "/api/pricing",
    "/v1/pricing",
]

for base in bases:
    print("BASE", base)
    for path in paths:
        try:
            req = urllib.request.Request(
                base + path,
                headers={
                    "Authorization": "Bearer " + key,
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=25) as r:
                t = r.read().decode("utf-8", "ignore")
            print(" OK", path, "len", len(t))
            hits = sorted(set(want.findall(t)))
            # better extract model ids
            ids = sorted(set(re.findall(r"gpt-image-2\.5[A-Za-z0-9._-]{0,40}", t, re.I)))
            print("  ids", ids[:40] or "(none)")
            if ids:
                # dump nearby price-ish fields
                for mid in ids[:10]:
                    for m in re.finditer(re.escape(mid) + r".{0,200}", t, re.I | re.S):
                        snip = re.sub(r"\s+", " ", m.group(0))[:220]
                        print("  snip", snip)
                        break
        except Exception as e:
            print(" ERR", path, type(e).__name__, e)
