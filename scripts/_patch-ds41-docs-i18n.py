# -*- coding: utf-8 -*-
from pathlib import Path

p = Path("scripts/build-keyo-docs-i18n.mjs")
t = p.read_text(encoding="utf-8")

# After each nDsFast line (not nDsFast41), insert nDsFast41 if missing nearby
lines = t.splitlines(keepends=True)
out = []
i = 0
locale_labels = {
    "DeepSeek fast": "DeepSeek V4.1 fast",
    "DeepSeek 快": "DeepSeek V4.1 快",
    "DeepSeek 高速": "DeepSeek V4.1 高速",
    "DeepSeek rapide": "DeepSeek V4.1 rapide",
    "DeepSeek быстрый": "DeepSeek V4.1 быстрый",
    "DeepSeek nhanh": "DeepSeek V4.1 nhanh",
}
added = 0
while i < len(lines):
    line = lines[i]
    out.append(line)
    if "nDsFast:" in line and "nDsFast41" not in line:
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if "nDsFast41" not in nxt:
            # extract quoted value
            for src, dst in locale_labels.items():
                if src in line:
                    indent = line[: len(line) - len(line.lstrip())]
                    out.append(f'{indent}nDsFast41: "{dst}",\n')
                    added += 1
                    break
    i += 1

p.write_text("".join(out), encoding="utf-8")
print("added", added, "total", "".join(out).count("nDsFast41"))
