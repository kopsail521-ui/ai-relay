#!/usr/bin/env python3
"""Patch both TTS SEO pages to the Gemini-native generateContent protocol.
- gemini-3.8-flash-tts.html: chat-completions example -> native
- gemini-3.1-flash-tts-preview.html: broken /v1/audio/speech -> native
Every old string must match exactly the asserted number of times."""
import io
import sys

P38 = "static/seo/model/gemini-3.8-flash-tts.html"
P31 = "static/seo/model/gemini-3.1-flash-tts-preview.html"


def native_curl(model, hello):
    return (
        "<pre><code>curl https://www.keyoapi.xyz/v1beta/models/%s:generateContent \\\n"
        '  -H "Authorization: Bearer YOUR_API_KEY" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        "  -d '{\"contents\":[{\"parts\":[{\"text\":\"%s\"}]}],"
        "\"generationConfig\":{\"responseModalities\":[\"AUDIO\"],"
        "\"speechConfig\":{\"voiceConfig\":{\"prebuiltVoiceConfig\":{\"voiceName\":\"Kore\"}}}}}'</code></pre>"
    ) % (model, hello)


def patches_for(model, meta_old, meta_new, overview_old, endpoint_old, curl_old, faq_old):
    return [
        (meta_old, meta_new, 4),
        (
            overview_old,
            'Call POST /v1beta/models/%s:generateContent with responseModalities ["AUDIO"] '
            "and receive WAV audio inline (base64) in the same response." % model,
            1,
        ),
        (
            endpoint_old,
            "Endpoint: <code>POST /v1beta/models/%s:generateContent</code>" % model,
            1,
        ),
        (curl_old, native_curl(model, "Hello from %s." % model.replace("gemini-", "Gemini ").replace("-flash-tts", " Flash TTS").replace("-preview", "")), 1),
        (
            faq_old,
            "Sync: the generateContent response carries inline WAV audio (base64) in "
            "candidates[0].content.parts. Async TTS on Keyo remains Qwen3-TTS / CosyVoice3.",
            1,
        ),
    ]


JOB38 = patches_for(
    "gemini-3.8-flash-tts",
    "Call gemini-3.8-flash-tts on KeyoAPI (~$0.44 / $8.82 per 1M). Sync OpenAI-compatible text-to-speech via chat completions.",
    "Call gemini-3.8-flash-tts on KeyoAPI (~$0.44 / $8.82 per 1M). Gemini-style generateContent returns inline WAV audio.",
    'Call POST /v1/chat/completions at https://www.keyoapi.xyz/v1 with modalities ["text","audio"] and receive audio inline in the same response (sync).',
    "Endpoint: <code>POST /v1/chat/completions</code>",
    (
        "<pre><code>curl https://www.keyoapi.xyz/v1/chat/completions \\\n"
        '  -H "Authorization: Bearer YOUR_API_KEY" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"model":"gemini-3.8-flash-tts","modalities":["text","audio"],"audio":{"voice":"Kore","format":"wav"},"messages":[{"role":"user","content":"Hello from Gemini 3.8 Flash TTS."}]}\'</code></pre>'
    ),
    'Sync: audio returns inline in the chat completion response (modalities ["text","audio"]). Async TTS on Keyo remains Qwen3-TTS / CosyVoice3.',
)

JOB31 = patches_for(
    "gemini-3.1-flash-tts-preview",
    "Call gemini-3.1-flash-tts-preview on KeyoAPI (~$0.40 / $8.00 per 1M). Sync OpenAI-compatible text-to-speech.",
    "Call gemini-3.1-flash-tts-preview on KeyoAPI (~$0.40 / $8.00 per 1M). Gemini-style generateContent returns inline WAV audio.",
    "Call POST /v1/audio/speech at https://www.keyoapi.xyz/v1 and receive audio in the same response (sync).",
    "Endpoint: <code>POST /v1/audio/speech</code>",
    (
        "<pre><code>curl https://www.keyoapi.xyz/v1/audio/speech \\\n"
        '  -H "Authorization: Bearer YOUR_API_KEY" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"model":"gemini-3.1-flash-tts-preview","input":"Hello from Gemini Flash TTS.","voice":"Kore"}\' \\\n'
        "  --output speech.wav</code></pre>"
    ),
    "Sync: POST /v1/audio/speech returns audio. Async TTS on Keyo remains Qwen3-TTS / CosyVoice3.",
)

for path, job in ((P38, JOB38), (P31, JOB31)):
    s = io.open(path, encoding="utf-8").read()
    for old, new, want in job:
        n = s.count(old)
        if n != want:
            print("MATCH_FAIL", path, n, "!=", want, repr(old[:60]))
            sys.exit(1)
        s = s.replace(old, new)
    io.open(path, "w", encoding="utf-8", newline="\n").write(s)

for path in (P38, P31):
    s = io.open(path, encoding="utf-8").read()
    for bad in ["/v1/audio/speech", "speech.wav", "/v1/chat/completions", '"input":"', '"voice":"Kore"']:
        if bad in s:
            print("STALE_LEFT", path, bad)
            sys.exit(1)
    for good in ["/v1beta/models/", "responseModalities", "speechConfig", "prebuiltVoiceConfig"]:
        if good not in s:
            print("NEW_MISSING", path, good)
            sys.exit(1)
print("SEO_NATIVE_PATCH_OK")
