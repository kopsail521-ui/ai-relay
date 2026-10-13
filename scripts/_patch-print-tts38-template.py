#!/usr/bin/env python3
"""Patch print-vps-add-gemini-3.8-flash-tts.mjs readme template:
cost basis -> account-group display (Aistudio-Gemini-3, comp x20):
  cost 0.2206 / 4.4120 -> sell x2 = 0.4412 / 8.824 (ratio 0.2206, comp 20)
protocol note: upstream rejects /v1/audio/speech (protocol_unsupported);
serve via POST /v1/chat/completions + modalities ["text","audio"].
Each old string must match exactly once."""
import io
import sys

P = "scripts/print-vps-add-gemini-3.8-flash-tts.mjs"
s = io.open(P, encoding="utf-8").read()

OLD_HDR = """# 上架 gemini-3.8-flash-tts（OpenLux 上游，售价=成本×2）
# Keyo Primary · 语音合成 · Token 计费

上游定价（最便宜组 Aistudio-Gemini-2，2026-10-10 探测）：
- 成本 输入 $0.132355 / M · 输出 $2.38239 / M
- 售价 输入 $0.26471 / M · 输出 $4.76478 / M
- ModelRatio=0.132355 CompletionRatio=18
"""
NEW_HDR = """# 上架 gemini-3.8-flash-tts（OpenLux 上游，售价=成本×2）
# Keyo Primary · 语音合成 · chat+audio 协议

上游成本（账号组 Aistudio-Gemini-3 口径，2026-10-10 上游站显示；补全 ×20）：
- 成本 输入 $0.2206 / M · 输出 $4.4120 / M
- 售价 输入 $0.4412 / M · 输出 $8.8240 / M
- ModelRatio=0.2206 CompletionRatio=20
协议：上游拒绝 /v1/audio/speech（protocol_unsupported，已上架 3.1 同样受影响）；
走 POST /v1/chat/completions + modalities ["text","audio"]，音频内联返回（实测 200）。
"""

OLD_EXP = """  pricing token gemini-3.8-flash-tts 0.26471 / 4.76478 ratio 0.132355 comp 18.0"""
NEW_EXP = """  pricing token gemini-3.8-flash-tts 0.4412 / 8.824 ratio 0.2206 comp 20.0"""

OLD_SELL = """  SELL_IN_USD 0.26471
  SELL_OUT_USD 4.76478"""
NEW_SELL = """  SELL_IN_USD 0.4412
  SELL_OUT_USD 8.824"""

OLD_VER = """  gemini-3.8-flash-tts sell 0.26471 / 4.76478 tags 语音合成"""
NEW_VER = """  gemini-3.8-flash-tts sell 0.4412 / 8.824 tags 语音合成"""

REPL = [(OLD_HDR, NEW_HDR, 1), (OLD_EXP, NEW_EXP, 1), (OLD_SELL, NEW_SELL, 1), (OLD_VER, NEW_VER, 1)]

for old, new, want in REPL:
    n = s.count(old)
    if n != want:
        print("MATCH_FAIL", n, "!=", want, repr(old[:50]))
        sys.exit(1)
    s = s.replace(old, new)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)

t = io.open(P, encoding="utf-8").read()
for bad in ["0.132355", "2.38239", "0.26471", "4.76478", "comp 18.0", "CompletionRatio=18", "/v1/audio/speech"]:
    if bad in t:
        print("STALE_LEFT", bad)
        sys.exit(1)
for good in ["0.2206", "4.4120", "0.4412", "8.8240", "comp 20.0", "CompletionRatio=20", "/v1/chat/completions", 'modalities ["text","audio"]']:
    if good not in t:
        print("NEW_MISSING", good)
        sys.exit(1)
print("PRINT_TEMPLATE_PATCH_OK")
