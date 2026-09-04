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
            "image-generation": {
                "path": "/v1/images/upscaling",
                "method": "POST",
            }
        },
        separators=(",", ":"),
    ),
    "v": json.dumps(
        {
            "image-generation": {
                "path": "/v1/images/object-detection",
                "method": "POST",
            }
        },
        separators=(",", ":"),
    ),
    "a": json.dumps(
        {"openai": {"path": "/v1/audio/transcriptions", "method": "POST"}},
        separators=(",", ":"),
    ),
    "t": json.dumps(
        {"openai": {"path": "/v1/audio/speech", "method": "POST"}},
        separators=(",", ":"),
    ),
    "m": json.dumps(
        {"openai": {"path": "/v1/moderations", "method": "POST"}},
        separators=(",", ":"),
    ),
    "d": json.dumps(
        {"openai": {"path": "/v1/async/documents/parse", "method": "POST"}},
        separators=(",", ":"),
    ),
    "x": json.dumps(
        {
            "openai": {
                "path": "/v1/async/videos/audio-video-to-video",
                "method": "POST",
            }
        },
        separators=(",", ":"),
    ),
    "n": json.dumps(
        {
            "openai": {
                "path": "/v1/async/videos/image-to-video",
                "method": "POST",
            }
        },
        separators=(",", ":"),
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
    "腾讯": "Tencent.Color",
    "百度": "Baidu.Color",
    "BRIA AI": "BriaAI.Color",
    "哔哩哔哩": "Bilibili.Color",
    "阶跃星辰": "Stepfun.Color",
}

# model -> (vendor, icon, tag, endpoint_key)
RULES = {
    "VajraV1": ("其他", "Custom", "图像处理", "v"),
    "sam3": ("Meta", "Meta.Color", "图像处理", "v"),
    "AnimeSharp": ("其他", "Custom", "图像处理", "p"),
    "Real-ESRGAN": ("腾讯", "Tencent.Color", "图像处理", "p"),
    "UVDoc": ("其他", "Custom", "图像处理", "p"),
    "RMBG-2.0": ("BRIA AI", "BriaAI.Color", "图像处理", "p"),
    "MinerU2.5-Pro": ("其他", "Custom", "OCR", "d"),
    "Unlimited-OCR": ("百度", "Baidu.Color", "OCR", "c"),
    "Duix-Avatar": ("其他", "Custom", "数字人", "x"),
    "InfiniteTalk": ("其他", "Custom", "数字人", "n"),
    "MOSS-Audio-8B-Thinking": ("其他", "Custom", "语音识别", "a"),
    "Fun-ASR-Nano-2512": ("阿里巴巴", "Qwen.Color", "语音识别", "a"),
    "GLM-ASR": ("智谱", "Zhipu.Color", "语音识别", "a"),
    "whisper-large-v3": ("OpenAI", "OpenAI", "语音识别", "a"),
    "whisper-large-v3-turbo": ("OpenAI", "OpenAI", "语音识别", "a"),
    "Qwen3-TTS": ("阿里巴巴", "Qwen.Color", "语音合成", "t"),
    "CosyVoice3": ("阿里巴巴", "Qwen.Color", "语音合成", "t"),
    "GLM-TTS": ("智谱", "Zhipu.Color", "语音合成", "t"),
    "IndexTTS-2": ("哔哩哔哩", "Bilibili.Color", "语音合成", "t"),
    "Step-Audio-TTS-3B": ("阶跃星辰", "Stepfun.Color", "语音合成", "t"),
    "nonescape-v0": ("其他", "Custom", "内容风控", "m"),
    "moark-text-moderation": ("其他", "Custom", "内容风控", "m"),
    "Security-semantic-filtering": ("其他", "Custom", "内容风控", "m"),
    "nsfw-classifier": ("其他", "Custom", "内容风控", "m"),
    "gemma-4-26B-A4B-it": ("Google", "Gemini.Color", "大语言模型", "c"),
    "gpt-image-2": ("OpenAI", "OpenAI", "图片", "i"),
    "gpt-image-2-vip": ("OpenAI", "OpenAI", "图片", "i"),
    "nano-banana-pro": ("Google", "Gemini.Color", "图片", "i"),
    "nano-banana-2": ("Google", "Gemini.Color", "图片", "i"),
    "gpt-5.6-sol": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "gpt-5.6-terra": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "gpt-5.6-luna": ("OpenAI", "OpenAI", "大语言模型", "c"),
    "claude-opus-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-sonnet-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-fable-5": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "claude-fable-5-1": ("Anthropic", "Claude.Color", "大语言模型", "c"),
    "gemini-3.7-flash": ("Google", "Gemini.Color", "大语言模型", "c"),
    "gemini-3.8-flash": ("Google", "Gemini.Color", "大语言模型", "c"),
    "deepseek-v4-pro-0813": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    "deepseek-v4-flash": ("DeepSeek", "DeepSeek.Color", "大语言模型", "c"),
    "grok-4.6": ("xAI", "XAI", "大语言模型", "c"),
    "kimi-k3": ("Moonshot", "Moonshot", "大语言模型", "c"),
    "MiniMax-M3": ("MiniMax", "Minimax.Color", "大语言模型", "c"),
    "glm-5.3": ("智谱", "Zhipu.Color", "大语言模型", "c"),
}


def infer(name):
    s = name.lower()
    if s.startswith("gpt-") or s.startswith("chatgpt") or s[:2] in ("o1", "o3", "o4"):
        return ("OpenAI", "OpenAI", "大语言模型", "c")
    if "claude" in s:
        return ("Anthropic", "Claude.Color", "大语言模型", "c")
    if "gemini" in s or s.startswith("gemma"):
        return ("Google", "Gemini.Color", "大语言模型", "c")
    if "deepseek" in s:
        return ("DeepSeek", "DeepSeek.Color", "大语言模型", "c")
    if "grok" in s:
        return ("xAI", "XAI", "大语言模型", "c")
    if "kimi" in s or "moonshot" in s:
        return ("Moonshot", "Moonshot", "大语言模型", "c")
    if "glm" in s or "zhipu" in s:
        return ("智谱", "Zhipu.Color", "大语言模型", "c")
    if "minimax" in s:
        return ("MiniMax", "Minimax.Color", "大语言模型", "c")
    if "qwen" in s:
        return ("阿里巴巴", "Qwen.Color", "大语言模型", "c")
    return None


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
