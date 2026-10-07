#!/usr/bin/env python3
import json
import re

m = open("/tmp/m61.html", encoding="utf-8", errors="ignore").read()
c = open("/tmp/cmp.html", encoding="utf-8", errors="ignore").read()
luna = open("/tmp/luna.html", encoding="utf-8", errors="ignore").read()
print("guide_has", "gpt-6.1-sol" in m and "~$0.37" in m)
print("compare_has", "gpt-6.1-sol" in c)
print("cogs", bool(re.search(r"COGS", m + c + luna)))
d = json.load(open("/tmp/pricing.json"))
by = {x.get("model_name"): x for x in (d.get("data") or [])}
row = by.get("gpt-6.1-sol")
print("hit", bool(row))
if row:
    mr = float(row.get("model_ratio") or 0)
    cr = float(row.get("completion_ratio") or 1)
    print("sell", round(mr * 2, 6), "/", round(mr * 2 * cr, 6))
blob = json.dumps(d, ensure_ascii=False) + m + c + luna
print(
    "public_leak",
    bool(
        re.search(
            r"unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售|reseller|wholesale",
            blob,
            re.I,
        )
    ),
)
print("DONE_GPT61_SEO")
