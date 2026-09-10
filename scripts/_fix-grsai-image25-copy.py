# -*- coding: utf-8 -*-
"""Fix marketplace copy for Grsai gpt-image-2.5 models (sell = cost×1.5, FX=7.3)."""
import json
from pathlib import Path

FX = 7.3
MARKUP = 1.5
ROOT = Path(__file__).resolve().parents[1]

MODELS = {
    "gpt-image-2.5": {
        "cost_cny": 0.03,
        "desc": {
            "zhCN": "GPT Image 2.5：入门文生图 / 图生图（约 1K）。按张计费。",
            "zhTW": "GPT Image 2.5：入門文生圖 / 圖生圖（約 1K）。按張計費。",
            "en": "GPT Image 2.5: entry text/image-to-image (~1K). Billed per image.",
            "fr": "GPT Image 2.5 : génération / édition image d’entrée (~1K). Facturé par image.",
            "ru": "GPT Image 2.5: базовая генерация/редактирование (~1K). Оплата за изображение.",
            "ja": "GPT Image 2.5：入門の文生図／図生図（約 1K）。画像ごとに課金。",
            "vi": "GPT Image 2.5: tạo/sửa ảnh cơ bản (~1K). Tính phí theo ảnh.",
        },
    },
    "gpt-image-2.5-flare": {
        "cost_cny": 0.10,
        "desc": {
            "zhCN": "GPT Image 2.5 Flare：低延迟通用文生图 / 图生图，适合批量快速出图。按张计费。",
            "zhTW": "GPT Image 2.5 Flare：低延遲通用文生圖 / 圖生圖，適合批量快速出圖。按張計費。",
            "en": "GPT Image 2.5 Flare: low-latency image generation for fast batch output. Billed per image.",
            "fr": "GPT Image 2.5 Flare : génération d’images à faible latence pour lots rapides. Facturé par image.",
            "ru": "GPT Image 2.5 Flare: низкая задержка, быстрая пакетная генерация. Оплата за изображение.",
            "ja": "GPT Image 2.5 Flare：低遅延の汎用画像生成。バッチ向け。画像ごとに課金。",
            "vi": "GPT Image 2.5 Flare: sinh ảnh độ trễ thấp, phù hợp xuất hàng loạt. Tính phí theo ảnh.",
        },
    },
    "gpt-image-2.5-sunburst": {
        "cost_cny": 0.12,
        "desc": {
            "zhCN": "GPT Image 2.5 Sunburst：高精度文生图 / 精细编辑，适合精品商业出图。按张计费。",
            "zhTW": "GPT Image 2.5 Sunburst：高精度文生圖 / 精細編輯，適合精品商業出圖。按張計費。",
            "en": "GPT Image 2.5 Sunburst: high-precision generation and editing. Billed per image.",
            "fr": "GPT Image 2.5 Sunburst : génération/édition haute précision. Facturé par image.",
            "ru": "GPT Image 2.5 Sunburst: высокая точность генерации и редактирования. Оплата за изображение.",
            "ja": "GPT Image 2.5 Sunburst：高精度の生成・編集。画像ごとに課金。",
            "vi": "GPT Image 2.5 Sunburst: tạo/sửa ảnh độ chính xác cao. Tính phí theo ảnh.",
        },
    },
}

BADGE = {
    "zhCN": "按次计费",
    "zhTW": "按次計費",
    "en": "Per Request",
    "fr": "Par requête",
    "ru": "За запрос",
    "ja": "リクエスト課金",
    "vi": "Theo lần gọi",
}
SUFFIX = {
    "zhCN": "/次",
    "zhTW": "/次",
    "en": "/ request",
    "fr": "/ requête",
    "ru": "/ запрос",
    "ja": "/ 回",
    "vi": "/ lần",
}
PRICE_KEY = {
    "zhCN": "每次请求",
    "zhTW": "每次請求",
    "en": "Per request",
    "fr": "Par requête",
    "ru": "За запрос",
    "ja": "リクエストごと",
    "vi": "Mỗi lần gọi",
}


def sell_usd(cny: float) -> float:
    return (cny / FX) * MARKUP


def price_str(cny: float) -> str:
    return f"{sell_usd(cny):.6f}".rstrip("0").rstrip(".")


def build_entry(meta: dict) -> dict:
    p = price_str(meta["cost_cny"])
    d = meta["desc"]
    descs = {
        "zhCN": f"{d['zhCN']} 计费：${p}/次。",
        "zhTW": f"{d['zhTW']} 計費：${p}/次。",
        "en": f"{d['en']} Pricing: ${p} / request.",
        "fr": f"{d['fr']} Tarif : ${p} / requête.",
        "ru": f"{d['ru']} Тариф: ${p} / запрос.",
        "ja": f"{d['ja']} 料金：${p}/ 回。",
        "vi": f"{d['vi']} Giá: ${p}/ lần.",
    }
    return {
        "description": descs["zhCN"],
        "descriptions": descs,
        "unit": "request",
        "badge": BADGE,
        "suffix": SUFFIX,
        "price_key": PRICE_KEY,
        "description_zh": descs["zhCN"],
        "description_en": descs["en"],
        "badge_zh": BADGE["zhCN"],
        "badge_en": BADGE["en"],
        "suffix_zh": SUFFIX["zhCN"],
        "suffix_en": SUFFIX["en"],
        "price_key_zh": PRICE_KEY["zhCN"],
        "price_key_en": PRICE_KEY["en"],
    }


def main() -> None:
    for rel in (
        "config/marketplace-model-copy.json",
        "services/creem-moderation-proxy/marketplace-model-copy.json",
    ):
        path = ROOT / rel
        data = json.loads(path.read_text(encoding="utf-8"))
        for mid, meta in MODELS.items():
            data[mid] = build_entry(meta)
            print(mid, price_str(meta["cost_cny"]), data[mid]["description"][-24:])
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


if __name__ == "__main__":
    main()
