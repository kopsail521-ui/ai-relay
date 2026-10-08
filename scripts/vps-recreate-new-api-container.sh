#!/bin/bash
# Recreate ai-relay-new-api using an already-built keyo-new-api:local image.
set -euo pipefail
export CONTAINER="${CONTAINER:-ai-relay-new-api}"
export IMAGE="${IMAGE:-keyo-new-api:local}"
python3 - <<'PY'
import json, os, re, shlex, subprocess

name, img = os.environ["CONTAINER"], os.environ["IMAGE"]
exists = subprocess.call(["docker", "inspect", name],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
if exists:
    info = json.loads(subprocess.check_output(["docker", "inspect", name], text=True))[0]
    cfg, host = info["Config"], info["HostConfig"]
else:
    # Container is gone (removed by hand, or an earlier run died mid-swap).
    # Rebuild from the known-good defaults instead of aborting with no service.
    print(f"INSPECT_FAILED: {name} missing; recreating from defaults", flush=True)
    cfg = {
        "Env": ["TZ=Asia/Shanghai", "ERROR_LOG_ENABLED=true", "BATCH_UPDATE_ENABLED=true"],
        "Cmd": ["--log-dir", "/app/logs"],
    }
    host = {
        "RestartPolicy": {"Name": "always"},
        "NetworkMode": "ai-relay_default",
        "PortBindings": {"3000/tcp": [{"HostPort": "3000"}]},
        "Binds": [
            "/opt/ai-relay/data/new-api:/data:rw",
            "/opt/ai-relay/data/logs:/app/logs:rw",
        ],
    }
tmp = name if not exists else name + "-next"
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

# Always keep published ports unless host networking.
if net != "host":
    for port, binds in (host.get("PortBindings") or {}).items():
        for b in binds or []:
            hp = b.get("HostPort") or ""
            if hp:
                cmd += ["-p", f"{hp}:{port.split('/')[0]}"]
    # Fallback if inspect has no PortBindings (compose custom network).
    if not host.get("PortBindings"):
        cmd += ["-p", "3000:3000"]

for bind in host.get("Binds") or []:
    cmd += ["-v", bind]

env_re = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
for e in cfg.get("Env") or []:
    if not e or not env_re.match(e):
        print("SKIP_ENV", repr(e), flush=True)
        continue
    cmd += ["-e", e]

cmd.append(img)
if cfg.get("Cmd"):
    cmd += list(cfg["Cmd"])

print("RUN:", " ".join(shlex.quote(x) for x in cmd), flush=True)
if exists:
    # The old container still owns published ports (3000). Stop it first.
    # restart=always would bring it back immediately, so turn that off until swap.
    subprocess.call(["docker", "update", "--restart=no", name], stdout=subprocess.DEVNULL)
    subprocess.check_call(["docker", "stop", name])
try:
    subprocess.check_call(cmd)
except subprocess.CalledProcessError as exc:
    print("DOCKER_RUN_FAILED", exc.returncode, flush=True)
    if exists:
        print("restoring", name, flush=True)
        subprocess.call(["docker", "start", name])
        if rp and rp != "no":
            subprocess.call(["docker", "update", "--restart=" + rp, name])
    raise SystemExit(exc.returncode)

if exists:
    subprocess.check_call(["docker", "rm", "-f", name])
    subprocess.check_call(["docker", "rename", tmp, name])
print("OK_RECREATED", name, "->", img, flush=True)
PY
