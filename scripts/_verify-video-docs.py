# -*- coding: utf-8 -*-
from pathlib import Path
t = Path("static/brand/keyo-docs.html").read_text(encoding="utf-8")
keys = [
    "tocVideoGen",
    "videoTitleGen",
    "videoIntroA",
    "videoIntroB",
    "videoHintGen",
    "videoImagineNote",
    "nWanVideo",
    "nSeedance25",
    "nSeedance20",
    "nFluxVideo",
    "nMinimaxVideo",
    "nGemOmni",
    "nGemOmniExt",
    "curl-video-gen",
]
for k in keys:
    print(f"{k}\t{t.count(k)}")
# ensure zhCN block has videoTitleGen
i = t.find('"zhCN": {')
j = t.find('"zhTW": {')
zh = t[i:j]
print("zhCN videoTitleGen", "videoTitleGen" in zh)
print("zhCN videoIntroB", "videoIntroB" in zh)
print("deploy has apimart", "apimart_video" in Path("scripts/deploy-brand-static.sh").read_text(encoding="utf-8"))
