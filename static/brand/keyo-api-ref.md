# KeyoAPI — 完整调用手册（复制给 AI 用）

> **给用户：** 把**整页**复制发给 AI，并写上：  
> 1）你的 API Key（`sk-...`）  
> 2）要用的模型名（从下方「全部模型」里抄）  
> 3）你想做什么（例如：用 MiniMax-H3 生成 5 秒横屏视频，提示词是……）  
> AI 会按本手册选对路径和字段并帮你调用。你不需要看懂技术细节。
>
> **给 AI：** 你是调用 KeyoAPI 的助手。严格按本手册的路径、字段、轮询方式执行。  
> - Base URL: `https://www.keyoapi.xyz/v1`  
> - Header: `Authorization: Bearer <用户提供的 key>`  
> - 先根据模型名找到所属「能力族」，再套用该族模板；视频模型必须用对应小节的字段，禁止混用。  
> - 异步任务必须轮询直到完成或失败，再把结果 URL/文本交给用户。  
> - 视频 JSON 媒体只能用公网 `http(s)` URL，禁止本机路径与 `data:base64`。  
> - 完整模型列表以本手册为准；也可用 `GET /v1/models` 校验是否在售。

---

## 0. 轮询路径（禁止搞混）

| 场景 | 轮询 |
|------|------|
| 视频 Path B（`/v1/videos/generations`） | `GET /v1/tasks/{id}`（**复数 tasks**） |
| 视频 Path A（`/v1/videos`） | `GET /v1/videos/{id}` |
| TTS 异步 / 文档解析 / InfiniteTalk | `GET /v1/task/{id}`（**单数 task**） |

---

## 1. 全部模型速查（按能力）

### 1.1 文本对话 → `POST /v1/chat/completions`

免费：`deepseek-v4-flash-free` · `deepseek-v4-pro-free` · `glm-5.2-free` · `kimi-k3-free`  

付费：`gpt-5.6-luna` · `gpt-5.6-terra` · `gpt-5.6-sol` · `claude-sonnet-5` · `claude-opus-5` · `claude-fable-5` · `claude-fable-5-1` · `gemini-3.7-flash` · `gemini-3.8-flash` · `deepseek-v4.1-flash` · `deepseek-v4-flash` · `deepseek-v4-pro-0813` · `kimi-k3` · `grok-4.6` · `MiniMax-M3` · `glm-5.3` · `gemma-4-26B-A4B-it` · `qwen3.8-max-0902`

### 1.2 文生图 → `POST /v1/images/generations`

`gpt-image-2.5` · `gpt-image-2.5-flare` · `gpt-image-2.5-sunburst` · `gpt-image-2` · `gpt-image-2-vip` · `nano-banana-2` · `nano-banana-pro`

### 1.3 视频 Path A → `POST /v1/videos` → 轮询 `GET /v1/videos/{id}`

`grok-1.5-video`

### 1.4 视频 Path B → `POST /v1/videos/generations` → 轮询 `GET /v1/tasks/{id}`

`wan3.0-video` · `seedance-2.0` · `seedance-2.5` · `flux-3-video` · `MiniMax-H3` · `gemini-omni-1.1-flash` · `gemini-omni-1.1-flash-ext` · `grok-imagine-video-1.5-preview`

（字段因模型而异，见第 5 节。）

### 1.5 语音识别 ASR → `POST /v1/audio/transcriptions`（multipart）

`whisper-large-v3-turbo` · `whisper-large-v3` · `Fun-ASR-Nano-2512` · `GLM-ASR` · `MOSS-Audio-8B-Thinking`

### 1.6 TTS 同步 → `POST /v1/audio/speech`（返回音频字节）

`GLM-TTS` · `Step-Audio-TTS-3B` · `IndexTTS-2`

### 1.7 TTS 异步 → `POST /v1/async/audio/speech` → 轮询 `GET /v1/task/{id}`

`Qwen3-TTS` · `CosyVoice3`（`IndexTTS-2` 也可走异步）

### 1.8 OCR → `POST /v1/chat/completions`（多模态 messages）

`Unlimited-OCR`

### 1.9 文档解析 → `POST /v1/async/documents/parse` → `GET /v1/task/{id}`

`MinerU2.5-Pro`

### 1.10 视觉处理（multipart）

| 能力 | 路径 | 模型 |
|------|------|------|
| 抠图 | `POST /v1/images/mattings` | `RMBG-2.0` |
| 超分 | `POST /v1/images/upscaling` | `Real-ESRGAN` · `AnimeSharp` |
| 文档展平 | `POST /v1/images/unwarping` | `UVDoc` |
| 目标检测 | `POST /v1/images/object-detection` | `VajraV1` · `sam3` |
| 分割 | `POST /v1/images/segmentation` | `VajraV1` · `sam3` |
| 姿态 | `POST /v1/images/pose-detection` | `VajraV1` |

### 1.11 数字人说话视频 → `POST /v1/async/videos/image-to-video` → `GET /v1/task/{id}`

`InfiniteTalk`（multipart：`model` + `image` + `audio`）

### 1.12 内容审核 → `POST /v1/moderations`

`nonescape-v0` · `keyo-text-moderation` · `Security-semantic-filtering` · `nsfw-classifier`

---

## 2. 文本对话（全模型共用模板）

`POST https://www.keyoapi.xyz/v1/chat/completions`  
`Content-Type: application/json`

把 `model` 换成用户指定的对话模型名。

```json
{
  "model": "gpt-5.6-luna",
  "messages": [{"role": "user", "content": "你好"}]
}
```

流式：加 `"stream": true`（若用户需要）。

---

## 3. 文生图（全模型共用模板）

`POST https://www.keyoapi.xyz/v1/images/generations`

```json
{
  "model": "nano-banana-2",
  "prompt": "一只橘猫坐在窗台上，阳光",
  "size": "1024x1024"
}
```

模型从 §1.2 选取。

---

## 4. 视频 Path A

`POST https://www.keyoapi.xyz/v1/videos` → `GET /v1/videos/{id}`

仅：`grok-1.5-video`

```json
{
  "model": "grok-1.5-video",
  "prompt": "夕阳下红色纸船漂在平静水面上"
}
```

---

## 5. 视频 Path B（按模型 · 字段不同）

统一：`POST https://www.keyoapi.xyz/v1/videos/generations`  
统一轮询：`GET https://www.keyoapi.xyz/v1/tasks/{task_id}`  
媒体：只能公网 https URL。

### 5.1 MiniMax-H3

必填：`model` `prompt` `aspectRatio` `resolution` `duration`  
`aspectRatio`：`landscape` | `portrait` | `square`（也可用 `16:9` / `9:16` / `1:1`）  
`resolution`：`480p` | `768p` | `1080p`（1080p 最长 10 秒）  
`duration`：1–15  
可选：`images`（≤9）、`audios`（≤3）、`seed`  
**禁止**当主字段用：`image_with_roles`、`first_frame_image`（与 Seedance/Wan 不同）

文生：
```json
{
  "model": "MiniMax-H3",
  "prompt": "一只红气球在蓝天缓缓上升，电影感，自然光",
  "aspectRatio": "landscape",
  "resolution": "480p",
  "duration": 5
}
```

参考图+音频：
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

### 5.2 seedance-2.0 / seedance-2.5

首尾帧 与 `video_urls`/`audio_urls` **互斥**。

文生：
```json
{
  "model": "seedance-2.0",
  "prompt": "雨中行走的猫",
  "resolution": "480p",
  "duration": 5
}
```

图生：
```json
{
  "model": "seedance-2.0",
  "prompt": "让画面动起来",
  "resolution": "480p",
  "duration": 5,
  "image_urls": ["https://example.com/still.jpg"]
}
```

首尾帧：
```json
{
  "model": "seedance-2.0",
  "prompt": "从白天过渡到夜晚",
  "resolution": "480p",
  "duration": 5,
  "image_with_roles": [
    {"url": "https://example.com/day.jpg", "role": "first_frame"},
    {"url": "https://example.com/night.jpg", "role": "last_frame"}
  ]
}
```

参考视频：
```json
{
  "model": "seedance-2.0",
  "prompt": "跟随参考片的运动",
  "resolution": "480p",
  "duration": 5,
  "video_urls": ["https://example.com/ref.mp4"]
}
```

### 5.3 wan3.0-video

文生：
```json
{
  "model": "wan3.0-video",
  "prompt": "月光屋顶上奔跑的小猫",
  "resolution": "720P",
  "duration": 5
}
```

首尾帧：
```json
{
  "model": "wan3.0-video",
  "prompt": "在两帧之间变形过渡",
  "resolution": "720P",
  "duration": 5,
  "image_with_roles": [
    {"url": "https://example.com/a.jpg", "role": "first_frame"},
    {"url": "https://example.com/b.jpg", "role": "last_frame"}
  ]
}
```

参考生：
```json
{
  "model": "wan3.0-video",
  "prompt": "保持参考主体身份一致",
  "resolution": "720P",
  "duration": 5,
  "generation_type": "reference",
  "image_urls": ["https://example.com/subject.jpg"],
  "video_urls": ["https://example.com/motion.mp4"]
}
```

### 5.4 flux-3-video

文生：
```json
{
  "model": "flux-3-video",
  "prompt": "花朵绽放，镜头缓慢推进",
  "duration": 5,
  "resolution": "hd"
}
```

关键帧（2 张=首+尾）：
```json
{
  "model": "flux-3-video",
  "prompt": "花朵绽放，镜头缓慢推进",
  "image_urls": [
    "https://example.com/bud.jpg",
    "https://example.com/bloom.jpg"
  ],
  "duration": 5,
  "resolution": "hd"
}
```

续写：
```json
{
  "model": "flux-3-video",
  "prompt": "继续运动",
  "video_url": "https://example.com/clip.mp4",
  "duration": 5,
  "resolution": "hd"
}
```

### 5.5 gemini-omni-1.1-flash / gemini-omni-1.1-flash-ext

**不要传 `duration`。**

文生：
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "平静海面日出",
  "resolution": "720p",
  "aspect_ratio": "16:9"
}
```

首尾帧：
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "平滑过渡，镜头推进",
  "first_frame_image": "https://example.com/start.jpg",
  "last_frame_image": "https://example.com/end.jpg",
  "resolution": "720p"
}
```

### 5.6 grok-imagine-video-1.5-preview

**仅图生视频。** 必须有 `image.url`（公网 https）。只传 prompt 会失败。

```json
{
  "model": "grok-imagine-video-1.5-preview",
  "prompt": "镜头轻轻推进",
  "image": {"url": "https://example.com/still.jpg"},
  "aspect_ratio": "16:9",
  "resolution": "480p",
  "duration": 5
}
```

---

## 6. 语音识别 ASR

`POST https://www.keyoapi.xyz/v1/audio/transcriptions`  
`multipart/form-data`：`model` + `file`（+ 可选 `language`）

```bash
curl https://www.keyoapi.xyz/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-..." \
  -F model=whisper-large-v3-turbo \
  -F language=zh \
  -F file=@./sample.wav
```

模型从 §1.5 选取。

---

## 7. TTS 同步

`POST https://www.keyoapi.xyz/v1/audio/speech`  
模型：`GLM-TTS` · `Step-Audio-TTS-3B` · `IndexTTS-2`

```json
{
  "model": "GLM-TTS",
  "input": "你好，欢迎使用 KeyoAPI",
  "voice": "alloy"
}
```

响应为音频字节，保存为文件即可。

---

## 8. TTS 异步

`POST https://www.keyoapi.xyz/v1/async/audio/speech`  
轮询：`GET /v1/task/{id}`（单数）  
模型：`Qwen3-TTS` · `CosyVoice3`

```json
{
  "model": "Qwen3-TTS",
  "input": "你好，欢迎使用 KeyoAPI"
}
```

---

## 9. OCR（Unlimited-OCR）

`POST /v1/chat/completions`

```json
{
  "model": "Unlimited-OCR",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "提取图中全部文字"},
      {"type": "image_url", "image_url": {"url": "https://example.com/page.png"}}
    ]
  }]
}
```

---

## 10. 文档解析 MinerU

`POST /v1/async/documents/parse` → `GET /v1/task/{id}`

```bash
curl https://www.keyoapi.xyz/v1/async/documents/parse \
  -H "Authorization: Bearer sk-..." \
  -F model=MinerU2.5-Pro \
  -F file=@doc.pdf
```

---

## 11. 视觉 multipart（抠图 / 超分 / 展平 / 检测 / 分割 / 姿态）

统一：`-F model=...` + `-F image=@文件`  
路径与模型见 §1.10。

抠图示例：
```bash
curl https://www.keyoapi.xyz/v1/images/mattings \
  -H "Authorization: Bearer sk-..." \
  -F model=RMBG-2.0 \
  -F image=@photo.png
```

超分示例：把路径换成 `/v1/images/upscaling`，模型换成 `Real-ESRGAN` 或 `AnimeSharp`。

---

## 12. InfiniteTalk（图+音频 → 说话视频）

`POST /v1/async/videos/image-to-video` → `GET /v1/task/{id}`

```bash
curl https://www.keyoapi.xyz/v1/async/videos/image-to-video \
  -H "Authorization: Bearer sk-..." \
  -F model=InfiniteTalk \
  -F image=@face.png \
  -F audio=@speech.wav
```

---

## 13. 内容审核

`POST /v1/moderations`

```json
{
  "model": "keyo-text-moderation",
  "input": "要审核的文本"
}
```

模型从 §1.12 选取。

---

## 14. 列出在售模型（可选）

```bash
curl https://www.keyoapi.xyz/v1/models \
  -H "Authorization: Bearer sk-..."
```

---

## 15. AI 执行清单（每次调用前自检）

1. 用户给的模型名是否在 §1？若否，`GET /v1/models` 核对或请用户改名。  
2. 选对路径（对话 / 图 / 视频 A / 视频 B / ASR / TTS 同步或异步 / 扩展）。  
3. 若是视频 Path B：打开 §5 对应小节，**不要**套其它模型字段。  
4. 异步：用对 `tasks` vs `task`，轮询到 `succeeded`/`failed`/`completed` 等终态。  
5. 把结果（文本、图片 URL、视频 URL、错误信息）用中文简单告诉用户。  
6. 不要编造本手册没有的字段名。

---

## 16. 常见失败 → 正确做法

| 现象/错误做法 | 正确做法 |
|---------------|----------|
| MiniMax 用了 `image_with_roles` / `first_frame_image` | 改用 `images` / `audios` / `aspectRatio` |
| grok-imagine 只传 prompt | 必须加 `image:{"url":"https://..."}` |
| 视频 JSON 塞了本机路径或 base64 | 先上传得到公网 https，再填 URL |
| 视频轮询写成 `/v1/task/` | Path B 用 `/v1/tasks/` |
| TTS 异步轮询写成 `/v1/tasks/` | 用 `/v1/task/` |
| gemini-omni 传了 `duration` | 删掉 `duration` |
| seedance 同时首尾帧 + video_urls | 只保留一种模式 |

---

价格与余额：控制台 https://www.keyoapi.xyz/pricing · 手册页（可复制）https://www.keyoapi.xyz/brand/keyo-api-ref.html · HTML 说明 https://www.keyoapi.xyz/brand/keyo-docs.html
