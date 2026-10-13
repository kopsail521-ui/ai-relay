#!/usr/bin/env python3
"""Validate the public pricing response after listing the Eleven models."""
import json
import re
import sys


def check(data):
    errors = []
    if data.get("success") is not True:
        errors.append("pricing API did not return success")
    vendors = {v.get("id"): v.get("name") for v in data.get("vendors", [])}
    models = {m.get("model_name"): m for m in data.get("data", [])}
    for name, ratio in (("eleven-v4", 40), ("eleven-v4-turbo", 20)):
        m = models.get(name)
        if not m:
            errors.append(name + " MISSING")
            continue
        vendor = m.get("vendor_name") or vendors.get(m.get("vendor_id"))
        print(name, "ratio", m.get("model_ratio"), "vendor", vendor, "tags", m.get("tags"))
        for field, expected in (("model_ratio", ratio), ("quota_type", 0),
                                ("model_price", 0), ("completion_ratio", 0),
                                ("audio_ratio", 0), ("audio_completion_ratio", 0)):
            if field not in m or m[field] != expected:
                errors.append(f"{name} {field}: expected {expected}, got {m.get(field)}")
        if vendor != "ElevenLabs" or "语音合成" not in (m.get("tags") or ""):
            errors.append(name + " vendor/tag mismatch")
        if "default" not in (m.get("enable_groups") or []):
            errors.append(name + " unavailable in default group")
        if "openai-audio" not in (m.get("supported_endpoint_types") or []):
            errors.append(name + " missing speech endpoint")
    if any(name in models for name in ("keyo-eleven-v4", "keyo-eleven-v4-turbo")):
        errors.append("old public model IDs remain")
    if data.get("group_ratio", {}).get("default") != 1:
        errors.append("default group ratio must be 1 for these listed prices")
    leak = bool(re.search(r"小裴|豆姐|aicopy|unorouter|openlux|openrouter|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售", json.dumps(data, ensure_ascii=False), re.I))
    print("public_leak", leak)
    if leak:
        errors.append("public response contains supplier wording")
    for error in errors:
        print("FAIL", error)
    print("HAS_FAIL" if errors else "ALL_OK")
    return not errors


if __name__ == "__main__":
    with open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/pricing.json", encoding="utf-8") as f:
        result = check(json.load(f))
    sys.exit(0 if result else 1)
