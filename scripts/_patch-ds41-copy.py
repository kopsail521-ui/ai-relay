# -*- coding: utf-8 -*-
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MID = "deepseek-v4.1-flash"
SELL_IN, SELL_OUT = 0.45, 1.80

desc = {
    "zhCN": f"DeepSeek V4.1 Flash：更快更省的对话与代码模型。约 ${SELL_IN:.2f} / ${SELL_OUT:.2f} 每百万 tokens。",
    "zhTW": f"DeepSeek V4.1 Flash：更快更省的對話與程式模型。約 ${SELL_IN:.2f} / ${SELL_OUT:.2f} 每百萬 tokens。",
    "en": f"DeepSeek V4.1 Flash — faster, cheaper chat and coding. About ${SELL_IN:.2f} / ${SELL_OUT:.2f} per 1M tokens.",
    "fr": f"DeepSeek V4.1 Flash — chat/code plus rapide et économique. Environ ${SELL_IN:.2f} / ${SELL_OUT:.2f} / 1M tokens.",
    "ru": f"DeepSeek V4.1 Flash — быстрее и дешевле для чата и кода. Около ${SELL_IN:.2f} / ${SELL_OUT:.2f} за 1M токенов.",
    "ja": f"DeepSeek V4.1 Flash。より高速・低コストなチャット／コード。約 ${SELL_IN:.2f} / ${SELL_OUT:.2f} / 100万 tokens。",
    "vi": f"DeepSeek V4.1 Flash — chat/coding nhanh và tiết kiệm hơn. Khoảng ${SELL_IN:.2f} / ${SELL_OUT:.2f} / 1M tokens.",
}

badge = {
    "zhCN": "按 Token 计费",
    "zhTW": "按 Token 計費",
    "en": "Token-based",
    "fr": "Token-based",
    "ru": "Token-based",
    "ja": "Token 課金",
    "vi": "Token-based",
}
empty = {k: "" for k in badge}

entry = {
    "description": desc["zhCN"],
    "descriptions": desc,
    "unit": "token",
    "badge": badge,
    "suffix": empty,
    "price_key": empty,
    "description_zh": desc["zhCN"],
    "description_en": desc["en"],
    "badge_zh": badge["zhCN"],
    "badge_en": badge["en"],
    "suffix_zh": "",
    "suffix_en": "",
    "price_key_zh": "",
    "price_key_en": "",
}

for rel in (
    "config/marketplace-model-copy.json",
    "services/creem-moderation-proxy/marketplace-model-copy.json",
):
    p = ROOT / rel
    data = json.loads(p.read_text(encoding="utf-8"))
    data[MID] = entry
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ok", rel)
