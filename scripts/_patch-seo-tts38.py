#!/usr/bin/env python3
"""Patch static/seo/model/gemini-3.8-flash-tts.html:
price -> sell x2 of account-group cost (0.2206/4.4120) = ~$0.44 / $8.82 per 1M;
protocol -> POST /v1/chat/completions with modalities ["text","audio"]
(upstream rejects /v1/audio/speech with protocol_unsupported)."""
import io
import sys

P = "static/seo/model/gemini-3.8-flash-tts.html"
s = io.open(P, encoding="utf-8").read()

OLD_CURL = (
    "<pre><code>curl https://www.keyoapi.xyz/v1/audio/speech \\\n"
    '  -H "Authorization: Bearer YOUR_API_KEY" \\\n'
    '  -H "Content-Type: application/json" \\\n'
    '  -d \'{"model":"gemini-3.8-flash-tts","input":"Hello from Gemini 3.8 Flash TTS.","voice":"Kore"}\' \\\n'
    "  --output speech.wav</code></pre>"
)
NEW_CURL = (
    "<pre><code>curl https://www.keyoapi.xyz/v1/chat/completions \\\n"
    '  -H "Authorization: Bearer YOUR_API_KEY" \\\n'
    '  -H "Content-Type: application/json" \\\n'
    '  -d \'{"model":"gemini-3.8-flash-tts","modalities":["text","audio"],"audio":{"voice":"Kore","format":"wav"},"messages":[{"role":"user","content":"Hello from Gemini 3.8 Flash TTS."}]}\'</code></pre>'
)

REPL = [
    # 1. bare price with in/out suffix: ld+json offers, meta span, FAQ, overview "about"
    ("$0.26 / $4.76 per 1M in/out", "$0.44 / $8.82 per 1M in/out", 4),
    # 2. shared meta/og/twitter/ld+json description
    (
        "Call gemini-3.8-flash-tts on KeyoAPI (~$0.26 / $4.76 per 1M). Sync OpenAI-compatible text-to-speech.",
        "Call gemini-3.8-flash-tts on KeyoAPI (~$0.44 / $8.82 per 1M). Sync OpenAI-compatible text-to-speech via chat completions.",
        4,
    ),
    # 3. overview protocol sentence
    (
        "Call POST /v1/audio/speech at https://www.keyoapi.xyz/v1 and receive audio in the same response (sync).",
        'Call POST /v1/chat/completions at https://www.keyoapi.xyz/v1 with modalities ["text","audio"] and receive audio inline in the same response (sync).',
        1,
    ),
    # 4. quick start endpoint line
    ("Endpoint: <code>POST /v1/audio/speech</code>", "Endpoint: <code>POST /v1/chat/completions</code>", 1),
    # 5. curl example
    (OLD_CURL, NEW_CURL, 1),
    # 6. FAQ sync answer
    (
        "Sync: POST /v1/audio/speech returns audio. Async TTS on Keyo remains Qwen3-TTS / CosyVoice3.",
        'Sync: audio returns inline in the chat completion response (modalities ["text","audio"]). Async TTS on Keyo remains Qwen3-TTS / CosyVoice3.',
        1,
    ),
]

for old, new, want in REPL:
    n = s.count(old)
    if n != want:
        print("MATCH_FAIL", n, "!=", want, repr(old[:60]))
        sys.exit(1)
    s = s.replace(old, new)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)

for bad in ["/v1/audio/speech", "$0.26", "$4.76", "speech.wav", '"input":"Hello']:
    if bad in s:
        print("STALE_LEFT", bad)
        sys.exit(1)
for good in ["$0.44 / $8.82 per 1M", "/v1/chat/completions", 'modalities', '"voice":"Kore"']:
    if good not in s:
        print("NEW_MISSING", good)
        sys.exit(1)
print("SEO_PATCH_OK")
