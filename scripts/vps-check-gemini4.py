#!/usr/bin/env python3
"""Verify public /api/pricing exposes gemini-4-argon / gemini-4-barium correctly."""
import json
import sys

EXPECTED = {
    "gemini-4-argon": {"model_ratio": 0.36765, "completion_ratio": 5},
    "gemini-4-barium": {"model_ratio": 0.36765, "completion_ratio": 5},
}


def main(path):
    data = json.load(open(path, encoding="utf-8"))
    arr = data.get("data") or []
    public = {m.get("model_name"): m for m in arr}
    for mid, want in EXPECTED.items():
        m = public.get(mid)
        if not m:
            print(mid, "MISSING")
            return 1
        if abs((m.get("model_ratio") or 0) - want["model_ratio"]) > 1e-9:
            print(mid, "bad model_ratio", m.get("model_ratio"))
            return 1
        if abs((m.get("completion_ratio") or 0) - want["completion_ratio"]) > 1e-9:
            print(mid, "bad completion_ratio", m.get("completion_ratio"))
            return 1
        if m.get("quota_type") != 0:
            print(mid, "bad quota_type", m.get("quota_type"))
            return 1
        if "default" not in (m.get("enable_groups") or []):
            print(mid, "default group missing", m.get("enable_groups"))
            return 1
        blob = json.dumps(m, ensure_ascii=False).lower()
        for banned in ("openlux", "openrouter", "unorouter", "sensenova", "apimart", "aicopy", "gitee"):
            if banned in blob:
                print(mid, "upstream trace:", banned)
                return 1
        sell_in = (m.get("model_ratio") or 0) * 2
        sell_out = sell_in * (m.get("completion_ratio") or 1)
        print(mid, "sell ~$", round(sell_in, 4), "/ $", round(sell_out, 4), "per 1M in/out — OK")
    print("CHECK_GEMINI4_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
