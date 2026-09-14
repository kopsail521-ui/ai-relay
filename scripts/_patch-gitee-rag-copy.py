# -*- coding: utf-8 -*-
"""Patch marketplace copy + __tags__.rag for Gitee free/RAG models."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FX = 7.3
MARKUP = 5

TAG_RAG = {
    "zhCN": "RAG",
    "zhTW": "RAG",
    "en": "RAG",
    "fr": "RAG",
    "ru": "RAG",
    "ja": "RAG",
    "vi": "RAG",
}

BADGE_TOKEN = {
    "zhCN": "按 Token 计费",
    "zhTW": "按 Token 計費",
    "en": "Token-based",
    "fr": "Token-based",
    "ru": "Token-based",
    "ja": "Token 課金",
    "vi": "Token-based",
}
BADGE_FREE = {
    "zhCN": "按次计费",
    "zhTW": "按次計費",
    "en": "Per Request",
    "fr": "Par requête",
    "ru": "За запрос",
    "ja": "リクエスト課金",
    "vi": "Theo lần gọi",
}
EMPTY = {k: "" for k in BADGE_TOKEN}
SUFFIX_FREE = {
    "zhCN": "/次",
    "zhTW": "/次",
    "en": "/ request",
    "fr": "/ requête",
    "ru": "/ запрос",
    "ja": "/ 回",
    "vi": "/ lần",
}
PRICE_FREE = {
    "zhCN": "每次请求",
    "zhTW": "每次請求",
    "en": "Per request",
    "fr": "Par requête",
    "ru": "За запрос",
    "ja": "リクエストごと",
    "vi": "Mỗi lần gọi",
}

FREE = {
    "Atria-dawn-v2": {
        "zhCN": "Atria Dawn V2：科研向智能体对话模型（免费额度）。",
        "zhTW": "Atria Dawn V2：科研向智能體對話模型（免費額度）。",
        "en": "Atria Dawn V2 research agent chat (free tier).",
        "fr": "Atria Dawn V2 — chat agentic recherche (gratuit).",
        "ru": "Atria Dawn V2 — исследовательский агентный чат (бесплатно).",
        "ja": "Atria Dawn V2：研究向けエージェント対話（無料）。",
        "vi": "Atria Dawn V2 — chat agent nghiên cứu (miễn phí).",
    },
    "DeepSeek-Prover-V2-7B": {
        "zhCN": "DeepSeek Prover V2 7B：Lean 4 形式化定理证明（免费额度）。",
        "zhTW": "DeepSeek Prover V2 7B：Lean 4 形式化定理證明（免費額度）。",
        "en": "DeepSeek Prover V2 7B formal theorem proving for Lean 4 (free tier).",
        "fr": "DeepSeek Prover V2 7B — preuve formelle Lean 4 (gratuit).",
        "ru": "DeepSeek Prover V2 7B — формальные доказательства Lean 4 (бесплатно).",
        "ja": "DeepSeek Prover V2 7B：Lean 4 形式証明（無料）。",
        "vi": "DeepSeek Prover V2 7B — chứng minh Lean 4 (miễn phí).",
    },
}

RAG = {
    "WeMM-Embedding-9B": (
        0.9,
        {
            "zhCN": "WeMM Embedding 9B：多模态向量化，适用于跨模态检索与 RAG。",
            "zhTW": "WeMM Embedding 9B：多模態向量化，適用於跨模態檢索與 RAG。",
            "en": "WeMM Embedding 9B multimodal vectors for retrieval and RAG.",
            "fr": "WeMM Embedding 9B — vecteurs multimodaux pour RAG.",
            "ru": "WeMM Embedding 9B — мультимодальные эмбеддинги для RAG.",
            "ja": "WeMM Embedding 9B：マルチモーダル埋め込み（RAG向け）。",
            "vi": "WeMM Embedding 9B — embedding đa phương thức cho RAG.",
        },
    ),
    "WeMM-Embedding-4B": (
        0.8,
        {
            "zhCN": "WeMM Embedding 4B：多模态向量化，适用于跨模态检索与 RAG。",
            "zhTW": "WeMM Embedding 4B：多模態向量化，適用於跨模態檢索與 RAG。",
            "en": "WeMM Embedding 4B multimodal vectors for retrieval and RAG.",
            "fr": "WeMM Embedding 4B — vecteurs multimodaux pour RAG.",
            "ru": "WeMM Embedding 4B — мультимодальные эмбеддинги для RAG.",
            "ja": "WeMM Embedding 4B：マルチモーダル埋め込み（RAG向け）。",
            "vi": "WeMM Embedding 4B — embedding đa phương thức cho RAG.",
        },
    ),
    "WeMM-Embedding-2B": (
        0.7,
        {
            "zhCN": "WeMM Embedding 2B：轻量多模态向量化，适用于检索与 RAG。",
            "zhTW": "WeMM Embedding 2B：輕量多模態向量化，適用於檢索與 RAG。",
            "en": "WeMM Embedding 2B lightweight multimodal vectors for RAG.",
            "fr": "WeMM Embedding 2B — vecteurs légers pour RAG.",
            "ru": "WeMM Embedding 2B — лёгкие эмбеддинги для RAG.",
            "ja": "WeMM Embedding 2B：軽量マルチモーダル埋め込み。",
            "vi": "WeMM Embedding 2B — embedding nhẹ cho RAG.",
        },
    ),
    "Qwen3-VL-Reranker-2B": (
        0.09,
        {
            "zhCN": "Qwen3-VL Reranker 2B：多模态重排序，提升检索相关性。",
            "zhTW": "Qwen3-VL Reranker 2B：多模態重排序，提升檢索相關性。",
            "en": "Qwen3-VL Reranker 2B multimodal reranking for better retrieval.",
            "fr": "Qwen3-VL Reranker 2B — rerank multimodal.",
            "ru": "Qwen3-VL Reranker 2B — мультимодальный rerank.",
            "ja": "Qwen3-VL Reranker 2B：マルチモーダル再ランキング。",
            "vi": "Qwen3-VL Reranker 2B — rerank đa phương thức.",
        },
    ),
    "Qwen3-VL-Reranker-8B": (
        0.35,
        {
            "zhCN": "Qwen3-VL Reranker 8B：高精度多模态重排序。",
            "zhTW": "Qwen3-VL Reranker 8B：高精度多模態重排序。",
            "en": "Qwen3-VL Reranker 8B high-precision multimodal reranking.",
            "fr": "Qwen3-VL Reranker 8B — rerank précis.",
            "ru": "Qwen3-VL Reranker 8B — точный multimodal rerank.",
            "ja": "Qwen3-VL Reranker 8B：高精度再ランキング。",
            "vi": "Qwen3-VL Reranker 8B — rerank độ chính xác cao.",
        },
    ),
    "Qwen3-VL-Embedding-8B": (
        0.01,
        {
            "zhCN": "Qwen3-VL Embedding 8B：多模态向量化，适用于跨模态检索与 RAG。",
            "zhTW": "Qwen3-VL Embedding 8B：多模態向量化，適用於跨模態檢索與 RAG。",
            "en": "Qwen3-VL Embedding 8B multimodal vectors for retrieval and RAG.",
            "fr": "Qwen3-VL Embedding 8B — vecteurs multimodaux pour RAG.",
            "ru": "Qwen3-VL Embedding 8B — эмбеддинги для RAG.",
            "ja": "Qwen3-VL Embedding 8B：マルチモーダル埋め込み。",
            "vi": "Qwen3-VL Embedding 8B — embedding đa phương thức cho RAG.",
        },
    ),
}


def free_entry(descs):
    return {
        "description": descs["zhCN"] + " 计费：$0/次。",
        "descriptions": {
            "zhCN": descs["zhCN"] + " 计费：$0/次。",
            "zhTW": descs["zhTW"] + " 計費：$0/次。",
            "en": descs["en"] + " Pricing: $0 / request.",
            "fr": descs["fr"] + " Tarif : $0 / requête.",
            "ru": descs["ru"] + " Тариф: $0 / запрос.",
            "ja": descs["ja"] + " 料金：$0/ 回。",
            "vi": descs["vi"] + " Giá: $0/ lần.",
        },
        "unit": "request",
        "badge": BADGE_FREE,
        "suffix": SUFFIX_FREE,
        "price_key": PRICE_FREE,
        "description_zh": descs["zhCN"] + " 计费：$0/次。",
        "description_en": descs["en"] + " Pricing: $0 / request.",
        "badge_zh": BADGE_FREE["zhCN"],
        "badge_en": BADGE_FREE["en"],
        "suffix_zh": SUFFIX_FREE["zhCN"],
        "suffix_en": SUFFIX_FREE["en"],
        "price_key_zh": PRICE_FREE["zhCN"],
        "price_key_en": PRICE_FREE["en"],
    }


def rag_entry(cost_cny, descs):
    sell = (cost_cny * MARKUP) / FX
    p = f"{sell:.4f}".rstrip("0").rstrip(".")
    descs2 = {
        "zhCN": f"{descs['zhCN']} 约 ${p} / 百万 tokens。",
        "zhTW": f"{descs['zhTW']} 約 ${p} / 百萬 tokens。",
        "en": f"{descs['en']} About ${p} per 1M tokens.",
        "fr": f"{descs['fr']} Environ ${p} / 1M tokens.",
        "ru": f"{descs['ru']} Около ${p} / 1M токенов.",
        "ja": f"{descs['ja']} 約 ${p} / 100万 tokens。",
        "vi": f"{descs['vi']} Khoảng ${p} / 1M tokens.",
    }
    return {
        "description": descs2["zhCN"],
        "descriptions": descs2,
        "unit": "token",
        "badge": BADGE_TOKEN,
        "suffix": EMPTY,
        "price_key": EMPTY,
        "description_zh": descs2["zhCN"],
        "description_en": descs2["en"],
        "badge_zh": BADGE_TOKEN["zhCN"],
        "badge_en": BADGE_TOKEN["en"],
        "suffix_zh": "",
        "suffix_en": "",
        "price_key_zh": "",
        "price_key_en": "",
    }


def main():
    for rel in (
        "config/marketplace-model-copy.json",
        "services/creem-moderation-proxy/marketplace-model-copy.json",
    ):
        p = ROOT / rel
        data = json.loads(p.read_text(encoding="utf-8"))
        tags = data.setdefault("__tags__", {})
        tags["rag"] = TAG_RAG
        tags["RAG"] = TAG_RAG
        for mid, d in FREE.items():
            data[mid] = free_entry(d)
        for mid, (cny, d) in RAG.items():
            data[mid] = rag_entry(cny, d)
            print(mid, (cny * MARKUP) / FX)
        p.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print("ok", rel)


if __name__ == "__main__":
    main()
