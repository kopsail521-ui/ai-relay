# -*- coding: utf-8 -*-
from pathlib import Path

p = Path("static/brand/keyo-docs.html")
t = p.read_text(encoding="utf-8")
pairs = [
    ('"nDsFast": "DeepSeek fast",', '"nDsFast": "DeepSeek fast",\n    "nDsFast41": "DeepSeek V4.1 fast",'),
    ('"nDsFast": "DeepSeek 快",', '"nDsFast": "DeepSeek 快",\n    "nDsFast41": "DeepSeek V4.1 快",'),
    ('"nDsFast": "DeepSeek 高速",', '"nDsFast": "DeepSeek 高速",\n    "nDsFast41": "DeepSeek V4.1 高速",'),
    ('"nDsFast": "DeepSeek rapide",', '"nDsFast": "DeepSeek rapide",\n    "nDsFast41": "DeepSeek V4.1 rapide",'),
    ('"nDsFast": "DeepSeek быстрый",', '"nDsFast": "DeepSeek быстрый",\n    "nDsFast41": "DeepSeek V4.1 быстрый",'),
    ('"nDsFast": "DeepSeek nhanh",', '"nDsFast": "DeepSeek nhanh",\n    "nDsFast41": "DeepSeek V4.1 nhanh",'),
]
for a, b in pairs:
    print(a[:40], t.count(a))
    t = t.replace(a, b)
print("nDsFast41", t.count("nDsFast41"))
p.write_text(t, encoding="utf-8")
