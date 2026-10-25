# KeyoAPI — API integration handbook (copy to AI)

> **For users:** Copy this **entire page** to your AI, then add:
> 1) Your API Key (`sk-...`)
> 2) The model name (from “All models” below)
> 3) What you want (e.g. MiniMax-H3, 5s landscape video, prompt is …)
> The AI will pick the right path and fields. You do not need to understand the tech.
>
> **For the AI:** You are a KeyoAPI calling assistant. Follow paths, fields, and poll rules exactly.
> - Base URL: `https://www.keyoapi.xyz/v1`
> - Header: `Authorization: Bearer <user key>`
> - Find the capability family for the model, then apply that template. Video models must use their own section — never mix fields.
> - Identify async completion by family: image success is HTTP 200 + `status:"succeeded"` + nonempty `data[].url` (§3); video / TTS / document parsing / InfiniteTalk success is `completed` (§0.6). Poll while pending, then return the result URL/text.
> - Video Path B accepts **JSON only**; its media must be **public `http(s)` URLs**.
> - Per-model video fields / modes / forbidden rules are in **§4 / §5 of this handbook** (user pastes this page — do not require other docs).
> - Local files only: **first** `POST /v1/uploads` (alias `/v1/files`) → use returned `url` in Path B / OCR JSON.
> - **Forbidden:** local paths in JSON, `data:base64` or direct multipart on Video Path B, invented `POST /v1/assets` / `asset://`; image references accept base64 (§3).
> - Images at `/v1/images/edits` / ASR / matting / upscale / MinerU / InfiniteTalk accept multipart `-F file=@` / `-F image=@` using the field required by each endpoint (no prior upload needed).
> - This handbook covers documented integrations, not every catalog entry. Check `GET /v1/models` for IDs available to the key and `/pricing` for group eligibility. A catalog entry alone does not establish its input or polling contract; see §1.14 before using unlisted templates.
> - Identify the shell before running commands. The `bash` / curl examples use macOS / Linux Bash or Windows Git Bash; backslashes do not continue PowerShell lines. On Windows PowerShell 5.1 / 7, use §2.2. Construct requests for other endpoints using their documented fields rather than running the Bash commands unchanged.

---

## 0.1 Calling shapes (one key, one balance)

- Base URL (OpenAI-shaped): `https://www.keyoapi.xyz/v1`
- Header: `Authorization: Bearer sk-...`

| Shape | Used for | Example paths |
|------|-----------|----------|
| OpenAI-compatible | Text chat, model list, embeddings, image generation, ASR, OCR | `POST /v1/chat/completions` · `GET /v1/models` · `POST /v1/embeddings` · `POST /v1/images/generations` · `POST /v1/audio/transcriptions` |
| OpenAI-shaped (partial) | Sync TTS, content moderation | `POST /v1/audio/speech` — covers `GLM-TTS` / `Step-Audio-TTS-3B` / `IndexTTS-2` / `eleven-v4` / `eleven-v4-turbo` / `gemini-3.8-flash-tts` (see §1.6 / §7), other TTS runs async (§1.7 / §8); `POST /v1/moderations` — `model` + `input` matches OpenAI, response contract in §13 |
| Dedicated REST | Visual processing, async video, digital human, document parsing, System One / structured decisions, video tools | Matting / upscale / unwarp / detect / segment / pose (§1.10) · Path B video (§5) · Digital humans (InfiniteTalk / Duix-Avatar, §1.11 / §12) · MinerU document parsing (§1.9 / §10) · Structured decisions (`POST /v1/systemone` & `POST /v1/decisions`, §1.11b) · video tools (§1.11a) — different paths, same key and balance |

Rule: change only `model` when both models explicitly share the same documented request contract. Paths, required fields, accepted parameters and polling rules can differ even within one capability.

---

## 0. Poll paths (do not mix)

| Case | Poll |
|------|------|
| Video Path B (`/v1/videos/generations`) | `GET /v1/tasks/{id}` (**plural tasks**) |
| Video Path A (`/v1/videos`) | `GET /v1/videos/{id}` |
| TTS async / docs / digital human (InfiniteTalk / Duix-Avatar) | `GET /v1/task/{id}` (**singular task**) |
| Image tasks | `GET /v1/images/tasks/{task_id}` (image-specific path) |

---

## 0.2 Errors, retries and duplicate submissions

- Use the documented API path exactly once after the base URL; do not append a second `/v1`.
- `400`: fix parameters. `401/403`: check the key and permissions. Insufficient balance/quota is not a temporary busy response; do not loop retries.
- For `429`, respect the full `Retry-After` interval. If it exceeds the operation deadline, defer or stop instead of retrying earlier.
- Retry temporary **GET status queries** with bounded backoff using the same saved task ID. A query timeout does not establish task failure.
- A timed-out **POST create** may already have created a billable task. Save its receipt/request ID and reconcile it; do not create a replacement automatically. Only use idempotent replay on an endpoint that explicitly documents support. Image idempotency is described in §3.3; do not assume the same feature exists for video, TTS or avatars.
- Use a new image idempotency key for a new operation. Reuse the original key and identical parameters only when recovering that same operation.
- `:free` identifies gift-credit billing, not a promise of a permanent zero rate. Check each model’s rate and the wallet: gift-credit exhaustion may fall back to paid balance. See https://www.keyoapi.xyz/free-models.

---

## 0.6 AI result contract (all async)

Async flow: **submit → read id → poll by family while pending → read url/text**. Handle a success result or terminal task error returned at submission directly. Never mix poll paths.

**Image tasks (§3):** pending responses are HTTP 202 with `status` = `reserved` / `submitting` / `running`; success is HTTP 200 + `status:"succeeded"` + nonempty `data[].url`. Recorded terminal task errors return HTTP 502 with `error.task_id`; temporary query errors do not mean the task failed — retry GET for the same task (§3.3).
**Normalized status for video / TTS / document parsing / digital humans (InfiniteTalk / Duix-Avatar):** `processing` | `completed` | `failed` | `cancelled`. These responses may keep `status_raw` such as `succeeded` / `success` / `waiting`; use normalized `status` for these families. This rule does not apply to image tasks.

| Family | Submit id | Poll until | Result |
|--------|-----------|------------|--------|
| Images | `id` \| `task_id` | HTTP 200 + `status:"succeeded"` + nonempty `data[].url`; terminal task errors: §3.3 | `data[].url` |
| Video Path B | `id` \| `task_id` \| `data[0].task_id` | `status`/`data.status` = `completed` | **`url`** or `data.result.videos[0].url[0]` |
| TTS async / InfiniteTalk | `id` \| `task_id` | `status` = `completed` | **`url`** or `output.file_url` |
| MinerU | `id` \| `task_id` | `status` = `completed` | **`text`** or `output.segments[].content` |
| Video Path A (auto-forward) | `id` | `status` = `completed` | read **`url`**. Path A has no own models; it only forwards to Path B |
| Chat / OCR | — | — | `choices[0].message.content` |
| ASR | — | — | `text` |
| TTS sync | — | — | **raw audio bytes** (not JSON) |
| Uploads | — | — | response **`url`** |

**Temporary query errors on the singular task path:** when `GET /v1/task/{id}` returns HTTP 502 with `error.code="task_query_unavailable"`, keep the original task ID, wait for `Retry-After`, then retry the same GET. This does not mean the task is `failed`; do not POST a new task.

Path B poll success:
```json
{
  "code": 200,
  "id": "task_xxx",
  "task_id": "task_xxx",
  "status": "completed",
  "url": "https://…/out.mp4",
  "data": {
    "id": "task_xxx",
    "task_id": "task_xxx",
    "status": "completed",
    "result": { "videos": [{ "url": ["https://…/out.mp4"] }] }
  }
}
```

---

## 0.5 Local media upload (file → public URL)

For: **Path B video** (MiniMax / Wan / FLUX / Omni), **Unlimited-OCR** / multimodal chat `image_url.url`.
Not for: ASR, matting, upscale, MinerU, InfiniteTalk, Duix-Avatar (those accept multipart directly).

`POST https://www.keyoapi.xyz/v1/uploads`
Alias: `POST https://www.keyoapi.xyz/v1/files`
Header: `Authorization: Bearer sk-...`
Body: `multipart/form-data`, field `file` (also accepts `image` / `audio` / `video`)

```bash
curl https://www.keyoapi.xyz/v1/uploads \
  -H "Authorization: Bearer sk-..." \
  -F file=@./still.jpg
```

Success response:
```json
{
  "object": "upload",
  "id": "a1b2c3d4e5f6789012345678abcdef01.jpg",
  "url": "https://www.keyoapi.xyz/uploads/a1b2c3d4e5f6789012345678abcdef01.jpg",
  "bytes": 245760,
  "content_type": "image/jpeg",
  "expires_at": "2026-09-19T13:00:00.000Z"
}
```

Rules:
- Put the returned **`url`** into downstream JSON (`image_urls`, `images`, `video_urls`, `audios`, `image_url.url`, …).
- Allowed: jpg/png/webp/gif/bmp, mp3/wav/m4a/aac/ogg/flac, mp4/webm/mov/mkv, pdf.
- Default max ~**100MB**; files expire in ~**48h** (`expires_at`) — submit the video job before expiry.
- There is **no** `POST /v1/assets` and **no** `asset://`.

Two-step MiniMax-H3 reference image:
```bash
# 1) Upload
URL=$(curl -s https://www.keyoapi.xyz/v1/uploads \
  -H "Authorization: Bearer sk-..." \
  -F file=@./still.jpg | jq -r .url)

# 2) Generate (JSON only)
curl https://www.keyoapi.xyz/v1/videos/generations \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"MiniMax-H3\",\"prompt\":\"animate the character\",\"aspectRatio\":\"landscape\",\"resolution\":\"480p\",\"duration\":5,\"images\":[\"$URL\"]}"
```

Same pattern for other Path B models: upload once, map `url` to that model’s fields.

---

## 1. Documented model integrations (by capability)

### 1.1 Chat → `POST /v1/chat/completions`

Gift-credit (the `:free` suffix): `Atria-dawn-v2:free` · `DeepSeek-Prover-V2-7B:free` · `deepseek-v4.1-flash-1017:free` · `glm-5.3:free` · `keyo-flash:free` · `keyo-flash2:free`

Gift-credit IDs (`:free` suffix) include the chat lanes above, plus `GLM-ASR:free` and `SenseVoiceSmall:free` (ASR, §1.5) and `Spark-TTS-0.5B:free` (TTS, §1.7). Calls bill at dedicated gift-credit rates from your gift credit first (one-time $10 for new users, +$3 per invite). Full live list and rates: https://www.keyoapi.xyz/free-models.

Paid: `gpt-5.6-luna` · `gpt-5.6-terra` · `gpt-5.6-sol` · `gpt-6-luna` · `gpt-6-sol` · `gpt-6-astra` · `gpt-6.1-sol` · `claude-sonnet-5` · `claude-sonnet-5-5` · `claude-opus-5` · `claude-opus-5-5` · `claude-haiku-5-5` · `claude-fable-5` · `claude-fable-5-1` · `gemini-3.7-flash` · `gemini-3.8-flash` · `gemini-4-argon` · `gemini-4-barium` · `grok-4.7` · `grok-4.6` · `minimax-m3` · `MiniMax-M3.1-Flash` · `glm-5.3` · `glm-5.3-flash` · `glm-5.2` · `deepseek-v4.1-flash` · `deepseek-v4.1-flash-1017` · `deepseek-v4-pro-0813` · `deepseek-v4-flash-0731` · `deepseek-v4-pro` · `deepseek-v4-flash` · `kimi-k3` · `kimi-k2.7-code` · `qwen3.8-flash` · `hy4-preview` · `mimo-v2.6-pro` · `mimo-v2.6-flash` · `qwen3.8-max-0902` · `DeepSeek-Prover-V2-7B` · `Atria-dawn-v2`

### 1.2 Images → `POST /v1/images/generations`

`gpt-image-2.5-flare` · `gpt-image-2.5-sunburst` · `gpt-image-2` · `gpt-image-2-vip` · `nano-banana-2.1` · `nano-banana-2` · `nano-banana-pro`

The currently documented 2.5 variants are `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`. Check the complete model ID and available groups on `/pricing` before submitting. The group selected for the API key must have an available channel for that model; do not add or remove model suffixes.

### 1.3 Video Path A → `POST /v1/videos` (forward only)

Path A has no own models: wan / Seedance / FLUX / MiniMax / Gemini Omni posted here are forwarded to Path B. Grok video moved to the chat endpoint (see §4).

### 1.4 Video Path B → `POST /v1/videos/generations` → poll `GET /v1/tasks/{id}`

`wan3.0-video` · `flux-3-video` · `MiniMax-H3` · `seedance-2.5` · `seedance-2.0` · `seedance-2.0-fast` · `seedance-2.0-mini` · `gemini-omni-1.1-flash` · `gemini-omni-1.1-flash-ext`

(Fields differ by model — see §5. Seedance also supports fixed-resolution SKUs such as `seedance-2.0-720p` / `seedance-2.0-1080p`.)

### 1.5 ASR → `POST /v1/audio/transcriptions` (multipart)

`whisper-large-v3-turbo` · `whisper-large-v3` · `SenseVoiceSmall` · `GLM-ASR` · `MOSS-Audio-8B-Thinking`

### 1.6 TTS sync → `POST /v1/audio/speech` (audio bytes)

`GLM-TTS` · `Step-Audio-TTS-3B` · `IndexTTS-2` · `eleven-v4` ($80/1M chars) · `eleven-v4-turbo` ($40/1M chars) · `gemini-3.8-flash-tts` (supports Google-native `POST /v1beta/models/gemini-3.8-flash-tts:generateContent` and OpenAI-compatible speech endpoint)

### 1.7 TTS async → `POST /v1/async/audio/speech` → poll `GET /v1/task/{id}`

`Qwen3-TTS` · `CosyVoice3` · `Spark-TTS-0.5B` · `Spark-TTS-0.5B:free` (`IndexTTS-2` may also use async)

### 1.8 OCR → `POST /v1/chat/completions` (multimodal messages)

`Unlimited-OCR`

### 1.9 Document parse → `POST /v1/async/documents/parse` → `GET /v1/task/{id}`

`MinerU2.5-Pro`

### 1.10 Vision tools (multipart)

| Capability | Path | Models |
|------------|------|--------|
| Matting | `POST /v1/images/mattings` | `RMBG-2.0` |
| Upscale | `POST /v1/images/upscaling` | `Real-ESRGAN` · `AnimeSharp` |
| Unwarp | `POST /v1/images/unwarping` | `UVDoc` |
| Detect | `POST /v1/images/object-detection` | `VajraV1` · `sam3` |
| Seg | `POST /v1/images/segmentation` | `VajraV1` · `sam3` |
| Pose | `POST /v1/images/pose-detection` | `VajraV1` |

### 1.11 Talking-head & digital human → async → poll `GET /v1/task/{id}`

- **Image/video + audio driving** (`POST /v1/async/videos/image-to-video`): `InfiniteTalk` (multipart: `model` + `prompt` + `cond_video` + `cond_audio`, ~$0.342/request)
- **Audio + video driving lip-sync** (`POST /v1/async/videos/audio-video-to-video`): `Duix-Avatar` (multipart required: `model=Duix-Avatar`, `ref_audio` audio file, `ref_video` video file, up to 60s, tiered pricing from $0.0685/sec)

### 1.11a Video tools (async, per-second) → `GET /v1/task/{id}`

| Capability | Path | Model | Sell (approx.) |
|------------|------|-------|----------------|
| Hard-subtitle erase (refined) | `POST /v1/async/videos/subtitle-erase` | `subtitle-erase-pro` | **$0.018265/sec** |
| Video quality enhance (pro) | `POST /v1/async/videos/enhance` | `video-enhance-pro` | 720p **$0.034247/sec** · 1080p **$0.068493/sec** · 2K **$0.136986/sec** |

Submit JSON with `model` + video URL (`video_url` / `url`). Billed by successful processed duration in seconds.

### 1.11b Structured decisions → `POST /v1/systemone` & `POST /v1/decisions`

**System One endpoint** (`POST /v1/systemone`):
`Bespoke-Nimble-9B` (**Jev / Open-Jev**–style, BespokeLabs 2026-09-18, on Qwen3.5-9B-Instruct; JSON: `model` + `state` + `questions`; about **$0.032 / $0** per 1M tokens. Not general chat; max 26 options per field; prompts over 2048 tokens are rejected, not truncated)

`jev-1.13.0` (TypeSafe Jev System One; same JSON shape; about **$0.0336 / $0** per 1M tokens; ~32k context; no free-form text)

**Typed routing decisions endpoint** (`POST /v1/decisions`):
`cloudflare/clef` (Cloudflare open-source 27B multimodal decision model, from **$0.063 / 1M** input tokens; returns option probability distribution directly without free-form text or JSON parsing)

```bash
curl https://www.keyoapi.xyz/v1/systemone \
  -H "Authorization: Bearer sk-YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jev-1.13.0",
    "state": "Customer was charged twice and asks for a refund.",
    "questions": {
      "refund": {"type":"noul","instructions":"Does the customer request a refund?"},
      "dept": {
        "type":"choice",
        "instructions":"Which department should handle this?",
        "criteria":{"billing":"Charges and refunds","tech":"Bugs and outages"}
      }
    }
  }'
```

### 1.12 Moderations → `POST /v1/moderations`

`nonescape-v0` · `keyo-text-moderation` · `Security-semantic-filtering` · `nsfw-classifier`

### 1.13 Embeddings

| Capability | Path | Models |
|---|---|---|
| Embeddings | `POST /v1/embeddings` | `WeMM-Embedding-9B` · `WeMM-Embedding-4B` · `WeMM-Embedding-2B` · `gemini-embedding-2-preview` |

Embedding example:

```json
{
  "model": "WeMM-Embedding-9B",
  "input": ["text to retrieve"]
}
```

---
### 1.14 Catalog entries without a complete copyable contract here

`agnes-video-2.5` · `gpt-image-2-4K` · `gpt-image-2-2K` · `DiffusionGemma-26B-A4B-it-Jev` · `gemini-3.1-flash-tts-preview` · `grok-image-2.0` · `MiniMax-H3-vip` · `SemIf-OpenJev-4B` · `suno_music_open` · `keyo-super-resolution-1080p` · `keyo-super-resolution-4k` · `keyo-super-resolution-2k` · `keyo-voice-clone` · `keyo-video-subtitle-removal` · `keyo-tts` · `keyo-song` · `keyo-asr` · `suno_music` · `laya-multilingual`

These IDs may appear in the live catalog, but this handbook does not yet specify all required fields, supported modes and result semantics for them. In particular, music, voice enrollment and structured decision models must not be treated as ordinary chat/TTS requests. Before a chargeable submission, obtain the model-specific integration contract from support. Do not guess fields, substitute another model, or assume the image models listed here use the §3 image task endpoint.


## 2. Chat (shared template)

`POST https://www.keyoapi.xyz/v1/chat/completions`
`Content-Type: application/json`

Replace `model` with the user’s chat model id.

```json
{
  "model": "gpt-5.6-luna",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

Streaming: add `"stream": true` if needed.

---

### 2.1 ZCode / Cursor client setup

1. Add a custom OpenAI-compatible provider.
2. Base URL: `https://www.keyoapi.xyz/v1`. Select `Chat Completions (/chat/completions)` when the client offers a format selector. Do not add another `/v1` or put the complete endpoint in a base-URL field.
3. Enter your KeyoAPI key. Copy the full model ID from https://www.keyoapi.xyz/pricing or `GET /v1/models`, preserving prefixes, punctuation and `:free`.
4. Check the model’s rate and wallet. `:free` is a gift-credit entry, not a promise of a zero rate; paid-balance fallback may apply. Insufficient balance needs a billing correction, not repeated retries.
5. A successful connection probe does not establish working chat, streaming or tools. Confirm a visible text reply first, then separately check streaming and tool calls required by your workflow. Compatibility varies by model and client version; not every combination has been verified.


### 2.2 Copyable Windows PowerShell 5.1 / 7 example

Replace `$apiKey` and run the complete example. `Invoke-RestMethod` sends UTF-8 JSON bytes, avoiding curl aliases, Bash line continuation and command-line JSON quoting differences. A real chat request uses the selected model’s current rate.

```powershell
$apiKey = 'sk-YOUR_KEY'
$body = @{
  model = 'gpt-5.6-luna'
  messages = @(@{ role = 'user'; content = 'Hello' })
} | ConvertTo-Json -Depth 6
$request = @{
  Uri = 'https://www.keyoapi.xyz/v1/chat/completions'
  Method = 'Post'
  Headers = @{ Authorization = "Bearer $apiKey" }
  ContentType = 'application/json; charset=utf-8'
  Body = [System.Text.Encoding]::UTF8.GetBytes($body)
}
$response = Invoke-RestMethod @request
$response.choices[0].message.content
```

## 3. Image generation and references (model-specific parameters)

Text-to-image: `POST https://www.keyoapi.xyz/v1/images/generations`, JSON.
Image-to-image: add `images` to the same endpoint, or upload local files directly to `POST /v1/images/edits` using multipart.
The seven documented models below use the same generation contract for text and reference images; references do not disable the output size fields.

```json
{
  "model": "nano-banana-2",
  "prompt": "an orange cat on a sunny windowsill",
  "aspectRatio": "1:1",
  "imageSize": "2K",
  "n": 1,
  "response_format": "url",
  "replyType": "async"
}
```

### 3.1 Capabilities by model

These fields are optional. Use only values supported by the selected model. A `mask` is a mask input, separate from the reference `image` file.

| model | Size fields | quality | background | mask |
|-------|-------------|---------|------------|------|
| `gpt-image-2` | `size`: ratio or listed 1K pixels | `auto` | Unsupported | HTTP(S) URL |
| `gpt-image-2-vip` | `size`: constrained 1K–4K pixels or `auto` | `medium` | `transparent` | HTTP(S) URL |
| `gpt-image-2.5-flare` | `size`: listed 1K/2K/4K pixels or `auto` | `low` / `medium` / `high` | `transparent` | HTTP(S) URL |
| `gpt-image-2.5-sunburst` | `size`: listed 1K/2K/4K pixels or `auto` | `low` / `medium` / `high` / `xhigh` / `max` | `transparent` | HTTP(S) URL |
| `nano-banana-2` | `aspectRatio` + `imageSize`: `1K` / `2K` / `4K` | Unsupported | Unsupported | Unsupported |
| `nano-banana-2.1` | `aspectRatio` + `imageSize`: `1K` / `2K` / `4K` | Unsupported | Unsupported | Unsupported |
| `nano-banana-pro` | `aspectRatio` + `imageSize`: `1K` / `2K` / `4K` | Unsupported | Unsupported | Unsupported |

**Nano native resolution:** select `1K` / `2K` / `4K` with `imageSize` and the frame shape with `aspectRatio`. GPT pixel values such as `1024x1024` / `3840x2160` are not valid for Nano.
Common Nano ratios: `auto` / `1:1` / `16:9` / `9:16` / `4:3` / `3:4` / `3:2` / `2:3` / `5:4` / `4:5` / `21:9`. `nano-banana-2` and `nano-banana-2.1` also support `1:4` / `4:1` / `1:8` / `8:1`; Pro does not support these extreme ratios.

**GPT base model (`gpt-image-2`):** ratios are `auto` / `1:1` / `16:9` / `9:16` / `4:3` / `3:4` / `3:2` / `2:3` / `5:4` / `4:5` / `21:9` / `9:21` / `1:2` / `2:1`. Supported 1K pixels:
`1024x1024` · `1672x941` · `941x1672` · `1443x1090` · `1090x1443` · `1536x1024` · `1024x1536` · `1408x1120` · `1120x1408` · `1920x832` · `832x1920` · `896x1792` · `1792x896`.

**GPT VIP / flare / sunburst:** use pixels (or `auto`), not ratio strings such as `16:9`. All three accept these sizes:

| Ratio | 1K | 2K | 4K |
|-------|----|----|----|
| 1:1 | `1024x1024` | `2048x2048` | `2880x2880` |
| 16:9 | `1280x720` | `2048x1152` | `3840x2160` |
| 9:16 | `720x1280` | `1152x2048` | `2160x3840` |
| 4:3 | `1152x864` | `2304x1728` | `3264x2448` |
| 3:4 | `864x1152` | `1728x2304` | `2448x3264` |
| 3:2 | `1536x1024` | `2048x1360` | `3504x2336` |
| 2:3 | `1024x1536` | `1360x2048` | `2336x3504` |
| 5:4 | `1120x896` | `2240x1792` | `3200x2560` |
| 4:5 | `896x1120` | `1792x2240` | `2560x3200` |
| 21:9 | `1456x624` | `2912x1248` | `3840x1648` |
| 9:21 | `624x1456` | `1248x2912` | `1648x3840` |

Also supported: `688x2048` / `1280x3840` / `2048x688` / `3840x1280` / `1536x768` / `3072x1536` / `3840x1920` / `768x1536` / `1536x3072` / `1920x3840`.
VIP additionally accepts custom pixels satisfying every constraint: longest edge ≤ 3840, both edges multiples of 16, ratio ≤ 3:1, and 655,360–8,294,400 total pixels. flare / sunburst only accept the listed pixels. `4096x4096` is unsupported.

### 3.2 URLs, base64 and local files

The JSON `images` array accepts HTTP(S) image URLs, image data URLs such as `data:image/png;base64,...`, and valid raw image base64. Aliases: `image_urls` / `image_url` / `image`. Never put a local filesystem path in JSON.

**Reference image size limits** (1 MiB = 1,048,576 bytes):

- Each uploaded file or inline base64 image may contain at most **20 MiB** of original / decoded image bytes. The entire multipart request, including files, text fields and boundaries, may not exceed **32 MiB**.
- After file-to-base64 conversion, the complete JSON request, including images and all other parameters, must still fit within **32 MiB**. Base64 uses about **4/3** of the original bytes. Do not add together the 20 MiB per-image allowances: keep combined original image bytes below approximately 24 MiB and leave room for the prompt, JSON fields and other parameters. A multipart body below 32 MiB can still be rejected if its converted JSON exceeds the limit.
- Send multipart images as **file parts with a filename**, for example `-F image=@./reference.jpg`. Do not put large base64 strings in ordinary `-F image=...` text fields, which have a **64 KiB** limit. Put existing base64 strings in JSON `images` instead, subject to the same decoded-image and total JSON limits.

Oversized multipart files / request bodies or oversized complete JSON bodies return **HTTP 413** without creating a generation task. Reduce the payload or use an accessible HTTP(S) image URL before submitting again; do not retry the same oversized payload unchanged.

**Input and output sizes are separate:** a 4K reference does not imply support for 4K output. Reference uploads follow the byte limits above; choose output `size` / `imageSize` from the selected model's capabilities in §3.1. GPT base models still only support their listed 1K output sizes.

```json
{
  "model": "gpt-image-2-vip",
  "prompt": "the character from the reference holding a dog",
  "images": ["https://example.com/reference.png"],
  "size": "3840x2160",
  "quality": "medium",
  "replyType": "async"
}
```

Upload a local reference directly (let curl set the multipart Content-Type and boundary):

```bash
curl https://www.keyoapi.xyz/v1/images/edits \
  -H "Authorization: Bearer sk-..." \
  -H "Idempotency-Key: cat-edit-001" \
  -F model=nano-banana-2 \
  -F 'prompt=Preserve the identity and use a watercolor style' \
  -F image=@./reference.png \
  -F aspectRatio=16:9 \
  -F imageSize=2K \
  -F n=1 \
  -F response_format=url \
  -F replyType=async
```

Reference files are converted to base64 input. **Binary masks remain unsupported:** GPT `mask` only accepts an HTTP(S) URL; base64 masks and `-F mask=@...` are unsupported. Nano does not support `mask` at all. All image models only accept `n=1` and `response_format=url`; `b64_json` output mode and `stream=true` are unsupported.

### 3.3 Task queries and safe replay

`replyType:"async"` returns **HTTP 202** while pending, with `id` / `task_id`, task `status`, `result_url` and `billing`. An existing terminal task (for example, on idempotent replay) can return HTTP 200 (success) or HTTP 502 (task failure / unknown submission outcome) directly. `replyType:"json"` (default) waits for the result: HTTP 200 on completion, or HTTP 202 for the same task if the synchronous wait expires while it is still pending; generation continues. Query `GET /v1/images/tasks/{task_id}` with the same API Key used to submit. Do not use the video or TTS polling paths.

HTTP 202 example (`reserved` / `submitting` / `running` indicate the result has not been delivered):

```json
{
  "id": "img_00000000-0000-4000-8000-000000000001",
  "task_id": "img_00000000-0000-4000-8000-000000000001",
  "status": "running",
  "result_url": "/v1/images/tasks/img_00000000-0000-4000-8000-000000000001",
  "billing": { "charged": false, "reserved_quota": 10000, "reservation_expires_at": 1791800600 }
}
```

GET returns 202 while pending and **HTTP 200** on completion. For images, success means `status:"succeeded"` and nonempty `data[].url` (unlike video's `completed`):

```json
{
  "created": 1791800000,
  "id": "img_00000000-0000-4000-8000-000000000001",
  "task_id": "img_00000000-0000-4000-8000-000000000001",
  "status": "succeeded",
  "data": [{ "url": "https://example.com/generated.png" }],
  "billing": { "quota": 10000, "charged": true }
}
```

Billing numbers are quota units; the example is not a price quote. Quota is reserved at submission and settled once when the result response is delivered. The first successful response may show `billing.charged:false` as a snapshot before settlement; **this does not mean the image is free**. Stored results can be retrieved by GET or an idempotent POST without charging an already settled task again. A failed generation or missing valid image result is not settled and releases its reservation. Reservations expire after 600 seconds by default, while the task and result remain; retrieving an unsettled result later still requires sufficient balance. For billing questions, retain the `task_id` and contact support; this contract is not evidence that any historical charge has been refunded.

Recorded terminal task errors return HTTP 502 with `error.code`, `error.message` and `error.task_id`. Codes include `image_generation_failed` / `image_result_missing` / `image_policy_rejected` / `image_submission_rejected` / `image_submission_unknown`. For `image_submission_unknown`, retain the task ID and contact support; do not submit a new generation.

A temporary query error, `image_task_unavailable`, also returns HTTP 502 and may contain only `request_id`, without `task_id`. It does not mean the task failed: retry GET using the same saved task ID. Submission forwarding errors (`image_forwarding_failed`) may also omit `task_id`: query the original task if you have its ID; otherwise replay the original `Idempotency-Key` and parameters. Handle parameter, authentication, balance, idempotency conflict and service availability errors by their actual HTTP status (such as 400 / 401 / 403 / 409 / 503) and `error.code`; not every error is a terminal task failure with a `task_id`.

Send `Idempotency-Key` (1–128 visible ASCII characters) to identify one generation. With the same API Key, idempotency key and generation parameters, a replay retrieves the original task/result without generating a new image. Different parameters under the same key return 409. Use a fresh key only for an intentional new task.

On a synchronous timeout or disconnect, keep the original task: query it if you have `task_id`; otherwise replay the same parameters with the original `Idempotency-Key`. Do not change the key or parameters or create another generation just to recover an image.

---

## 4. Grok Imagine Video 1.5 (chat)

`POST https://www.keyoapi.xyz/v1/chat/completions` · model=`grok-video-1.5` · **$0.3082/request**

Text / single image / first & last frame / multi-reference in one endpoint; fields follow the official Grok Imagine Video API and the video link returns in the reply. Optional `duration`, `resolution` (`480p`/`720p`/`1080p`), `aspect_ratio` (e.g. `16:9`).

**Single image (pinned first frame)**
```json
{
  "model": "grok-video-1.5",
  "messages": [{"role": "user", "content": "a red paper boat drifting on calm water at sunset"}],
  "image": "https://example.com/first.jpg",
  "duration": 10,
  "resolution": "720p"
}
```

**First & last frame** (`image` pins the first frame; `last_frame` alone pins only the tail)
```json
{
  "model": "grok-video-1.5",
  "messages": [{"role": "user", "content": "camera glides from the day scene into the night skyline"}],
  "image": "https://example.com/first.jpg",
  "last_frame": "https://example.com/last.jpg"
}
```

**Multi-reference** (first frame not locked; reference via `<IMAGE_0>`, `<IMAGE_1>` in the prompt)
```json
{
  "model": "grok-video-1.5",
  "messages": [{"role": "user", "content": "the model from <IMAGE_0> wears the shirt from <IMAGE_1> and walks the runway"}],
  "reference_images": [
    {"url": "https://example.com/model.jpg"},
    {"url": "https://example.com/shirt.jpg"}
  ],
  "duration": 10,
  "aspect_ratio": "16:9"
}
```

---

## 5. Video Path B (per model)

Shared: `POST https://www.keyoapi.xyz/v1/videos/generations`
Shared poll: `GET https://www.keyoapi.xyz/v1/tasks/{task_id}`
Media: public https URLs only. For local files, use §0.5 `POST /v1/uploads` first, then paste the returned `url`.
**This section is the full video field contract for the AI** — follow each model subsection; never mix fields across models.

**Submit success (task id):**
```json
{
  "code": 200,
  "id": "task_xxx",
  "task_id": "task_xxx",
  "data": [{ "id": "task_xxx", "task_id": "task_xxx", "status": "submitted" }]
}
```
Read **`id` / `task_id` / `data[0].task_id` (any)** then poll `GET /v1/tasks/{id}`.
Terminal: `status`/`data.status` = `completed` (or `failed`).
Video: prefer top-level **`url`**, or `data.result.videos[0].url[0]` (`url` is an array). See §0.6.

### 5.0 Duration / resolution hard limits (read first)

| model | duration / seconds | resolution / size | notes |
|------|--------------------|-------------------|------|
| `MiniMax-H3` without a reference image (audio / video references allowed) | Integer **4–15** (default 5) | `768p` / `2k` (default `768p`) | `seed` unsupported |
| `MiniMax-H3` with a reference image | Integer **1–15** | `480p` / `720p` / `768p` / `1080p` / `2k` | Up to 9 `images`; `seed` available only in this mode |
| All Seedance `*-720p` / `*-1080p` | **4–15** (default 5) | in model id | `<4` or `>15` rejected |
| `wan3.0-video` | **2–30** or `-1` | e.g. `720P` | `-1` = model picks length |
| `flux-3-video` | **5–20** | `hd` / `fhd` | draft is `draft:true` (hd only), not `resolution:"draft"` |
| `gemini-omni-1.1-flash` | **do not send** | — | length ~3–10s by model |
| `gemini-omni-1.1-flash-ext` | **4/6/8/10 only** | — | omit duration when using `video_urls` |

### 5.1 MiniMax-H3

Required: `model` `prompt` `aspectRatio` `resolution` `duration`
`aspectRatio`: only `landscape` or `portrait` (aliases `16:9` / `9:16`). `square` / `1:1` is not supported.
**Choose parameters by whether the request includes a reference image:**

- **Without a reference image** (text only, or audio / video references only): `resolution` supports only `768p` / `2k`; `duration` must be an integer **4–15**; `seed` is unsupported. Omitted resolution / duration default to `768p` / 5 seconds.
- **With a reference image:** `resolution` supports `480p` / `720p` / `768p` / `1080p` / `2k`; `duration` must be an integer **1–15**; up to 9 `images`. Optional `seed` must be an integer.
- Optional `audios`: up to 3 clips. Requests without images also support `videos` references. All media must use public HTTP(S) URLs.

An image-free request with `480p` / `720p` / `1080p`, a 1–3 second or fractional duration, or `seed` returns HTTP 400. Correct the parameters before submitting again.
Do **not** send `image_with_roles` or `first_frame_image` (those are Seedance/Wan).

Submit returns `id` immediately while the video is still generating (`status=processing`). Poll `GET /v1/tasks/{id}` with the same key: `processing` while running, `completed` plus `url` when done. In-progress is not a failure.

Text-to-video:
```json
{
  "model": "MiniMax-H3",
  "prompt": "a red balloon rising slowly in a blue sky, cinematic light",
  "aspectRatio": "landscape",
  "resolution": "768p",
  "duration": 5
}
```

Reference image + audio:
```json
{
  "model": "MiniMax-H3",
  "prompt": "character speaks with the reference voice, slow push-in",
  "aspectRatio": "portrait",
  "resolution": "768p",
  "duration": 8,
  "images": ["https://example.com/char.png"],
  "audios": ["https://example.com/voice.mp3"]
}
```

### 5.2 Seedance SKUs (per-second)

Supports 4 core model IDs (`seedance-2.5`, `seedance-2.0`, `seedance-2.0-fast`, `seedance-2.0-mini`, select resolution via `resolution: "480p"|"720p"|"1080p"`), and remains backwards-compatible with fixed-resolution SKUs:

| model | sell |
|------|------|
| `seedance-2.0-1080p` | **$0.100599/sec** |
| `seedance-2.0-1080p-fast` | **$0.0754/sec** |
| `seedance-2.0-1080p-mini` | **$0.050112/sec** |
| `seedance-2.5-1080p` | **$0.137996/sec** |
| `seedance-2.0-720p` | **$0.096165/sec** |
| `seedance-2.0-720p-fast` | **$0.074794/sec** |
| `seedance-2.0-720p-mini` | **$0.049863/sec** |
| `seedance-2.5-720p` | **$0.133562/sec** |

Required: `model` `prompt`. Recommended: `duration` (or `seconds`).

**Duration hard limits (all Seedance SKUs):**
| field | range | default |
|------|------|------|
| `duration` / `seconds` | **integer 4–15** | `5` |

Values `1`/`2`/`3` or `>15` are rejected. Resolution is in the model id — usually omit `resolution`.
Modes (do not mix):
- **First frame:** `first_frame_image` (or `generation_type":"first_frame"`)
- **Reference (1 image OK):** `image_urls` / `images` — a single image is REFERENCE, not default first-frame
- **First+last:** `image_with_roles` (`first_frame`+`last_frame`)
- **Multimodal ref:** `image_urls` + `video_urls` / `audios` (**never** with `first_frame_image`)
Optional: `size` (e.g. `1280x720`), `aspect_ratio`.

Text-to-video:
```json
{
  "model": "seedance-2.0-720p-mini",
  "prompt": "A red paper boat on calm water at sunset, slow push-in",
  "duration": 5
}
```

First frame:
```json
{
  "model": "seedance-2.0-1080p-fast",
  "prompt": "Person looks up and walks forward, natural motion",
  "duration": 5,
  "first_frame_image": "https://example.com/first.jpg"
}
```

First + last frames:
```json
{
  "model": "seedance-2.5-720p",
  "prompt": "Natural transition, keep identity consistent",
  "duration": 5,
  "image_with_roles": [
    {"url": "https://example.com/a.jpg", "role": "first_frame"},
    {"url": "https://example.com/b.jpg", "role": "last_frame"}
  ]
}
```

Reference image (1 image is still REFERENCE, not first-frame):
```json
{
  "model": "seedance-2.0-720p-mini",
  "prompt": "Keep identity and clothing from the reference",
  "duration": 5,
  "image_urls": ["https://example.com/char.jpg"]
}
```

Reference image + audio (never mix with first_frame_image):
```json
{
  "model": "seedance-2.0-720p-mini",
  "prompt": "Character speaks with the reference voice, slow push-in",
  "duration": 5,
  "image_urls": ["https://example.com/char.jpg"],
  "audios": ["https://example.com/voice.mp3"]
}
```

**Forbidden:** mixing `first_frame_image` (or frame roles) with `video_urls`/`audios`; `audios` alone without images/videos.

### 5.3 wan3.0-video

`resolution`: `480P` | `720P` | `1080P`
`duration`: `2`–`30`, or `-1`
Modes: t2v; first frame (`image_urls`×1); first+last; **reference** (`generation_type":"reference"` + media); `file_url` XOR `link_url`.
**Forbidden:** mixing frame roles with reference family; both `file_url` and `link_url`.

Text-to-video:
```json
{
  "model": "wan3.0-video",
  "prompt": "A kitten running on a moonlit rooftop",
  "resolution": "720P",
  "duration": 5
}
```

First/last frames:
```json
{
  "model": "wan3.0-video",
  "prompt": "Morph between the two frames",
  "resolution": "720P",
  "duration": 5,
  "image_with_roles": [
    {"url": "https://example.com/a.jpg", "role": "first_frame"},
    {"url": "https://example.com/b.jpg", "role": "last_frame"}
  ]
}
```

Reference mode:
```json
{
  "model": "wan3.0-video",
  "prompt": "Keep identity of the reference subject",
  "resolution": "480P",
  "duration": 5,
  "generation_type": "reference",
  "image_urls": ["https://example.com/subject.jpg"],
  "video_urls": ["https://example.com/motion.mp4"]
}
```

### 5.4 flux-3-video

`duration` 5–20; `resolution` `hd`|`fhd` (or `tier` DRAFT/HD/FHD); `image_urls` 1–10; `video_url` continuation; `draft:true` hd-only; finalize with `draft_from_task_id` and **no** prompt.

Text-to-video:
```json
{
  "model": "flux-3-video",
  "prompt": "Slow push-in as a flower opens",
  "duration": 5,
  "resolution": "hd"
}
```

Keyframes (2 = first+last):
```json
{
  "model": "flux-3-video",
  "prompt": "Slow push-in as a flower opens",
  "image_urls": [
    "https://example.com/bud.jpg",
    "https://example.com/bloom.jpg"
  ],
  "duration": 5,
  "resolution": "hd"
}
```

Continue:
```json
{
  "model": "flux-3-video",
  "prompt": "Continue the motion",
  "video_url": "https://example.com/clip.mp4",
  "duration": 5,
  "resolution": "hd"
}
```

### 5.5 gemini-omni-1.1-flash

**Do not send `duration` / `seconds`.**
Also: `image_urls`, `first_frame_image`+`last_frame_image`, `video_urls`≤1 XOR `extend_from_task_id`.

Text-to-video:
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "A calm ocean at sunrise",
  "resolution": "720p",
  "aspect_ratio": "16:9"
}
```

First/last frames:
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "smooth transition, camera slowly pushes in",
  "first_frame_image": "https://example.com/start.jpg",
  "last_frame_image": "https://example.com/end.jpg",
  "resolution": "720p"
}
```

### 5.5b gemini-omni-1.1-flash-ext

`duration` must be `4`|`6`|`8`|`10`.
`generation_type` `frame` (exactly 1 image) or `reference` (0/1/3 images — **never 2**).
If `video_urls` present, omit duration.

```json
{
  "model": "gemini-omni-1.1-flash-ext",
  "prompt": "multi-subject interaction",
  "generation_type": "reference",
  "image_urls": [
    "https://example.com/a.jpg",
    "https://example.com/b.jpg",
    "https://example.com/c.jpg"
  ],
  "duration": 8,
  "resolution": "720p"
}
```

### 5.6 grok-video-1.5 → moved to the chat endpoint

Text / single image / first & last frame / multi-reference all go through `POST /v1/chat/completions` (official fields); see §4. Not part of Path B.

## 6. ASR

`POST https://www.keyoapi.xyz/v1/audio/transcriptions`
`multipart/form-data`: `model` + `file` (+ optional `language`)

```bash
curl https://www.keyoapi.xyz/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-..." \
  -F model=whisper-large-v3-turbo \
  -F language=zh \
  -F file=@./sample.wav
```

Pick model from §1.5.

---

## 7. TTS sync

`POST https://www.keyoapi.xyz/v1/audio/speech`
Models: `GLM-TTS` · `Step-Audio-TTS-3B` · `IndexTTS-2` · `eleven-v4` · `eleven-v4-turbo` · `gemini-3.8-flash-tts` (native endpoint `POST /v1beta/models/gemini-3.8-flash-tts:generateContent`)

```json
{
  "model": "GLM-TTS",
  "input": "Hello, welcome to KeyoAPI",
  "voice": "alloy"
}
```

Response is audio bytes — save to a file.

---

## 8. TTS async

`POST https://www.keyoapi.xyz/v1/async/audio/speech`
Poll: `GET /v1/task/{id}` (singular)
Models: `Qwen3-TTS` · `CosyVoice3` · `Spark-TTS-0.5B` · `Spark-TTS-0.5B:free`

```json
{
  "model": "Qwen3-TTS",
  "inputs": "Hello, welcome to KeyoAPI"
}
```

The example above performs basic text-to-speech, not voice cloning. No reference-audio enrollment or reusable voice-ID contract is documented here. Confirm the chosen model’s required clone-sample and voice fields with support before implementing cloning; do not invent `voice`, `reference_audio` or other fields.

---

## 9. OCR (Unlimited-OCR)

`POST /v1/chat/completions`

Local image: §0.5 upload first, then put returned `url` in `image_url.url`.

```json
{
  "model": "Unlimited-OCR",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Extract all text in the image"},
      {"type": "image_url", "image_url": {"url": "https://www.keyoapi.xyz/uploads/<id>.png"}}
    ]
  }]
}
```

---

## 10. Document parse (MinerU)

`POST /v1/async/documents/parse` → `GET /v1/task/{id}`

```bash
curl https://www.keyoapi.xyz/v1/async/documents/parse \
  -H "Authorization: Bearer sk-..." \
  -F model=MinerU2.5-Pro \
  -F file=@doc.pdf
```

---

## 11. Vision multipart (matting / upscale / unwarp / detect / seg / pose)

Shared: `-F model=...` + `-F image=@file` (**local files OK** — §0.5 not required)
Paths/models: §1.10.

Matting example:
```bash
curl https://www.keyoapi.xyz/v1/images/mattings \
  -H "Authorization: Bearer sk-..." \
  -F model=RMBG-2.0 \
  -F image=@photo.png
```

Upscale: use `/v1/images/upscaling` with `Real-ESRGAN` or `AnimeSharp`.

---

## 12. InfiniteTalk (image + audio → talking video)

`POST /v1/async/videos/image-to-video` → `GET /v1/task/{id}`

Multipart accepts **local files directly** (no §0.5 needed).
Upload a portrait image directly as `cond_video`; there is no need to turn it into a static video. Upload the driving audio as `cond_audio`. **Audio must be 15 seconds or shorter per job**. Split longer tracks yourself; each chunk bills as a separate request. Resolutions: **480P / 720P**; aspect ratio follows the input image. Do not blindly retry a submission that returned no task `id`.

```bash
curl https://www.keyoapi.xyz/v1/async/videos/image-to-video \
  -H "Authorization: Bearer sk-..." \
  -F model=InfiniteTalk \
  -F 'prompt=a person speaking naturally to camera, keeping identity and background stable' \
  -F cond_video=@face.png \
  -F cond_audio=@speech.wav
```

---

## 13. Moderations

`POST /v1/moderations` with JSON. Choose the input modality for the model; changing only `model` does not turn text into an image.

| Models | Input |
| --- | --- |
| `keyo-text-moderation`, `Security-semantic-filtering` | Text in `input` |
| `nsfw-classifier`, `nonescape-v0` | Image content inside `input`; see the image example below |

Text example:
```json
{"model":"keyo-text-moderation","input":"Text to review"}
```

Image example (`nonescape-v0` uses the same input envelope for AI-image detection):
```json
{"model":"nsfw-classifier","input":[{"type":"image_url","image_url":{"url":"https://example.com/image.png"}}]}
```

Keep `image_url` inside `input`, not at the request root. The image input envelope supports a public HTTP(S) URL or an image data URL. Use §0.5 for a local file. Model-specific image-size limits and score meanings are not specified here; obtain them before setting production thresholds. Do not interpret a transport success or an arbitrary score as a safety verdict.

---

## 14. List models (optional)

```bash
curl https://www.keyoapi.xyz/v1/models \
  -H "Authorization: Bearer sk-..."
```

---

## 15. AI checklist (before every call)

1. Does the model have a documented contract? Check §1 and `GET /v1/models`. Confirm §1.14 models with support before submitting; do not infer a request schema from a catalog entry.
2. Pick the correct path (chat / image / video A / video B / ASR / TTS sync|async / vision).
3. If Video Path B: open the matching §5 subsection — do not reuse another model’s fields.
4. Local media for Path B or OCR: §0.5 upload first, then paste `url`.
5. Handle async by family: images use `/v1/images/tasks/{task_id}`; HTTP 200 + `status:"succeeded"` + nonempty `data[].url` means success, and 202 means keep polling. Retry temporary query errors on the same task; handle terminal task errors per §3.3. Other async families use their `tasks` / `task` path, with `processing` while pending and `completed` / `failed` / `cancelled` at termination. Handle terminal responses returned at submission directly.
6. Return results simply to the user.
7. Do not invent field names (incl. `/v1/assets`, `asset://`).

---

## 16. Common failures → fix

| Mistake | Fix |
|---------|-----|
| MiniMax with `image_with_roles` / `first_frame_image` | Use `images` / `audios` / `aspectRatio` |
| Current `grok-video-1.5` text-to-video | Use the §4 chat request with a text content item; images are optional for text-to-video. Do not apply legacy `grok-imagine` field rules |
| Local path or base64 in video JSON | `POST /v1/uploads`, put returned `url` in JSON; or text-to-video |
| Multipart / `-F file=@` for Path B | For Path B, upload first, then JSON + `image_urls` etc.; images at `/v1/images/edits`, ASR / matting / upscale / MinerU / digital humans (InfiniteTalk / Duix-Avatar) and similar endpoints accept direct multipart using their own fields |
| Calling `POST /v1/assets` or `asset://` | **None** — use `POST /v1/uploads` (or `/v1/files`) |
| Video poll `/v1/task/` | Path B uses `/v1/tasks/` |
| TTS async poll `/v1/tasks/` | Use `/v1/task/` |
| `gemini-omni-1.1-flash` sent `duration` | Remove `duration` / `seconds` |
| `gemini-omni-1.1-flash-ext` duration | Only `4`/`6`/`8`/`10`; omit it when `video_urls` is set |

---

Pricing: https://www.keyoapi.xyz/pricing · Handbook (copy to AI): https://www.keyoapi.xyz/brand/keyo-api-ref.html · Human docs: https://www.keyoapi.xyz/brand/keyo-docs.html
