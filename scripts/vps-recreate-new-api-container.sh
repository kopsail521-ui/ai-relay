#!/bin/bash
# Recreate ai-relay-new-api using an already-built keyo-new-api:local image.
set -euo pipefail
export CONTAINER="${CONTAINER:-ai-relay-new-api}"
export IMAGE="${IMAGE:-keyo-new-api:local}"
python3 - <<'PY'
import json, os, shlex, subprocess
name, img = os.environ["CONTAINER"], os.environ["IMAGE"]
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
