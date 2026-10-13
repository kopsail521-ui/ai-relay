#!/usr/bin/env python3
"""Patch print-vps-add-gemini-3.8-flash-tts.mjs readme template:
cost basis -> account-group display 0.2206/4.4120 (comp x20), sell x2 ->
0.4412/8.824; note the chat+audio protocol (upstream rejects /v1/audio/speech).
Every replacement must match exactly once."""
import io
import sys

P = "scripts/print-vps-add-gemini-3.8-flash-tts.mjs"
s = io.open(P, encoding="utf-8").read()

REPL = [
    # header + protocol note
    (
        "# 上架 gemini-3.8-flash-tts（OpenLux 上游，售价=成本×2）\n# Keyo Primary · 语音合成 · Token 计费\n\n上游定价（最便宜组 Aistudio-Gemini-2，2026-10-10 探测）：\n",
        "# 上架 gemini-3.8-flash-tts（售价=成本×2）\n"
        "# Keyo Primary · 语音合成 · Token 计费 · OpenAI chat+audio 协议\n\n"
        "上游成本（账号组显示，2026-10-10）：\n"
        "协议：上游拒绝 /v1/audio/speech（protocol_unsupported）；仅 /v1/chat/completions\n"
        '  + modalities=["text","audio"]，音频内联返回在 chat 响应中。\n',
    ),
    ("- 成本 输入 $0.132355 / M · 输出 $2.38239 / M\n", "- 成本 输入 $0.2206 / M · 输出 $4.4120 / M（补全 ×20）\n"),
    ("- 售价 输入 $0.26471 / M · 输出 $4.76478 / M\n", "- 售价 输入 $0.4412 / M · 输出 $8.8240 / M\n"),
    ("- ModelRatio=0.132355 CompletionRatio=18\n", "- ModelRatio=0.2206 CompletionRatio=20\n"),
    (
        "pricing token gemini-3.8-flash-tts 0.26471 / 4.76478 ratio 0.132355 comp 18.0",
        "pricing token gemini-3.8-flash-tts 0.4412 / 8.824 ratio 0.2206 comp 20.0",
    ),
    ("SELL_IN_USD 0.26471", "SELL_IN_USD 0.4412"),
    ("SELL_OUT_USD 4.76478", "SELL_OUT_USD 8.824"),
    (
        "gemini-3.8-flash-tts sell 0.26471 / 4.76478 tags 语音合成",
        "gemini-3.8-flash-tts sell 0.4412 / 8.824 tags 语音合成",
    ),
]

for old, new in REPL:
    n = s.count(old)
    if n != 1:
        print("MATCH_FAIL", n, repr(old[:60]))
        sys.exit(1)
    s = s.replace(old, new)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)

# verify: no stale numbers remain
for bad in ["0.132355", "2.38239", "0.26471", "4.76478", "comp 18", "CompletionRatio=18", "/v1/audio/speech）"]:
    if bad in s:
        print("STALE_LEFT", bad)
        sys.exit(1)
for good in ["0.2206", "4.4120", "0.4412", "8.824", "comp 20.0", "CompletionRatio=20", 'modalities=["text","audio"]']:
    if good not in s:
        print("NEW_MISSING", good)
        sys.exit(1)
print("PRINT_README_PATCH_OK")
