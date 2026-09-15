#!/bin/bash
# One-paste Keyo release: brand/SEO static + rebuild New API console image.
# On VPS Workbench / SSH:
#   sudo bash /opt/ai-relay/scripts/vps-release-keyo-console.sh
# Or after git pull:
#   cd /opt/ai-relay && sudo bash scripts/vps-release-keyo-console.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
CONTAINER="${CONTAINER:-ai-relay-new-api}"
IMAGE="${IMAGE:-keyo-new-api:local}"
DOMAIN="${DOMAIN:-www.keyoapi.xyz}"

echo "==> 1/4 git pull"
cd "$ROOT"
git pull origin main

echo "==> 2/4 brand + SEO + Caddy"
bash "$ROOT/scripts/deploy-brand-static.sh"

echo "==> 3/4 build New API image (embeds Keyo console UI)"
test -f "$ROOT/new-api/Dockerfile"
cd "$ROOT/new-api"
docker build -t "$IMAGE" .

echo "==> 4/4 recreate $CONTAINER with same mounts/env/network, new image"
export CONTAINER IMAGE
python3 - <<'PY'
import json, os, shlex, subprocess

name = os.environ["CONTAINER"]
img = os.environ["IMAGE"]
info = json.loads(subprocess.check_output(["docker", "inspect", name], text=True))[0]
cfg, host = info["Config"], info["HostConfig"]
tmp = name + "-next"

subprocess.call(["docker", "rm", "-f", tmp], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

cmd = ["docker", "run", "-d", "--name", tmp]
rp = (host.get("RestartPolicy") or {}).get("Name") or "always"
if rp and rp != "no":
    cmd += ["--restart", rp]

net = host.get("NetworkMode") or "default"
if net == "host":
    cmd += ["--network", "host"]
elif net not in ("default", "bridge", ""):
    cmd += ["--network", net]
else:
    for port, binds in (host.get("PortBindings") or {}).items():
        for b in binds or []:
            hp = b.get("HostPort") or ""
            if hp:
                cmd += ["-p", f"{hp}:{port.split('/')[0]}"]

for bind in host.get("Binds") or []:
    cmd += ["-v", bind]

for e in cfg.get("Env") or []:
    cmd += ["-e", e]

cmd.append(img)
if cfg.get("Cmd"):
    cmd += list(cfg["Cmd"])

print("RUN:", " ".join(shlex.quote(x) for x in cmd), flush=True)
subprocess.check_call(cmd)
subprocess.check_call(["docker", "rm", "-f", name])
subprocess.check_call(["docker", "rename", tmp, name])
print("OK_RECREATED", name, "->", img, flush=True)
PY

echo "==> optional: apply SystemName/Logo if repo .env has admin token"
if [[ -f "$ROOT/.env" ]]; then
  (cd "$ROOT" && node scripts/apply-site-branding.mjs) || echo "WARN: apply-site-branding skipped/failed (run from laptop if needed)"
else
  echo "SKIP branding API (no $ROOT/.env) — run locally: node scripts/apply-site-branding.mjs"
fi

echo "==> checks"
curl -sI "https://${DOMAIN}/brand/logo.svg" | head -n 5 || true
curl -sI "https://${DOMAIN}/brand/keyo-home.html" | head -n 3 || true
curl -sS -m 8 "http://127.0.0.1:3000/api/status" | head -c 240 || true
echo
echo "DONE_KEYO_RELEASE"
echo "Hard-refresh console (Ctrl+Shift+R). Confirm flat header + ink sidebar active state."
