# KeyoAPI — Full call handbook (copy this to your AI)

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
> - For async jobs, poll until a terminal status, then return the result URL/text.  
> - Video Path B accepts **JSON only**; media must be **public `http(s)` URLs**.  
> - Per-model video fields / modes / forbidden rules are in **§4 / §5 of this handbook** (user pastes this page — do not require other docs).  
> - Local files only: **first** `POST /v1/uploads` (alias `/v1/files`) → use returned `url` in Path B / OCR JSON.  
> - **Forbidden:** local paths, `data:base64`, multipart on Path B, invented `POST /v1/assets` / `asset://`.  
> - ASR / matting / upscale / MinerU / InfiniteTalk already accept multipart `-F file=@` / `-F image=@` (no prior upload needed).  
> - Model list in this handbook is authoritative; you may also `GET /v1/models`.

---

## 0. Poll paths (do not mix)

| Case | Poll |
|------|------|
| Video Path B (`/v1/videos/generations`) | `GET /v1/tasks/{id}` (**plural tasks**) |
| Video Path A (`/v1/videos`) | `GET /v1/videos/{id}` |
| TTS async / docs / InfiniteTalk | `GET /v1/task/{id}` (**singular task**) |

---

## 0.6 AI result contract (all async)

Async flow: **submit → read id → poll by family → read url/text**. Never mix poll paths.

**Normalized status:** `processing` | `completed` | `failed` | `cancelled`  
(Upstream may keep `status_raw` like `succeeded` / `success` / `waiting` — use normalized `status`.)

| Family | Submit id | Poll until | Result |
|--------|-----------|------------|--------|
| Video Path B | `id` \| `task_id` \| `data[0].task_id` | `status`/`data.status` = `completed` | **`url`** or `data.result.videos[0].url[0]` |
| TTS async / InfiniteTalk | `id` \| `task_id` | `status` = `completed` | **`url`** or `output.file_url` |
| MinerU | `id` \| `task_id` | `status` = `completed` | **`text`** or `output.segments[].content` |
| Video Path A (`grok-1.5-video`) | `id` | `status` = `completed` | then `GET /v1/videos/{id}/content` |
| Chat / OCR | — | — | `choices[0].message.content` |
| ASR | — | — | `text` |
| TTS sync | — | — | **raw audio bytes** (not JSON) |
| Uploads | — | — | response **`url`** |

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

For: **Path B video** (MiniMax / Wan / FLUX / Omni / Grok-imagine), **Unlimited-OCR** / multimodal chat `image_url.url`.  
Not for: ASR, matting, upscale, MinerU, InfiniteTalk (those accept multipart directly).

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
- Put the returned **`url`** into downstream JSON (`image_urls`, `images`, `video_urls`, `audios`, `image.url`, …).
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

## 1. All models (by capability)

### 1.1 Chat → `POST /v1/chat/completions`

Free (`*-free`): `deepseek-v4-flash-free` · `deepseek-v4-pro-free` · `glm-5.2-free` · `kimi-k3-free`  

There is also a `:free` chat pool (for example `glm-5.3-flash:free`, `nemotron-3-ultra-550b-a55b:free`). The live list is https://www.keyoapi.xyz/free-models — upstream adds and removes IDs.  

Paid: `gpt-5.6-luna` · `gpt-5.6-terra` · `gpt-5.6-sol` · `claude-sonnet-5` · `claude-opus-5` · `claude-fable-5` · `claude-fable-5-1` · `gemini-3.7-flash` · `gemini-3.8-flash` · `deepseek-v4.1-flash` · `deepseek-v4-flash` · `deepseek-v4-pro-0813` · `kimi-k3` · `grok-4.6` · `MiniMax-M3` · `glm-5.3` · `gemma-4-26B-A4B-it` · `qwen3.8-max-0902`

### 1.2 Images → `POST /v1/images/generations`

`gpt-image-2.5` · `gpt-image-2.5-flare` · `gpt-image-2.5-sunburst` · `gpt-image-2` · `gpt-image-2-vip` · `nano-banana-2` · `nano-banana-pro`

### 1.3 Video Path A → `POST /v1/videos` → poll `GET /v1/videos/{id}`

`grok-1.5-video`

### 1.4 Video Path B → `POST /v1/videos/generations` → poll `GET /v1/tasks/{id}`

`wan3.0-video` · `flux-3-video` · `MiniMax-H3` · `gemini-omni-1.1-flash` · `gemini-omni-1.1-flash-ext` · `grok-imagine-video-1.5-preview` · `seedance-2.0-1080p` · `seedance-2.0-1080p-fast` · `seedance-2.0-1080p-mini` · `seedance-2.5-1080p` · `seedance-2.0-720p` · `seedance-2.0-720p-fast` · `seedance-2.0-720p-mini` · `seedance-2.5-720p`  

(`seedance-2.0` / `seedance-2.5` are **delisted** — do not call.)

(Fields differ by model — see §5.)

### 1.5 ASR → `POST /v1/audio/transcriptions` (multipart)

`whisper-large-v3-turbo` · `whisper-large-v3` · `Fun-ASR-Nano-2512` · `GLM-ASR` · `MOSS-Audio-8B-Thinking`

### 1.6 TTS sync → `POST /v1/audio/speech` (audio bytes)

`GLM-TTS` · `Step-Audio-TTS-3B` · `IndexTTS-2`

### 1.7 TTS async → `POST /v1/async/audio/speech` → poll `GET /v1/task/{id}`

`Qwen3-TTS` · `CosyVoice3` (`IndexTTS-2` may also use async)

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

### 1.11 Talking-head → `POST /v1/async/videos/image-to-video` → `GET /v1/task/{id}`

`InfiniteTalk` (multipart: `model` + `image` + `audio`)

### 1.12 Moderations → `POST /v1/moderations`

`nonescape-v0` · `keyo-text-moderation` · `Security-semantic-filtering` · `nsfw-classifier`

---

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

## 3. Image generation (shared template)

`POST https://www.keyoapi.xyz/v1/images/generations`

```json
{
  "model": "nano-banana-2",
  "prompt": "an orange cat on a sunny windowsill",
  "size": "1024x1024"
}
```

Pick model from §1.2.

---

## 4. Video Path A

`POST https://www.keyoapi.xyz/v1/videos` → `GET /v1/videos/{id}`  
(Path B `/v1/videos/generations` also forwards this model.)

Only: `grok-1.5-video`  
**`seconds` must be `6` or `10` only** (not arbitrary 1–15).  
`aspect_ratio` / `size` means aspect (e.g. `16:9`), **not** a 480p tier.  
Optional ref image: `image_urls[0]` / `input_reference` / `image`.

```json
{
  "model": "grok-1.5-video",
  "prompt": "A red paper boat floating on calm water at sunset",
  "seconds": 6,
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
| `MiniMax-H3` | **1–15** (1080p **max 10**) | `480p` / `768p` / `1080p` | `aspectRatio` required |
| All Seedance `*-720p` / `*-1080p` | **4–15** (default 5) | in model id | `<4` or `>15` rejected |
| `wan3.0-video` | **2–30** or `-1` | e.g. `720P` | `-1` = model picks length |
| `flux-3-video` | **5–20** | `draft`/`hd`/`fhd` | |
| `gemini-omni-1.1-flash` | **do not send** | — | length ~3–10s by model |
| `gemini-omni-1.1-flash-ext` | **4/6/8/10 only** | — | omit duration when using `video_urls` |
| `grok-imagine-video-1.5-preview` | **1–15** | `480p`/`720p` | image-to-video |
| `grok-1.5-video` | **6 or 10 only** | Path A | see §4 |

### 5.1 MiniMax-H3

Required: `model` `prompt` `aspectRatio` `resolution` `duration`  
`aspectRatio`: only `landscape` or `portrait` (aliases `16:9` / `9:16`). Upstream has no `square` / `1:1`.  
`resolution`: `480p` | `768p` | `1080p` (1080p max 10s)  
`duration`: integer **1–15**  
Optional: `images` (max 9 https URLs), `audios` (max 3), `seed`  
Do **not** send `image_with_roles` or `first_frame_image` (those are Seedance/Wan).

Submit returns `id` immediately while the video is still generating (upstream `running`). Poll `GET /v1/tasks/{id}` with the same key: `processing` while running, `completed` plus `url` when done. In-progress is not a failure.

Text-to-video:  
**Do not** use as primary: `image_with_roles`, `first_frame_image` (unlike Seedance/Wan)

Text-to-video:
```json
{
  "model": "MiniMax-H3",
  "prompt": "a red balloon rising slowly in a blue sky, cinematic light",
  "aspectRatio": "landscape",
  "resolution": "480p",
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

Legacy IDs `seedance-2.0` / `seedance-2.5` are **delisted**. Use these fixed-resolution SKUs (resolution is in the model id):

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

**Forbidden:** delisted `seedance-2.0` / `seedance-2.5`; mixing `first_frame_image` (or frame roles) with `video_urls`/`audios`; `audios` alone without images/videos.

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

### 5.6 grok-imagine-video-1.5-preview

**Image-to-video only.** `image.url` required. Prompt-only fails.  
Aliases: `image_url` / `image_urls[0]` / `images[0]` → `image.url`.

```json
{
  "model": "grok-imagine-video-1.5-preview",
  "prompt": "gentle camera push in",
  "image": {"url": "https://example.com/still.jpg"},
  "aspect_ratio": "16:9",
  "resolution": "480p",
  "duration": 5
}
```

---

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
Models: `GLM-TTS` · `Step-Audio-TTS-3B` · `IndexTTS-2`

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
Models: `Qwen3-TTS` · `CosyVoice3`

```json
{
  "model": "Qwen3-TTS",
  "input": "Hello, welcome to KeyoAPI"
}
```

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

```bash
curl https://www.keyoapi.xyz/v1/async/videos/image-to-video \
  -H "Authorization: Bearer sk-..." \
  -F model=InfiniteTalk \
  -F image=@face.png \
  -F audio=@speech.wav
```

---

## 13. Moderations

`POST /v1/moderations`

```json
{
  "model": "keyo-text-moderation",
  "input": "text to moderate"
}
```

Pick model from §1.12.

---

## 14. List models (optional)

```bash
curl https://www.keyoapi.xyz/v1/models \
  -H "Authorization: Bearer sk-..."
```

---

## 15. AI checklist (before every call)

1. Is the model name in §1? If not, `GET /v1/models` or ask the user.  
2. Pick the correct path (chat / image / video A / video B / ASR / TTS sync|async / vision).  
3. If Video Path B: open the matching §5 subsection — do not reuse another model’s fields.  
4. Local media for Path B or OCR: §0.5 upload first, then paste `url`.  
5. Async: use correct `tasks` vs `task`; poll to a terminal status.  
6. Return results simply to the user.  
7. Do not invent field names (incl. `/v1/assets`, `asset://`).

---

## 16. Common failures → fix

| Mistake | Fix |
|---------|-----|
| MiniMax with `image_with_roles` / `first_frame_image` | Use `images` / `audios` / `aspectRatio` |
| grok-imagine prompt only | Add `image:{"url":"https://..."}` (local file → §0.5 first) |
| Local path or base64 in video JSON | `POST /v1/uploads`, put returned `url` in JSON; or text-to-video |
| Multipart / `-F file=@` for Path B | Upload first, then JSON + `image_urls` etc.; multipart only for ASR / matting / InfiniteTalk |
| Calling `POST /v1/assets` or `asset://` | **None** — use `POST /v1/uploads` (or `/v1/files`) |
| Video poll `/v1/task/` | Path B uses `/v1/tasks/` |
| TTS async poll `/v1/tasks/` | Use `/v1/task/` |
| gemini-omni with `duration` | Remove `duration` |

---

Pricing: https://www.keyoapi.xyz/pricing · Handbook (copy to AI): https://www.keyoapi.xyz/brand/keyo-api-ref.html · Human docs: https://www.keyoapi.xyz/brand/keyo-docs.html
