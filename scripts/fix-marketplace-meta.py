#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix New API marketplace: one tag + original vendor + logo (no 模力方舟)."""
import json
import os
import sqlite3
import sys
import time

EP = {
    "c": json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":")),
    "i": json.dumps(
        {"image-generation": "/v1/images/generations"}, separators=(",", ":")
    ),
    "p": json.dumps(
        {
            "image-processing": {
                "path": "/v1/images/edits",
                "method": "POST",
            }
        },
        separators=(",", ":"),
    ),
    "seg": json.dumps(
        {
            "image-processing": {
                "path": "/v1/images/segmentation",
                "method": "POST",
            }
        },
        separators=(",", ":"),
    ),
    "a": json.dumps(
        {"openai-audio": {"path": "/v1/audio/transcriptions", "method": "POST"}},
        separators=(",", ":"),
    ),
    "t": json.dumps(
        {"openai-audio": {"path": "/v1/audio/speech", "method": "POST"}},
        separators=(",", ":"),
    ),
    "tg": json.dumps(
        {"openai-audio": "/v1/audio/speech", "gemini": "/v1/audio/speech"}, separators=(",", ":")
    ),
    "m": json.dumps(
        {"moderation": {"path": "/v1/moderations", "method": "POST"}},
        separators=(",", ":"),
    ),
    "d": json.dumps(
        {"openai": {"path": "/v1/async/documents/parse", "method": "POST"}},
        separators=(",", ":"),
    ),
    "x": json.dumps(
        {
            "openai-video": {
                "path": "/v1/async/videos/audio-video-to-video",
                "method": "POST",
            }
        },
        separators=(",", ":"),
    ),
    "n": json.dumps(
        {
            "openai-video": {
                "path": "/v1/async/videos/image-to-video",
                "method": "POST",
            }
        },
        separators=(",", ":"),
    ),
    "vg": json.dumps(
        {"openai-video": "/v1/videos/generations"}, separators=(",", ":")
    ),
    "emb": json.dumps(
        {"embeddings": "/v1/embeddings"}, separators=(",", ":")
    ),
    "rerank": json.dumps(
        {"jina-rerank": "/v1/rerank"}, separators=(",", ":")
    ),
    "suno": json.dumps(
        {"suno": "/v1/audio/music"}, separators=(",", ":")
    ),
}

# vendor_name -> lobehub icon
VENDOR_ICONS = {
    "其他": "Custom",
    "OpenAI": "OpenAI",
    "Google": "Gemini.Color",
    "Anthropic": "Claude.Color",
    "DeepSeek": "DeepSeek.Color",
    "xAI": "XAI",
    "Moonshot": "Moonshot",
    "MiniMax": "Minimax.Color",
    "智谱": "Zhipu.Color",
    "阿里巴巴": "Qwen.Color",
    "Meta": "Meta.Color",
    "NVIDIA": "Nvidia.Color",
    "Mistral": "Mistral.Color",
    "Poolside": "Custom",
    "InclusionAI": "Custom",
    "Dots": "Custom",
    "腾讯": "Tencent.Color",
    "百度": "Baidu.Color",
    "BRIA AI": "BriaAI.Color",
    "哔哩哔哩": "Bilibili.Color",
    "阶跃星辰": "Stepfun.Color",
    "字节跳动": "Doubao.Color",
    "Black Forest Labs": "Flux",
}

# model -> (vendor, icon, tag, endpoint_key)
RULES = {
    # 图像处理
    "VajraV1": ("其他", "Custom", "图像处理", "seg"),
    "sam3": ("Meta", "Meta.Color", "图像处理", "seg"),
    "AnimeSharp": ("其他", "Custom", "图像处理", "p"),
    "Real-ESRGAN": ("腾讯", "Tencent.Color", "图像处理", "p"),
    "UVDoc": ("其他", "Custom", "图像处理", "p"),
    "RMBG-2.0": ("腾讯", "Tencent.Color", "图像处理", "p"),
    # OCR
    "MinerU2.5-Pro": ("其他", "Custom", "OCR", "d"),
    "Unlimited-OCR": ("百度", "Baidu.Color", "OCR", "c"),
    # 数字人
    "Duix-Avatar": ("其他", "Custom", "数字人", "x"),
    "InfiniteTalk": ("其他", "Custom", "数字人", "n"),
    # 语音识别
    "MOSS-Audio-8B-Thinking": ("其他", "Custom", "语音识别", "a"),
    "Fun-ASR-Nano-2512": ("阿里巴巴", "Qwen.Color", "语音识别", "a"),
    "GLM-ASR": ("智谱", "Zhipu.Color", "语音识别", "a"),
    "keyo-asr": ("其他", "Custom", "语音识别", "a"),
    "SenseVoiceSmall": ("阿里巴巴", "Qwen.Color", "语音识别", "a"),
    "whisper-large-v3": ("OpenAI", "OpenAI", "语音识别", "a"),
    "whisper-large-v3-turbo": ("OpenAI", "OpenAI", "语音识别", "a"),
    # 语音合成
    "Qwen3-TTS": ("阿里巴巴", "Qwen.Color", "语音合成", "t"),
    "CosyVoice3": ("阿里巴巴", "Qwen.Color", "语音合成", "t"),
    "GLM-TTS": ("智谱", "Zhipu.Color", "语音合成", "t"),
    "IndexTTS-2": ("哔哩哔哩", "Bilibili.Color", "语音合成", "t"),
    "Step-Audio-TTS-3B": ("阶跃星辰", "Stepfun.Color", "语音合成", "t"),
    "Spark-TTS-0.5B": ("其他", "Custom", "语音合成", "t"),
    "keyo-voice-clone": ("其他", "Custom", "语音合成", "t"),
    "keyo-tts": ("其他", "Custom", "语音合成", "t"),
    "eleven-v4": ("其他", "Custom", "语音合成", "t"),
    "eleven-v4-turbo": ("其他", "Custom", "语音合成", "t"),
    "gemini-3.8-flash-tts": ("Google", "Gemini.Color", "语音合成", "tg"),
    "gemini-3.1-flash-tts-preview": ("Google", "Gemini.Color", "语音合成", "tg"),
    # 内容风控
    "nonescape-v0": ("其他", "Custom", "内容风控", "m"),
    "Security-semantic-filtering": ("其他", "Custom", "内容风控", "m"),
    "nsfw-classifier": ("其他", "Custom", "内容风控", "m"),
    "keyo-text-moderation": ("其他", "Custom", "内容风控", "m"),
    # 音乐
    "suno_music_open": ("其他", "Custom", "音乐", "suno"),
    "keyo-song": ("其他", "Custom", "音乐", "suno"),
    # 嵌入模型
    "gemini-embedding-2-preview": ("Google", "Gemini.Color", "嵌入模型", "emb"),
    "WeMM-Embedding-9B": ("其他", "Custom", "嵌入模型", "emb"),
    "WeMM-Embedding-4B": ("其他", "Custom", "嵌入模型", "emb"),
    "WeMM-Embedding-2B": ("其他", "Custom", "嵌入模型", "emb"),
    # 重排序
    "Qwen3-VL-Reranker-2B": ("阿里巴巴", "Qwen.Color", "嵌入模型", "rerank"),
    "Qwen3-VL-Reranker-8B": ("阿里巴巴", "Qwen.Color", "嵌入模型", "rerank"),
    # 决策模型
    "Bespoke-Nimble-9B": ("其他", "Custom", "决策模型", "c"),
    "DiffusionGemma-26B-A4B-it-Jev": ("Google", "Gemini.Color", "决策模型", "c"),
    "SemIf-OpenJev-4B": ("其他", "Custom", "决策模型", "c"),
    "jev-1.13.0": ("其他", "Custom", "决策模型", "c"),
    "laya-multilingual": ("其他", "Custom", "决策模型", "c"),
    "cloudflare/clef": ("其他", "Custom", "决策模型", "c"),
    # 大语言模型
    "gemma-4-26B-A4B-it": ("Google", "Gemini.Color", "大语言模型", "c"),
    "Atria-dawn-v2": ("其他", "Custom", "大语言模型", "c"),
    "Atria-dawn-v2:free": ("其他", "Custom", "大语言模型", "c"),
    "DeepSeek-Prover-V2-7B": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    "DeepSeek-Prover-V2-7B:free": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    "keyo-flash:free": ("其他", "Custom", "大语言模型", "c"),
    "keyo-flash2:free": ("其他", "Custom", "大语言模型", "c"),
    # 图片生成
    "gpt-image-2": ("OpenAI", "OpenAI", "图片", "i"),
    "gpt-image-2-vip": ("OpenAI", "OpenAI", "图片", "i"),
    "gpt-image-2.5": ("OpenAI", "OpenAI", "图片", "i"),
    "gpt-image-2.5-flare": ("OpenAI", "OpenAI", "图片", "i"),
    "gpt-image-2.5-sunburst": ("OpenAI", "OpenAI", "图片", "i"),
    "gpt-image-2.5-flare-c": ("OpenAI", "OpenAI", "图片", "i"),
    "gpt-image-2.5-sunburst-c": ("OpenAI", "OpenAI", "图片", "i"),
    "nano-banana-pro": ("Google", "Gemini.Color", "图片", "i"),
    "nano-banana-2": ("Google", "Gemini.Color", "图片", "i"),
    "nano-banana-2.1": ("Google", "Gemini.Color", "图片", "i"),
    "grok-image-2.0": ("xAI", "XAI", "图片", "i"),
    # OpenAI 对话
    "gpt-5.6-sol": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "gpt-5.6-terra": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "gpt-5.6-luna": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "gpt-6-sol": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "gpt-6.1-sol": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "gpt-6-luna": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "gpt-6-astra": ("OpenAI", "OpenAI", "大语言模型", "c"),
    # Anthropic 对话
    "claude-opus-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-sonnet-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-haiku-5-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-sonnet-5-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-opus-5-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-fable-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-fable-5-1": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    # Google 对话
    "gemini-3.7-flash": ("Google", "Gemini.Color", "大语言模型", "c"),
    "gemini-3.8-flash": ("Google", "Gemini.Color", "大语言模型", "c"),
    "gemini-4-argon": ("Google", "Gemini.Color", "大语言模型", "c"),
    "gemini-4-barium": ("Google", "Gemini.Color", "大语言模型", "c"),
    # DeepSeek 对话
    "deepseek-v4-pro-0813": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    "deepseek-v4-flash": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    "deepseek-v4.1-flash": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    "deepseek-v4-pro": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    "deepseek-v4-flash-0731": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    # xAI 对话
    "grok-4.6": ("xAI", "XAI", "大语言模型", "c"),
    "grok-4.7": ("xAI", "XAI", "大语言模型", "c"),
    # 中文厂商对话
    "kimi-k3": ("Moonshot", "Moonshot", "大语言模型", "c"),
    "kimi-k2.7-code": ("Moonshot", "Moonshot", "大语言模型", "c"),
    "MiniMax-M3": ("MiniMax", "Minimax.Color", "大语言模型", "c"),
    "minimax-m3": ("MiniMax", "Minimax.Color", "大语言模型", "c"),
    "qwen3.8-max-0902": ("阿里巴巴", "Qwen.Color", "大语言模型", "c"),
    "qwen3.8-flash": ("阿里巴巴", "Qwen.Color", "大语言模型", "c"),
    "glm-5.3": ("智谱", "Zhipu.Color", "大语言模型", "c"),
    "glm-5.3-flash": ("智谱", "Zhipu.Color", "大语言模型", "c"),
    "glm-5.2": ("智谱", "Zhipu.Color", "大语言模型", "c"),
    "mimo-v2.6-pro": ("小米", "Custom", "大语言模型", "c"),
    "mimo-v2.6-flash": ("小米", "Custom", "大语言模型", "c"),
    "hy4-preview": ("阶跃星辰", "Stepfun.Color", "大语言模型", "c"),
    # 视频生成
    "MiniMax-H3": ("MiniMax", "Minimax.Color", "视频模型", "vg"),
    "wan3.0-video": ("阿里巴巴", "Qwen.Color", "视频模型", "vg"),
    "flux-3-video": ("Black Forest Labs", "Flux", "视频模型", "vg"),
    "gemini-omni-1.1-flash": ("Google", "Gemini.Color", "视频模型", "vg"),
    "gemini-omni-1.1-flash-ext": ("Google", "Gemini.Color", "视频模型", "vg"),
    "veo_3_1-components": ("Google", "Gemini.Color", "视频模型", "vg"),
    "grok-video-1.5": ("xAI", "XAI", "视频模型", "vg"),
    "agnes-video-2.5": ("其他", "Custom", "视频模型", "vg"),
    "seedance-2.0-1080p": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.0-1080p-fast": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.0-1080p-mini": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.5-1080p": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.0-720p": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.0-720p-fast": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.0-720p-mini": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.5-720p": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.5": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    "seedance-2.0": ("字节跳动", "Doubao.Color", "视频模型", "vg"),
    # 视频处理
    "video-enhance-pro": ("其他", "Custom", "视频处理", "vg"),
    "subtitle-erase-pro": ("其他", "Custom", "视频处理", "vg"),
    "keyo-super-resolution-1080p": ("其他", "Custom", "视频处理", "vg"),
    "keyo-super-resolution-2k": ("其他", "Custom", "视频处理", "vg"),
    "keyo-super-resolution-4k": ("其他", "Custom", "视频处理", "vg"),
    "keyo-video-subtitle-removal": ("其他", "Custom", "视频处理", "vg"),
}


def infer(name):
    s = name.lower()
    rule = None
    if s.startswith("gpt-") or s.startswith("chatgpt") or s[:2] in ("o1", "o3", "o4"):
        rule = ("OpenAI", "OpenAI", "大语言模型", "c")
    elif "claude" in s:
        rule = ("Anthropic", "Claude.Color", "大语言模型", "c")
    elif "gemini" in s or s.startswith("gemma"):
        rule = ("Google", "Gemini.Color", "大语言模型", "c")
    elif "deepseek" in s:
        rule = ("DeepSeek", "DeepSeek.Color", "大语言模型", "c")
    elif "grok" in s:
        rule = ("xAI", "XAI", "大语言模型", "c")
    elif "kimi" in s or "moonshot" in s:
        rule = ("Moonshot", "Moonshot", "大语言模型", "c")
    elif "glm" in s or "zhipu" in s:
        rule = ("智谱", "Zhipu.Color", "大语言模型", "c")
    elif "minimax" in s:
        rule = ("MiniMax", "Minimax.Color", "大语言模型", "c")
    elif "qwen" in s:
        rule = ("阿里巴巴", "Qwen.Color", "大语言模型", "c")
    elif "nemotron" in s or "nvidia" in s:
        rule = ("NVIDIA", "Nvidia.Color", "大语言模型", "c")
    elif "mistral" in s:
        rule = ("Mistral", "Mistral.Color", "大语言模型", "c")
    elif s.startswith("step-"):
        rule = ("阶跃星辰", "Stepfun.Color", "大语言模型", "c")
    elif s.startswith("muse-"):
        rule = ("Meta", "Meta.Color", "大语言模型", "c")
    elif "laguna" in s:
        rule = ("Poolside", "Custom", "大语言模型", "c")
    elif s.startswith("ling-"):
        rule = ("InclusionAI", "Custom", "大语言模型", "c")
    elif s.startswith("dots-"):
        rule = ("Dots", "Custom", "大语言模型", "c")
    # :free 赠送金模型不自动加 "免费" 标签
    return rule


def ensure_vendor(cur, vendors, name, icon, now):
    if name in vendors:
        cur.execute(
            "UPDATE vendors SET icon=?, status=1, updated_time=? WHERE id=?",
            (icon or VENDOR_ICONS.get(name, "Custom"), now, vendors[name]),
        )
        return vendors[name]
    cur.execute(
        "INSERT INTO vendors(name,icon,description,status,created_time,updated_time) VALUES(?,?,?,?,?,?)",
        (name, icon or VENDOR_ICONS.get(name, "Custom"), "", 1, now, now),
    )
    vid = cur.lastrowid
    vendors[name] = vid
    return vid


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db_path):
        raise SystemExit("DB not found: " + db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    now = int(time.time())

    cur.execute("SELECT id,name FROM vendors")
    vendors = {name: vid for vid, name in cur.fetchall()}

    for vname, vicon in VENDOR_ICONS.items():
        ensure_vendor(cur, vendors, vname, vicon, now)

    cur.execute("SELECT id,model_name FROM models WHERE deleted_at IS NULL")
    rows = cur.fetchall()

    tag_counts = {}
    logo_updates = []
    updated = 0
    skipped = []

    for mid, mname in rows:
        rule = RULES.get(mname) or infer(mname)
        if rule is None:
            skipped.append(mname)
            continue
        vendor, icon, tag, ek = rule
        vid = ensure_vendor(cur, vendors, vendor, icon, now)
        cur.execute(
            "UPDATE models SET tags=?, vendor_id=?, icon=?, endpoints=?, sync_official=0, updated_time=? WHERE id=?",
            (tag, vid, icon, EP[ek], now, mid),
        )
        tag_counts[tag] = tag_counts.get(tag, 0) + 1
        updated += 1
        if icon and icon != "Custom":
            logo_updates.append(mname + "→" + vendor + "/" + icon)

    cur.execute(
        "SELECT model_name FROM models WHERE deleted_at IS NULL AND tags LIKE '%,%'"
    )
    multi = [r[0] for r in cur.fetchall()]

    cur.execute("SELECT id FROM vendors WHERE name=?", ("模力方舟",))
    row = cur.fetchone()
    if row is not None:
        cur.execute(
            "SELECT COUNT(*) FROM models WHERE deleted_at IS NULL AND vendor_id=?",
            (row[0],),
        )
        if cur.fetchone()[0] == 0:
            cur.execute(
                "UPDATE vendors SET status=0, updated_time=? WHERE id=?",
                (now, row[0]),
            )

    conn.commit()
    conn.close()
    print(
        json.dumps(
            {
                "updated": updated,
                "tagCounts": tag_counts,
                "logoUpdates": logo_updates,
                "multiTag": multi,
                "skipped": skipped,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
