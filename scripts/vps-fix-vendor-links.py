#!/usr/bin/env python3
"""
Fix marketplace vendor links that drifted from scripts/fix-model-marketplace-meta.mjs.

Root cause seen in prod:
  - seedance-* pointed at English vendor "ByteDance" while empty "字节跳动" also existed
    → sidebar showed neither as 字节跳动; users thought Seedance vendor vanished
  - Unlimited-OCR / RMBG-2.0 / IndexTTS-2 / Real-ESRGAN stuck under「其他」
    while 百度 / BRIA AI / 哔哩哔哩 / 腾讯 vendors existed empty

Usage on VPS:
  sudo python3 scripts/vps-fix-vendor-links.py
  # or: sudo python3 /opt/ai-relay/scripts/vps-fix-vendor-links.py /opt/ai-relay/data/new-api/one-api.db
"""
from __future__ import annotations

import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

# model_name → (vendor_name, vendor_icon)
MODEL_VENDOR = {
    "seedance-2.5": ("字节跳动", "Doubao.Color"),
    "seedance-2.0": ("字节跳动", "Doubao.Color"),
    "Unlimited-OCR": ("百度", "Wenxin.Color"),
    "RMBG-2.0": ("BRIA AI", "Custom"),
    "IndexTTS-2": ("哔哩哔哩", "Bilibili.Color"),
    "Real-ESRGAN": ("腾讯", "Tencent.Color"),
    "Fun-ASR-Nano-2512": ("阿里巴巴", "Qwen.Color"),
    "Qwen3-TTS": ("阿里巴巴", "Qwen.Color"),
    "CosyVoice3": ("阿里巴巴", "Qwen.Color"),
    "wan3.0-video": ("阿里巴巴", "Qwen.Color"),
    "flux-3-video": ("Black Forest Labs", "Flux"),
    "MiniMax-H3": ("MiniMax", "Minimax.Color"),
    "sam3": ("Meta", "Meta.Color"),
    "GLM-ASR": ("智谱", "Zhipu.Color"),
    "GLM-TTS": ("智谱", "Zhipu.Color"),
    "Step-Audio-TTS-3B": ("阶跃星辰", "Stepfun.Color"),
}

# absorb alias → keep
VENDOR_MERGES = {
    "字节跳动": ["ByteDance", "Doubao", "Seedance", "豆包"],
    "阿里巴巴": ["Alibaba", "Qwen", "通义"],
}


def cols(cur, table):
    cur.execute("PRAGMA table_info(%s)" % table)
    return {r[1] for r in cur.fetchall()}


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    vc = cols(cur, "vendors")
    soft = "deleted_at" in vc
    now = int(time.time())

    def find_vendor(name):
        if soft:
            cur.execute(
                "SELECT id FROM vendors WHERE name=? AND deleted_at IS NULL LIMIT 1",
                (name,),
            )
        else:
            cur.execute("SELECT id FROM vendors WHERE name=? LIMIT 1", (name,))
        row = cur.fetchone()
        return row[0] if row else None

    def ensure_vendor(name, icon):
        vid = find_vendor(name)
        if vid:
            if icon:
                cur.execute("UPDATE vendors SET icon=? WHERE id=?", (icon, vid))
            return vid
        fields = ["name", "icon", "description"]
        vals = [name, icon or "Custom", ""]
        if "status" in vc:
            fields.append("status")
            vals.append(1)
        if "created_at" in vc:
            fields.append("created_at")
            vals.append(now)
        if "updated_at" in vc:
            fields.append("updated_at")
            vals.append(now)
        # new-api may use created_time/updated_time
        if "created_time" in vc:
            fields.append("created_time")
            vals.append(now)
        if "updated_time" in vc:
            fields.append("updated_time")
            vals.append(now)
        q = "INSERT INTO vendors (%s) VALUES (%s)" % (
            ",".join(fields),
            ",".join("?" * len(fields)),
        )
        cur.execute(q, vals)
        vid = cur.lastrowid
        print("created vendor", name, "id", vid)
        return vid

    def absorb(keep_name, aliases, icon="Custom"):
        keep = ensure_vendor(keep_name, icon)
        for a in aliases:
            if soft:
                cur.execute(
                    "SELECT id FROM vendors WHERE name=? AND deleted_at IS NULL", (a,)
                )
            else:
                cur.execute("SELECT id FROM vendors WHERE name=?", (a,))
            for (vid,) in cur.fetchall():
                if vid == keep:
                    continue
                cur.execute(
                    "UPDATE models SET vendor_id=? WHERE vendor_id=?", (keep, vid)
                )
                n = cur.rowcount
                if soft:
                    cur.execute(
                        "UPDATE vendors SET deleted_at=datetime('now') WHERE id=?", (vid,)
                    )
                else:
                    if "status" in vc:
                        cur.execute("UPDATE vendors SET status=0 WHERE id=?", (vid,))
                    else:
                        cur.execute("DELETE FROM vendors WHERE id=?", (vid,))
                print("merged", a, "id", vid, "->", keep_name, "models", n)

    absorb("字节跳动", VENDOR_MERGES["字节跳动"], "Doubao.Color")
    absorb("阿里巴巴", VENDOR_MERGES["阿里巴巴"], "Qwen.Color")

    for model, (vname, icon) in MODEL_VENDOR.items():
        vid = ensure_vendor(vname, icon)
        cur.execute(
            "UPDATE models SET vendor_id=?, icon=? WHERE model_name=?",
            (vid, icon, model),
        )
        print(("OK" if cur.rowcount else "MISS"), model, "->", vname, "icon", icon)

    conn.commit()

    cur.execute("SELECT id, name FROM vendors")
    vmap = {r[0]: r[1] for r in cur.fetchall()}
    print("--- verify ---")
    names = sorted(MODEL_VENDOR.keys())
    cur.execute(
        "SELECT model_name, vendor_id FROM models WHERE model_name IN (%s)"
        % (",".join("?" * len(names))),
        names,
    )
    for name, vid in cur.fetchall():
        cur.execute("SELECT icon FROM models WHERE model_name=?", (name,))
        icon = (cur.fetchone() or [""])[0]
        print(name, "=>", vmap.get(vid), "vid", vid, "icon", icon)
    print("DONE_FIX_VENDOR_LINKS")


if __name__ == "__main__":
    main()
