#!/usr/bin/env python3
import json

PATHS = [
    "/opt/ai-relay/config/marketplace-model-copy.json",
    "/opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json",
]
EN = "GPT-6.1 Sol chat and reasoning — updated Sol-class GPT-6."
ZH = "GPT-6.1 Sol 对话与推理，Sol 档更新。"

for p in PATHS:
    try:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        print("copy_skip", p, exc)
        continue
    entry = data.get("gpt-6.1-sol") or {}
    entry["description"] = ZH
    entry["description_zh"] = ZH
    entry["description_en"] = EN
    desc = entry.get("descriptions") or {}
    desc["zhCN"] = ZH
    desc["zhTW"] = "GPT-6.1 Sol 對話與推理，Sol 檔更新。"
    desc["en"] = EN
    desc["fr"] = EN
    desc["ru"] = EN
    entry["descriptions"] = desc
    data["gpt-6.1-sol"] = entry
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("copy_ok", p)
