# -*- coding: utf-8 -*-
"""Rework zex gpt-image marketplace entries: same model names, GPT-Image-HD group.

Removes the earlier renamed-suffix entries and adds entries only for the four
model names that are genuinely new to the catalog; shared names keep their
existing entries (served additionally under the GPT-Image-HD group).
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COPY = ROOT / "config" / "marketplace-model-copy.json"

RENAMED = ["gpt-image-2-1K", "gpt-image-2.5-1K", "gpt-image-2.5-flare-hd", "gpt-image-2.5-sunburst-hd"]

TIERS = {
    "gpt-image-2-2K": {
        "price": "0.15",
        "zh": "GPT Image 2 高清 2K 档（GPT-Image-HD 分组）", "en": "GPT Image 2 high-resolution 2K tier (GPT-Image-HD group)",
        "fr": "GPT Image 2 niveau 2K haute résolution (groupe GPT-Image-HD)", "ru": "GPT Image 2 уровень 2K (группа GPT-Image-HD)",
        "ja": "GPT Image 2 高解像度 2K 档（GPT-Image-HD グループ）", "vi": "GPT Image 2 cấp 2K (nhóm GPT-Image-HD)", "zhTW": "GPT Image 2 高畫質 2K 檔（GPT-Image-HD 分組）",
    },
    "gpt-image-2-4K": {
        "price": "0.15",
        "zh": "GPT Image 2 超高清 4K 档（GPT-Image-HD 分组）", "en": "GPT Image 2 ultra-high-resolution 4K tier (GPT-Image-HD group)",
        "fr": "GPT Image 2 niveau 4K ultra-haute résolution (groupe GPT-Image-HD)", "ru": "GPT Image 2 уровень 4K (группа GPT-Image-HD)",
        "ja": "GPT Image 2 超高解像度 4K 档（GPT-Image-HD グループ）", "vi": "GPT Image 2 cấp 4K (nhóm GPT-Image-HD)", "zhTW": "GPT Image 2 超高畫質 4K 檔（GPT-Image-HD 分組）",
    },
    "gpt-image-2.5-flare-vip": {
        "price": "0.27",
        "zh": "GPT Image 2.5 Flare VIP 通道（GPT-Image-HD 分组），支持 1K/2K/4K 分辨率", "en": "GPT Image 2.5 Flare VIP lane (GPT-Image-HD group) with 1K/2K/4K resolution",
        "fr": "GPT Image 2.5 Flare voie VIP (groupe GPT-Image-HD), résolution 1K/2K/4K", "ru": "GPT Image 2.5 Flare VIP-канал (группа GPT-Image-HD), разрешение 1K/2K/4K",
        "ja": "GPT Image 2.5 Flare VIP チャネル（GPT-Image-HD グループ）、1K/2K/4K 対応", "vi": "GPT Image 2.5 Flare kênh VIP (nhóm GPT-Image-HD), độ phân giải 1K/2K/4K", "zhTW": "GPT Image 2.5 Flare VIP 通道（GPT-Image-HD 分組），支援 1K/2K/4K",
    },
    "gpt-image-2.5-sunburst-vip": {
        "price": "0.375",
        "zh": "GPT Image 2.5 Sunburst VIP 通道（GPT-Image-HD 分组），支持 1K/2K/4K 分辨率", "en": "GPT Image 2.5 Sunburst VIP lane (GPT-Image-HD group) with 1K/2K/4K resolution",
        "fr": "GPT Image 2.5 Sunburst voie VIP (groupe GPT-Image-HD), résolution 1K/2K/4K", "ru": "GPT Image 2.5 Sunburst VIP-канал (группа GPT-Image-HD), разрешение 1K/2K/4K",
        "ja": "GPT Image 2.5 Sunburst VIP チャネル（GPT-Image-HD グループ）、1K/2K/4K 対応", "vi": "GPT Image 2.5 Sunburst kênh VIP (nhóm GPT-Image-HD), độ phân giải 1K/2K/4K", "zhTW": "GPT Image 2.5 Sunburst VIP 通道（GPT-Image-HD 分組），支援 1K/2K/4K",
    },
}

PROTO = {
    "zhCN": "文生图与图生图（最多 8 张参考图），经 POST /v1/videos 异步任务调用，轮询 GET /v1/videos/{task_id} 取图。计费：${p}/次。",
    "zhTW": "文生圖與圖生圖（最多 8 張參考圖），經 POST /v1/videos 非同步任務呼叫，輪詢 GET /v1/videos/{task_id} 取圖。計費：${p}/次。",
    "en": "Text-to-image and image-to-image (up to 8 reference images) via the async POST /v1/videos task API; poll GET /v1/videos/{task_id} for the result. Pricing: ${p} / request.",
    "fr": "Texte-to-image et image-to-image (jusqu'à 8 images de référence) via l'API asynchrone POST /v1/videos ; résultat via GET /v1/videos/{task_id}. Tarif : ${p} / requête.",
    "ru": "Генерация из текста и из изображения (до 8 референсов) через асинхронный API POST /v1/videos; результат — GET /v1/videos/{task_id}. Тариф: ${p} / запрос.",
    "ja": "テキストから画像・画像から画像（参照画像は最大 8 枚）を POST /v1/videos の非同期タスク API で生成し、GET /v1/videos/{task_id} で結果を取得します。料金：${p} / 回。",
    "vi": "Tạo ảnh từ văn bản và từ ảnh tham chiếu (tối đa 8 ảnh) qua API tác vụ bất đồng bộ POST /v1/videos; lấy kết quả bằng GET /v1/videos/{task_id}. Giá: ${p} / lần.",
}

data = json.loads(COPY.read_text(encoding="utf-8"))
for name in RENAMED:
    data.pop(name, None)

LANGS = ["zhCN", "zhTW", "en", "fr", "ru", "ja", "vi"]
for name, spec in TIERS.items():
    entry = {"descriptions": {}, "unit": "request"}
    for lang in LANGS:
        proto = PROTO[lang].replace("{p}", spec["price"])
        tier = spec["zh"] if lang == "zhCN" else spec[lang]
        entry["descriptions"][lang] = f"{tier}。{proto}" if lang in ("zhCN", "zhTW") else f"{tier}. {proto}"
    entry["description"] = entry["descriptions"]["zhCN"]
    entry["badge"] = {
        "zhCN": "按次计费", "zhTW": "按次計費", "en": "Pay per request",
        "fr": "À la requête", "ru": "По запросам", "ja": "リクエスト課金", "vi": "Theo yêu cầu",
    }
    entry["suffix"] = {
        "zhCN": "/次", "zhTW": "/次", "en": "/ request", "fr": "/ requête",
        "ru": "/ запрос", "ja": "/ 回", "vi": "/ lần",
    }
    entry["price_key"] = {
        "zhCN": "价格", "zhTW": "價格", "en": "Price", "fr": "Tarif",
        "ru": "Тариф", "ja": "料金", "vi": "Giá",
    }
    entry["description_zh"] = entry["descriptions"]["zhCN"]
    entry["description_en"] = entry["descriptions"]["en"]
    entry["badge_zh"] = entry["badge"]["zhCN"]
    entry["badge_en"] = entry["badge"]["en"]
    entry["suffix_zh"] = entry["suffix"]["zhCN"]
    entry["suffix_en"] = entry["suffix"]["en"]
    entry["price_key_zh"] = entry["price_key"]["zhCN"]
    entry["price_key_en"] = entry["price_key"]["en"]
    data[name] = entry

COPY.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
shutil.copyfile(COPY, ROOT / "services" / "creem-moderation-proxy" / "marketplace-model-copy.json")
print("MARKETPLACE_COPY_REWORKED", len(TIERS))
