# -*- coding: utf-8 -*-
"""Rewrite public Clef copy in OpenRouter style: no internal settlement details."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DESC = {
    "zhCN": "Cloudflare Clef：基于 Qwen3.8-27B 微调的开源 27B 多模态决策模型。给定文本或图像 state 与类型化问题，单次前向返回带校准概率的 choice 选择或 noul 判断，不生成自由文本。通过 POST /v1/decisions 调用，支持文本与最多 4 张内嵌图像（base64 data URL）。",
    "zhTW": "Cloudflare Clef：基於 Qwen3.8-27B 微調的開源 27B 多模態決策模型。給定文字或圖像 state 與類型化問題，單次前向回傳帶校準機率的 choice 選擇或 noul 判斷，不產生自由文字。透過 POST /v1/decisions 呼叫，支援文字與最多 4 張內嵌圖像（base64 data URL）。",
    "en": "Cloudflare Clef is an open-source 27B multimodal decision model fine-tuned from Qwen3.8-27B. Given a text or image state and typed questions, a single forward pass returns a choice with calibrated probabilities or a noul verdict — no free-form text generation. Call it via POST /v1/decisions with text plus up to 4 inline images (base64 data URLs).",
    "fr": "Cloudflare Clef est un modèle de décision multimodal open source de 27B, affiné à partir de Qwen3.8-27B. À partir d’un state texte ou image et de questions typées, une seule passe renvoie un choix avec probabilités calibrées ou un verdict noul — sans génération de texte libre. Appel via POST /v1/decisions avec du texte et jusqu’à 4 images intégrées (data URL base64).",
    "ru": "Cloudflare Clef — открытая мультимодальная модель принятия решений 27B, дообученная на Qwen3.8-27B. По текстовому или графическому state и типизированным вопросам один прямой проход возвращает выбор с калиброванными вероятностями или вердикт noul — без генерации свободного текста. Вызов через POST /v1/decisions с текстом и до 4 встроенных изображений (base64 data URL).",
    "ja": "Cloudflare Clef は Qwen3.8-27B を微調整したオープンソースの 27B マルチモーダル意思決定モデルです。テキストまたは画像の state と型付き questions を与えると、1 回の順伝播でキャリブレーション済みの確率付き choice または noul 判定を返し、自由テキストは生成しません。POST /v1/decisions で呼び出し、テキストと最大 4 枚のインライン画像（base64 data URL）に対応します。",
    "vi": "Cloudflare Clef là mô hình quyết định đa phương thức mã nguồn mở 27B, tinh chỉnh từ Qwen3.8-27B. Với state văn bản hoặc hình ảnh và các câu hỏi có kiểu, một lượt truyền xuôi trả về lựa chọn kèm xác suất đã hiệu chỉnh hoặc phán quyết noul — không sinh văn bản tự do. Gọi qua POST /v1/decisions với văn bản và tối đa 4 ảnh nhúng (base64 data URL).",
}

copy_path = ROOT / "config" / "marketplace-model-copy.json"
data = json.loads(copy_path.read_text(encoding="utf-8"))
entry = data["cloudflare/clef"]
entry["description"] = DESC["zhCN"]
entry["descriptions"] = dict(DESC)
entry["description_zh"] = DESC["zhCN"]
entry["description_en"] = DESC["en"]
text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
copy_path.write_text(text, encoding="utf-8")
shutil.copyfile(copy_path, ROOT / "services" / "creem-moderation-proxy" / "marketplace-model-copy.json")

seo_path = ROOT / "config" / "seo" / "batch2-models.json"
seo = json.loads(seo_path.read_text(encoding="utf-8"))
model = next(m for m in seo["models"] if m["id"] == "cloudflare-clef")
model["priceLabel"] = "From $0.063 input / $0 output per 1M tokens"
pricing = next(s for s in model["guideSections"] if s["heading"] == "Starting price and actual settlement")
pricing["heading"] = "Pricing"
pricing["paragraphs"] = [
    "Input starts at $0.063 per 1M tokens and output is $0. Each request is billed for its actual usage, and the response’s usage.cost is the final charge in USD. Confirm current prices in Model Square before production traffic.",
]
charge = next(s for s in model["guideSections"] if s["heading"] == "Read the final charge from usage.cost")
charge["paragraphs"][0] = (
    "The response usage.cost is the final KeyoAPI charge in USD — use it as returned; no further conversion is needed. "
    "Wallet deductions follow the service’s quota precision; output_tokens is 0 for this decision protocol."
)
faq = next(f for f in model["faqs"] if f["q"] == "Is $0.063/M the fixed input price?")
faq["a"] = (
    "No. It is the starting rate. Output is $0, and usage.cost returns the final request charge. "
    "Use the returned usage.cost as the actual charge; no further conversion is needed."
)
seo_path.write_text(json.dumps(seo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

for path in (copy_path, ROOT / "services" / "creem-moderation-proxy" / "marketplace-model-copy.json", seo_path):
    assert "×1.5" not in path.read_text(encoding="utf-8")
    assert "markup" not in path.read_text(encoding="utf-8")
print("COPY_REWRITTEN")
