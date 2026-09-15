# -*- coding: utf-8 -*-
from pathlib import Path
import subprocess

p = Path("static/brand/keyo-docs.html")
cur = p.read_text(encoding="utf-8")
head = subprocess.check_output(
    ["git", "show", "HEAD:static/brand/keyo-docs.html"],
    text=True,
    encoding="utf-8",
)

marker = (
    "function signalReady() {\n"
    "  if (!embedded) return;\n"
    "  try { window.parent.postMessage({ type: 'keyo-brand-ready' }, '*'); } catch {}\n"
    "}\n"
)
idx = cur.find(marker)
if idx < 0:
    raise SystemExit("signalReady marker not found in current")
keep = cur[: idx + len(marker)]

if "curl-video-gen" not in keep:
    raise SystemExit("keep missing videoGen")
if keep.count("function renderSamples") != 1:
    raise SystemExit("renderSamples count=%s" % keep.count("function renderSamples"))

hidx = head.find(marker)
if hidx < 0:
    raise SystemExit("HEAD signalReady not found")
tail = head[hidx + len(marker) :]

out = keep + "\n" + tail.lstrip("\n")
assert out.count("function renderSamples") == 1
assert out.count("function applyLang") == 1
assert "curl-video-gen" in out
assert 'id="video-gen"' in out
assert "</html>" in out[-120:]
p.write_text(out, encoding="utf-8")
print("recovered", len(out), "chars")
print("ok")
