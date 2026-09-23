#!/usr/bin/env python3
"""Heal marketplace vendor_id + tags so left-sidebar filters work.

Maps models to real vendor rows (智谱/DeepSeek/Mistral/NVIDIA/…) instead of
leaving them only discoverable under「全部型号」or mis-bucketed「其他」.
Public vendor names stay model-house brands — never suppliers.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

EP_CHAT = json.dumps({"openai": "/v1/chat/completions"}, separators=(",", ":"))
EP_IMG = json.dumps({"image-generation": "/v1/images/generations"}, separators=(",", ":"))
EP_UPSCALE = json.dumps(
    {"image-generation": {"path": "/v1/images/upscaling", "method": "POST"}},
    separators=(",", ":"),
)
EP_CV = json.dumps(
    {"image-generation": {"path": "/v1/images/object-detection", "method": "POST"}},
    separators=(",", ":"),
)
EP_ASR = json.dumps(
    {"openai": {"path": "/v1/audio/transcriptions", "method": "POST"}},
    separators=(",", ":"),
)
EP_TTS = json.dumps(
    {"openai": {"path": "/v1/audio/speech", "method": "POST"}},
    separators=(",", ":"),
)
EP_MOD = json.dumps(
    {"openai": {"path": "/v1/moderations", "method": "POST"}},
    separators=(",", ":"),
)
EP_DOC = json.dumps(
    {"openai": {"path": "/v1/async/documents/parse", "method": "POST"}},
    separators=(",", ":"),
)
EP_AVATAR = json.dumps(
    {"openai": {"path": "/v1/async/videos/audio-video-to-video", "method": "POST"}},
    separators=(",", ":"),
)
EP_I2V = json.dumps(
    {"openai": {"path": "/v1/async/videos/image-to-video", "method": "POST"}},
    separators=(",", ":"),
)

# vendor_name, icon, tags, endpoints
EXACT = {
    "VajraV1": ("其他", "Custom", "图像处理", EP_CV),
    "sam3": ("Meta", "Meta.Color", "图像处理", EP_CV),
    "AnimeSharp": ("其他", "Custom", "图像处理", EP_UPSCALE),
    "Real-ESRGAN": ("腾讯", "Tencent.Color", "图像处理", EP_UPSCALE),
    "UVDoc": ("其他", "Custom", "图像处理", EP_UPSCALE),
    "RMBG-2.0": ("腾讯", "Tencent.Color", "图像处理", EP_UPSCALE),
    "MinerU2.5-Pro": ("其他", "Custom", "OCR", EP_DOC),
    "Unlimited-OCR": ("百度", "Wenxin.Color", "OCR", EP_CHAT),
    "Duix-Avatar": ("其他", "Custom", "数字人", EP_AVATAR),
    "InfiniteTalk": ("其他", "Custom", "数字人", EP_I2V),
    "MOSS-Audio-8B-Thinking": ("其他", "Custom", "语音识别", EP_ASR),
    "Fun-ASR-Nano-2512": ("阿里巴巴", "Qwen.Color", "语音识别", EP_ASR),
    "GLM-ASR": ("智谱", "Zhipu.Color", "语音识别", EP_ASR),
    "whisper-large-v3": ("OpenAI", "OpenAI", "语音识别", EP_ASR),
    "whisper-large-v3-turbo": ("OpenAI", "OpenAI", "语音识别", EP_ASR),
    "Qwen3-TTS": ("阿里巴巴", "Qwen.Color", "语音合成", EP_TTS),
    "CosyVoice3": ("阿里巴巴", "Qwen.Color", "语音合成", EP_TTS),
    "GLM-TTS": ("智谱", "Zhipu.Color", "语音合成", EP_TTS),
    "IndexTTS-2": ("哔哩哔哩", "Bilibili.Color", "语音合成", EP_TTS),
    "Step-Audio-TTS-3B": ("阶跃星辰", "Stepfun.Color", "语音合成", EP_TTS),
    "nonescape-v0": ("其他", "Custom", "内容风控", EP_MOD),
    "keyo-text-moderation": ("其他", "Custom", "内容风控", EP_MOD),
    "Security-semantic-filtering": ("其他", "Custom", "内容风控", EP_MOD),
    "nsfw-classifier": ("其他", "Custom", "内容风控", EP_MOD),
    "Atria-dawn-v2": ("其他", "Custom", "大语言模型,免费", EP_CHAT),
    "muse-glimmer-30b:free": ("Meta", "Meta.Color", "大语言模型,免费", EP_CHAT),
    "mistral-large-3-675b:free": ("Mistral", "Mistral.Color", "大语言模型,免费", EP_CHAT),
    "laguna-s-2.1:free": ("Poolside", "Custom", "大语言模型,免费", EP_CHAT),
    "ling-3.0-flash-fin:free": ("InclusionAI", "Custom", "大语言模型,免费", EP_CHAT),
    "dots-3-note-preview:free": ("Dots", "Custom", "大语言模型,免费", EP_CHAT),
}


def infer(name: str):
    s = name.lower()
    free = ":free" in s or s.endswith("-free")
    tag_llm = "大语言模型,免费" if free else "大语言模型"

    if s.startswith("gpt-") or s.startswith("chatgpt") or s.startswith("o1") or s.startswith("o3") or s.startswith("o4"):
        return ("OpenAI", "OpenAI", tag_llm, EP_CHAT)
    if "claude" in s:
        return ("Anthropic", "Claude.Color", tag_llm, EP_CHAT)
    if "gemini" in s or s.startswith("gemma"):
        return ("Google", "Gemini.Color", tag_llm, EP_CHAT)
    if "deepseek" in s:
        return ("DeepSeek", "DeepSeek.Color", tag_llm, EP_CHAT)
    if "grok" in s:
        return ("xAI", "XAI", tag_llm, EP_CHAT)
    if "kimi" in s or "moonshot" in s:
        return ("Moonshot", "Moonshot", tag_llm, EP_CHAT)
    if s.startswith("glm") or "zhipu" in s or "chatglm" in s:
        return ("智谱", "Zhipu.Color", tag_llm, EP_CHAT)
    if "minimax" in s:
        return ("MiniMax", "Minimax.Color", tag_llm if "h3" not in s else "视频", EP_CHAT)
    if "qwen" in s or "cosyvoice" in s:
        icon = "Qwen.Color"
        if "tts" in s or "cosyvoice" in s:
            return ("阿里巴巴", icon, "语音合成", EP_TTS)
        if "asr" in s:
            return ("阿里巴巴", icon, "语音识别", EP_ASR)
        return ("阿里巴巴", icon, tag_llm, EP_CHAT)
    if "mistral" in s or s.startswith("mixtral"):
        return ("Mistral", "Mistral.Color", tag_llm, EP_CHAT)
    if "nemotron" in s or s.startswith("nvidia"):
        return ("NVIDIA", "Nvidia.Color", tag_llm, EP_CHAT)
    if "llama" in s or s.startswith("meta-"):
        return ("Meta", "Meta.Color", tag_llm, EP_CHAT)
    if s.startswith("step-") or "stepfun" in s:
        return ("阶跃星辰", "Stepfun.Color", tag_llm, EP_CHAT)
    if "seedance" in s or "doubao" in s:
        return ("字节跳动", "Doubao.Color", "视频", EP_CHAT)
    if "flux" in s:
        return ("Black Forest Labs", "Flux", "图片", EP_IMG)
    if "rmbg" in s or "bria" in s:
        return ("BRIA AI", "BriaAI.Color", "图像处理", EP_UPSCALE)
    if "nano-banana" in s:
        return ("Google", "Gemini.Color", "图片", EP_IMG)
    if "gpt-image" in s:
        return ("OpenAI", "OpenAI", "图片", EP_IMG)
    return None


def cols(cur, table):
    return {r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)}


def ensure_vendor(cur, v_cols, name, icon, now):
    row = cur.execute("SELECT id FROM vendors WHERE name=?", (name,)).fetchone()
    if row:
        if "icon" in v_cols and icon and icon != "Custom":
            cur.execute(
                "UPDATE vendors SET icon=? WHERE id=? AND (icon IS NULL OR icon='' OR icon='Custom')",
                (icon, row[0]),
            )
        if "status" in v_cols:
            cur.execute("UPDATE vendors SET status=1 WHERE id=?", (row[0],))
        return row[0]
    fields = ["name"]
    values = [name]
    if "icon" in v_cols:
        fields.append("icon")
        values.append(icon or "Custom")
    if "status" in v_cols:
        fields.append("status")
        values.append(1)
    if "created_time" in v_cols:
        fields.append("created_time")
        values.append(now)
    if "updated_time" in v_cols:
        fields.append("updated_time")
        values.append(now)
    cur.execute(
        "INSERT INTO vendors(%s) VALUES (%s)"
        % (",".join(fields), ",".join(["?"] * len(fields))),
        values,
    )
    print("vendor_created", name, cur.lastrowid)
    return cur.lastrowid


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
    if not os.path.exists(db):
        raise SystemExit("DB not found: " + db)
    con = sqlite3.connect(db)
    cur = con.cursor()
    now = int(time.time())
    m_cols = cols(cur, "models")
    v_cols = cols(cur, "vendors")

    sql = "SELECT id, model_name, vendor_id, tags FROM models"
    if "deleted_at" in m_cols:
        sql += " WHERE deleted_at IS NULL OR deleted_at=0"
    rows = cur.execute(sql).fetchall()

    updated = 0
    skipped = []
    for mid, name, old_vid, old_tags in rows:
        rule = EXACT.get(name) or infer(name)
        if not rule:
            skipped.append(name)
            continue
        vname, icon, tags, endpoints = rule
        # preserve multi-tag free if already has 免费
        if old_tags and "免费" in str(old_tags) and "免费" not in tags:
            tags = tags + ",免费" if tags else "免费"
        vid = ensure_vendor(cur, v_cols, vname, icon, now)
        sets = ["vendor_id=?", "tags=?"]
        vals = [vid, tags]
        if "icon" in m_cols:
            sets.append("icon=?")
            vals.append(icon)
        if "endpoints" in m_cols:
            sets.append("endpoints=?")
            vals.append(endpoints)
        if "status" in m_cols:
            sets.append("status=1")
        if "updated_time" in m_cols:
            sets.append("updated_time=?")
            vals.append(now)
        vals.append(mid)
        cur.execute("UPDATE models SET %s WHERE id=?" % ",".join(sets), vals)
        if old_vid != vid:
            print("reassign", name, "vid", old_vid, "->", vid, vname)
        updated += 1

    con.commit()
    # summary by vendor
    summary = cur.execute(
        """
        SELECT v.name, COUNT(*) FROM models m
        JOIN vendors v ON v.id=m.vendor_id
        WHERE %s
        GROUP BY v.name ORDER BY COUNT(*) DESC
        """
        % (
            "(m.deleted_at IS NULL OR m.deleted_at=0)"
            if "deleted_at" in m_cols
            else "1=1"
        )
    ).fetchall()
    con.close()
    print("updated", updated)
    print("skipped", skipped or "NONE")
    print("by_vendor", {n: c for n, c in summary})
    print("DONE_HEAL_MARKETPLACE_VENDORS")


if __name__ == "__main__":
    main()
