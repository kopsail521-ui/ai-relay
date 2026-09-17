# KeyoAPI — Request shapes (copy this into your AI)

Base URL: `https://www.keyoapi.xyz/v1`  
Auth: `Authorization: Bearer sk-...`

**Poll paths (do not mix):**
- Video Path B (`/v1/videos/generations`) → `GET /v1/tasks/{task_id}` (plural **tasks**)
- TTS async / docs / InfiniteTalk → `GET /v1/task/{id}` (singular **task**)
- Video Path A (`/v1/videos`) → `GET /v1/videos/{id}`

**Media hard rule (all video Path B JSON):** only public `http(s)` URLs. Local file paths and `data:...;base64,...` are rejected.

---

## Chat (shared)

`POST /v1/chat/completions`

```json
{
  "model": "gpt-5.6-luna",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

### Unlimited-OCR (multimodal)

```json
{
  "model": "Unlimited-OCR",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Extract all text"},
      {"type": "image_url", "image_url": {"url": "https://example.com/page.png"}}
    ]
  }]
}
```

---

## Images generate (shared)

`POST /v1/images/generations`

```json
{
  "model": "nano-banana-2",
  "prompt": "a red circle on white background",
  "size": "1024x1024"
}
```

---

## Video Path A

`POST /v1/videos` → poll `GET /v1/videos/{id}`

Model: `grok-1.5-video`

```json
{
  "model": "grok-1.5-video",
  "prompt": "A red paper boat floating on calm water at sunset"
}
```

---

## Video Path B (per model)

`POST /v1/videos/generations` → poll `GET /v1/tasks/{task_id}`

### MiniMax-H3

**Required:** `model`, `prompt`, `aspectRatio`, `resolution`, `duration`  
**Use:** `aspectRatio` = `landscape`|`portrait`|`square` (aliases `16:9`/`9:16`/`1:1` OK)  
**Optional:** `images[]` (max 9), `audios[]` (max 3), `seed`  
**Do NOT use as primary:** `image_urls` / `image_with_roles` / `first_frame_image` (aliases remap, but prefer native fields)  
**1080p:** duration ≤ 10

文生:
```json
{
  "model": "MiniMax-H3",
  "prompt": "一只红气球在蓝天缓缓上升，电影感，自然光",
  "aspectRatio": "landscape",
  "resolution": "480p",
  "duration": 5
}
```

参考图+音频:
```json
{
  "model": "MiniMax-H3",
  "prompt": "人物按参考音色说话，镜头缓慢推进",
  "aspectRatio": "portrait",
  "resolution": "768p",
  "duration": 8,
  "images": ["https://example.com/char.png"],
  "audios": ["https://example.com/voice.mp3"]
}
```

### seedance-2.0 / seedance-2.5

首尾帧与 `video_urls`/`audio_urls` **互斥**。

文生:
```json
{
  "model": "seedance-2.0",
  "prompt": "A cat walking in the rain",
  "resolution": "480p",
  "duration": 5
}
```

图生:
```json
{
  "model": "seedance-2.0",
  "prompt": "Animate this scene",
  "resolution": "480p",
  "duration": 5,
  "image_urls": ["https://example.com/still.jpg"]
}
```

首尾帧:
```json
{
  "model": "seedance-2.0",
  "prompt": "Transition from day to night",
  "resolution": "480p",
  "duration": 5,
  "image_with_roles": [
    {"url": "https://example.com/day.jpg", "role": "first_frame"},
    {"url": "https://example.com/night.jpg", "role": "last_frame"}
  ]
}
```

参考视频:
```json
{
  "model": "seedance-2.0",
  "prompt": "Follow the motion of the reference clip",
  "resolution": "480p",
  "duration": 5,
  "video_urls": ["https://example.com/ref.mp4"]
}
```

### wan3.0-video

文生:
```json
{
  "model": "wan3.0-video",
  "prompt": "A kitten running on a moonlit rooftop",
  "resolution": "720P",
  "duration": 5
}
```

首尾帧:
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

参考生:
```json
{
  "model": "wan3.0-video",
  "prompt": "Keep identity of the reference subject",
  "resolution": "720P",
  "duration": 5,
  "generation_type": "reference",
  "image_urls": ["https://example.com/subject.jpg"],
  "video_urls": ["https://example.com/motion.mp4"]
}
```

### flux-3-video

文生:
```json
{
  "model": "flux-3-video",
  "prompt": "Slow push-in as a flower opens",
  "duration": 5,
  "resolution": "hd"
}
```

关键帧（2 张=首+尾）:
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

续写:
```json
{
  "model": "flux-3-video",
  "prompt": "Continue the motion",
  "video_url": "https://example.com/clip.mp4",
  "duration": 5,
  "resolution": "hd"
}
```

### gemini-omni-1.1-flash / gemini-omni-1.1-flash-ext

**No `duration` field.**

文生:
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "A calm ocean at sunrise",
  "resolution": "720p",
  "aspect_ratio": "16:9"
}
```

首尾帧:
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "smooth transition, camera slowly pushes in",
  "first_frame_image": "https://example.com/start.jpg",
  "last_frame_image": "https://example.com/end.jpg",
  "resolution": "720p"
}
```

### grok-imagine-video-1.5-preview

**Image-to-video only.** `image.url` required (public https).

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

## Speech

### ASR — multipart

`POST /v1/audio/transcriptions`  
Models: `whisper-large-v3-turbo`, `whisper-large-v3`, `Fun-ASR-Nano-2512`, `GLM-ASR`, `MOSS-Audio-8B-Thinking`

```bash
curl https://www.keyoapi.xyz/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-..." \
  -F model=whisper-large-v3-turbo \
  -F language=zh \
  -F file=@./sample.wav
```

### TTS sync — JSON → audio bytes

`POST /v1/audio/speech`  
Models: `GLM-TTS`, `Step-Audio-TTS-3B`, `IndexTTS-2`

```json
{"model": "GLM-TTS", "input": "你好", "voice": "alloy"}
```

### TTS async — JSON → poll singular task

`POST /v1/async/audio/speech` → `GET /v1/task/{id}`  
Models: `Qwen3-TTS`, `CosyVoice3`

```json
{"model": "Qwen3-TTS", "input": "你好"}
```

---

## Vision / docs / talking-head

Poll for async below: `GET /v1/task/{id}` (singular).

### Matting

`POST /v1/images/mattings` — multipart `model`, `image`  
Model: `RMBG-2.0`

### Upscale

`POST /v1/images/upscaling` — multipart `model`, `image`  
Models: `Real-ESRGAN`, `AnimeSharp`

### Unwarp

`POST /v1/images/unwarping` — multipart `model`, `image`  
Model: `UVDoc`

### Detect / Seg / Pose

- `POST /v1/images/object-detection` — `VajraV1`, `sam3`
- `POST /v1/images/segmentation` — `VajraV1`, `sam3`
- `POST /v1/images/pose-detection` — `VajraV1`  

Multipart: `model`, `image`

### Document parse

`POST /v1/async/documents/parse` → `GET /v1/task/{id}`  
Model: `MinerU2.5-Pro` — multipart `model`, `file`

### InfiniteTalk (image + audio → talking video)

`POST /v1/async/videos/image-to-video` → `GET /v1/task/{id}`  
Model: `InfiniteTalk` — multipart `model`, `image`, `audio`

---

## Common mistakes → fix

| Mistake | Fix |
|--------|-----|
| MiniMax with `image_with_roles` / `first_frame_image` | Use `images[]`, `audios[]`, `aspectRatio` |
| grok-imagine with prompt only | Add `image:{"url":"https://..."}` |
| Local path or `data:base64` in video JSON | Upload somewhere public; pass https URL |
| Poll video with `/v1/task/` | Use `/v1/tasks/` (plural) for Path B |
| Poll TTS async with `/v1/tasks/` | Use `/v1/task/` (singular) |
| Put `duration` on gemini-omni | Omit `duration` |
| Mix seedance first/last with `video_urls` | Choose one mode family |

HTML docs with clickable sections: https://www.keyoapi.xyz/brand/keyo-docs.html#video-api
