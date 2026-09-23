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
> - 视频 Path B **只收 JSON**；图/视频/音频必须是**公网 `http(s)` URL**。  
> - 视频各模型的字段、模式、禁止项以本手册 **§4 / §5** 为准（用户复制本页给你即可，不必另找文档）。  
> - 用户只有本机文件时：**先** `POST /v1/uploads`（别名 `/v1/files`）拿到 `url`，再填进 Path B / OCR 的 JSON。  
> - **禁止**：本机路径、`data:base64`、对 Path B 直接 multipart、臆造的 `POST /v1/assets` / `asset://`。  
> - ASR / 抠图 / 超分 / MinerU / InfiniteTalk 等 multipart 接口可直接 `-F file=@` / `-F image=@`，不必先上传。  
> - 完整模型列表以本手册为准；也可用 `GET /v1/models` 校验是否在售。

---

## 0. 轮询路径（禁止搞混）

| 场景 | 轮询 |
|------|------|
| 视频 Path B（`/v1/videos/generations`） | `GET /v1/tasks/{id}`（**复数 tasks**） |
| 视频 Path A（`/v1/videos`） | `GET /v1/videos/{id}` |
| TTS 异步 / 文档解析 / InfiniteTalk | `GET /v1/task/{id}`（**单数 task**） |

---

## 0.6 AI 读结果契约（所有异步统一习惯）

异步任务：**提交 → 拿到 id → 按族轮询 → 读 url/文本**。不要混轮询路径。

**统一状态词（网关已归一）：** `processing` | `completed` | `failed` | `cancelled`  
（接口可能仍带 `status_raw`，如 `succeeded` / `success` / `waiting`——以归一后的 `status` 为准。）

| 能力族 | 提交后取 id | 轮询直到 | 结果怎么拿 |
|--------|-------------|---------|------------|
| 视频 Path B | `id` 或 `task_id` 或 `data[0].task_id` | `status`/`data.status` = `completed` | **`url`** 或 `data.result.videos[0].url[0]` |
| TTS 异步 / InfiniteTalk | `id` 或 `task_id` | `status` = `completed` | **`url`** 或 `output.file_url` |
| MinerU | `id` 或 `task_id` | `status` = `completed` | **`text`** 或 `output.segments[].content` |
| 视频 Path A（grok-1.5-video） | `id` | `status` = `completed` | 读 **`url`**（与 Path B 相同）。不要再请求 `/v1/videos/{id}/content` |
| Chat / OCR | — | — | `choices[0].message.content` |
| ASR | — | — | `text` |
| TTS 同步 | — | — | **响应体就是音频字节**（不是 JSON） |
| 上传 | — | — | 响应里的 **`url`** |

Path B 轮询成功示例：
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

异步语音/视频轮询成功示例：
```json
{
  "id": "…",
  "task_id": "…",
  "status": "completed",
  "url": "https://…/out.mp3",
  "output": { "file_url": "https://…/out.mp3" }
}
```

---

## 0.5 本地素材上传（本机图/音/视频 → 公网 URL）

用于：**Path B 视频**（MiniMax / Wan / FLUX / Omni / Grok-imagine）、**Unlimited-OCR** / 多模态 chat 的 `image_url.url`。  
不用于：ASR、抠图、超分、MinerU、InfiniteTalk（那些接口直接 multipart）。

`POST https://www.keyoapi.xyz/v1/uploads`  
别名：`POST https://www.keyoapi.xyz/v1/files`  
Header：`Authorization: Bearer sk-...`  
Body：`multipart/form-data`，字段名 `file`（也接受 `image` / `audio` / `video`）

```bash
curl https://www.keyoapi.xyz/v1/uploads \
  -H "Authorization: Bearer sk-..." \
  -F file=@./still.jpg
```

成功响应示例：
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

规则：
- 把返回的 **`url`** 原样填进下游 JSON（如 `image_urls`、`images`、`video_urls`、`audios`、`image.url`）。
- 允许类型：jpg/png/webp/gif/bmp、mp3/wav/m4a/aac/ogg/flac、mp4/webm/mov/mkv、pdf。
- 默认最大约 **100MB**；文件约 **48 小时**后过期（看 `expires_at`），过期前须完成视频任务提交。
- **没有** `POST /v1/assets`，也没有 `asset://`；不要臆造。

两步调用（MiniMax-H3 参考图示例）：
```bash
# 1) 上传
URL=$(curl -s https://www.keyoapi.xyz/v1/uploads \
  -H "Authorization: Bearer sk-..." \
  -F file=@./still.jpg | jq -r .url)

# 2) 生成（JSON only）
curl https://www.keyoapi.xyz/v1/videos/generations \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"MiniMax-H3\",\"prompt\":\"人物按参考图动起来\",\"aspectRatio\":\"landscape\",\"resolution\":\"480p\",\"duration\":5,\"images\":[\"$URL\"]}"
```

其它 Path B 模型同样：上传一次，把 `url` 换成该模型字段（Wan→`image_urls`，Grok-imagine→`image.url`，FLUX→`image_urls`/`video_url`，Omni→`first_frame_image` 等）。

---

## 1. 全部模型速查（按能力）

### 1.1 文本对话 → `POST /v1/chat/completions`

免费（`*-free`）：`kimi-k3-free` · `Atria-dawn-v2`

另有一批 `:free` 对话模型（例如 `nemotron-3-ultra-550b-a55b:free`）。完整名单以 https://www.keyoapi.xyz/free-models 为准，免费模型会动态调整。

付费：`gpt-5.6-luna` · `gpt-5.6-terra` · `gpt-5.6-sol` · `gpt-6-luna` · `gpt-6-sol` · `gpt-6-astra` · `claude-sonnet-5` · `claude-opus-5` · `claude-opus-5-5` · `claude-fable-5` · `claude-fable-5-1` · `gemini-3.7-flash` · `gemini-3.8-flash` · `deepseek-v4.1-flash` · `deepseek-v4-flash-0731` · `deepseek-v4-pro-0813` · `kimi-k3` · `grok-4.7` · `grok-4.6` · `MiniMax-M3` · `gemma-4-26B-A4B-it` · `qwen3.8-max-0902`

### 1.2 文生图 → `POST /v1/images/generations`

`gpt-image-2.5` · `gpt-image-2.5-flare` · `gpt-image-2.5-sunburst` · `gpt-image-2` · `gpt-image-2-vip` · `nano-banana-2` · `nano-banana-pro`

### 1.3 视频 Path A → `POST /v1/videos` → 轮询 `GET /v1/videos/{id}`

`grok-1.5-video`

### 1.4 视频 Path B → `POST /v1/videos/generations` → 轮询 `GET /v1/tasks/{id}`

`wan3.0-video` · `flux-3-video` · `MiniMax-H3` · `gemini-omni-1.1-flash` · `gemini-omni-1.1-flash-ext` · `grok-imagine-video-1.5-preview` · `seedance-2.0-1080p` · `seedance-2.0-1080p-fast` · `seedance-2.0-1080p-mini` · `seedance-2.5-1080p` · `seedance-2.0-720p` · `seedance-2.0-720p-fast` · `seedance-2.0-720p-mini` · `seedance-2.5-720p`  

（`seedance-2.0` / `seedance-2.5` **已下架**，勿再调用。）

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

### 1.11b 系统一决策 → `POST /v1/systemone`

`Bespoke-Nimble-9B`（**Jev / Open-Jev** 风格，BespokeLabs 2026-09-18，底座 Qwen3.5-9B-Instruct；JSON：`model` + `state` + `questions`；约 **$0.032 / $0** 每百万 tokens。非通用对话；每字段最多 26 选项；>2048 tokens 拒绝而非截断）

```bash
curl https://www.keyoapi.xyz/v1/systemone \
  -H "Authorization: Bearer sk-你的密钥" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Bespoke-Nimble-9B",
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

### 1.12 内容审核 → `POST /v1/moderations`

`nonescape-v0` · `moark-text-moderation` · `keyo-text-moderation` · `Security-semantic-filtering` · `nsfw-classifier`

### 1.13 向量与重排

| 能力 | 路径 | 模型 |
|------|------|------|
| 向量 | `POST /v1/embeddings` | `WeMM-Embedding-9B` · `WeMM-Embedding-4B` · `WeMM-Embedding-2B` · `Qwen3-VL-Embedding-8B` |
| 重排 | `POST /v1/rerank` | `Qwen3-VL-Reranker-2B` · `Qwen3-VL-Reranker-8B` |

向量示例：

```json
{
  "model": "WeMM-Embedding-9B",
  "input": ["需要检索的文本"]
}
```

重排示例：

```json
{
  "model": "Qwen3-VL-Reranker-2B",
  "query": "用户问题",
  "documents": ["候选文档一", "候选文档二"]
}
```

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
（Path B `/v1/videos/generations` 也会转发到此模型。）

仅：`grok-1.5-video`  
**`seconds` 只能是 `6` 或 `10`**（不要写 1–15 任意秒）。  
`aspect_ratio` / `size` 表示画幅（如 `16:9`），**不是** 480p 分辨率档。  
可选参考图：`image_urls[0]` / `input_reference` / `image`。

```json
{
  "model": "grok-1.5-video",
  "prompt": "夕阳下红色纸船漂在平静水面上",
  "seconds": 6,
  "aspect_ratio": "16:9"
}
```

---

## 5. 视频 Path B（按模型 · 字段不同）

统一：`POST https://www.keyoapi.xyz/v1/videos/generations`  
统一轮询：`GET https://www.keyoapi.xyz/v1/tasks/{task_id}`  
媒体：只能公网 https URL。本机文件先走 §0.5 `POST /v1/uploads`，再把返回的 `url` 填入下方字段。  
**本节即 AI 调用视频的完整字段合同**——按模型小节执行，禁止跨模型套字段。

**提交成功响应（取 task id）：**
```json
{
  "code": 200,
  "id": "task_xxx",
  "task_id": "task_xxx",
  "data": [{ "id": "task_xxx", "task_id": "task_xxx", "status": "submitted" }]
}
```
读 **`id` / `task_id` / `data[0].task_id` 任一即可**，再 `GET /v1/tasks/{id}` 轮询。  
终态：`status`/`data.status` = `completed`（或 `failed`）。  
成片：**优先读顶层 `url`**，也可用 `data.result.videos[0].url[0]`（`url` 为数组）。详见 §0.6。

### 5.0 各模型时长 / 分辨率硬限制（必读）

| model | duration / seconds | resolution / size | 备注 |
|------|--------------------|-------------------|------|
| `MiniMax-H3` | **1–15**（1080p **最长 10**） | `480p` / `768p` / `1080p` | 必填 `aspectRatio` |
| Seedance 全部 `*-720p` / `*-1080p` | **4–15**（默认 5） | 写在 model id 里 | `<4` 或 `>15` 直接拒 |
| `wan3.0-video` | **2–30** 或 `-1` | 如 `720P` | `-1` = 模型自选时长 |
| `flux-3-video` | **5–20** | `hd` / `fhd` | 草稿用 `draft:true`（仅 hd），不是 `resolution:"draft"` |
| `gemini-omni-1.1-flash` | **禁止传** | — | 时长约 3–10s 由模型定 |
| `gemini-omni-1.1-flash-ext` | **仅 4/6/8/10** | — | 有 `video_urls` 时勿再传 duration |
| `grok-imagine-video-1.5-preview` | **1–15** | `480p`/`720p` | 图生为主 |
| `grok-1.5-video` | **仅 6 或 10** | Path A | 见 §4 |

### 5.1 MiniMax-H3

必填：`model` `prompt` `aspectRatio` `resolution` `duration`  
`aspectRatio`：只能是 `landscape`（横屏）或 `portrait`（竖屏）。也可用 `16:9` / `9:16`。不支持 `square` / `1:1`。
`resolution`：`480p` | `768p` | `1080p`（1080p 最长 10 秒）  
`duration`：整数 **1–15**  
可选：`images`（最多 9 张 https）、`audios`（最多 3 段）、`seed`  
**禁止**当主字段用：`image_with_roles`、`first_frame_image`（与 Seedance/Wan 不同）

提交成功会马上返回 `id`，这时视频还在生成。请用同一把 Key 轮询 `GET /v1/tasks/{id}`：进行中是 `processing`，完成是 `completed` 并带 `url`。进行中不是失败。

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

### 5.2 Seedance SKU（按秒）

旧 ID `seedance-2.0` / `seedance-2.5` **已下架**。请用下列固定分辨率 SKU（分辨率写在 model id 里，一般不必再传 `resolution`）：

| model | 售价 |
|------|------|
| `seedance-2.0-1080p` | **$0.100599/秒** |
| `seedance-2.0-1080p-fast` | **$0.0754/秒** |
| `seedance-2.0-1080p-mini` | **$0.050112/秒** |
| `seedance-2.5-1080p` | **$0.137996/秒** |
| `seedance-2.0-720p` | **$0.096165/秒** |
| `seedance-2.0-720p-fast` | **$0.074794/秒** |
| `seedance-2.0-720p-mini` | **$0.049863/秒** |
| `seedance-2.5-720p` | **$0.133562/秒** |

必填：`model` `prompt`；推荐：`duration`（或 `seconds`）。

**时长硬限制（所有 Seedance SKU 相同）：**
| 字段 | 范围 | 默认 |
|------|------|------|
| `duration` / `seconds` | **整数 4–15** | `5` |

传 `1`/`2`/`3` 或 `>15` 会直接被拒。分辨率写在 model id 里，一般不必再传 `resolution`。  
模式（勿混用）：  
- **首帧**：`first_frame_image`（或 `generation_type":"first_frame"`）  
- **参考（单图也可）**：`image_urls` / `images` —— 单张也是参考生，不是默认首帧  
- **首尾帧**：`image_with_roles`（`first_frame`+`last_frame`）  
- **参考音视频**：`image_urls` + `video_urls` / `audios`（**禁止**和 `first_frame_image` 混用）  
可选：`size`（如 `1280x720`）、`aspect_ratio`。

文生：
```json
{
  "model": "seedance-2.0-720p-mini",
  "prompt": "夕阳下红色纸船漂在平静水面上，镜头缓慢推进",
  "duration": 5
}
```

首帧：
```json
{
  "model": "seedance-2.0-1080p-fast",
  "prompt": "人物抬头并向前走，动作自然",
  "duration": 5,
  "first_frame_image": "https://example.com/first.jpg"
}
```

首尾帧：
```json
{
  "model": "seedance-2.5-720p",
  "prompt": "自然过渡并保持人物一致",
  "duration": 5,
  "image_with_roles": [
    {"url": "https://example.com/a.jpg", "role": "first_frame"},
    {"url": "https://example.com/b.jpg", "role": "last_frame"}
  ]
}
```

参考图（单图也是参考，不是首帧）：
```json
{
  "model": "seedance-2.0-720p-mini",
  "prompt": "保持参考图人物身份与服装",
  "duration": 5,
  "image_urls": ["https://example.com/char.jpg"]
}
```

参考图 + 参考音频（禁止与 first_frame_image 混用）：
```json
{
  "model": "seedance-2.0-720p-mini",
  "prompt": "人物按参考音色说话，镜头缓慢推进",
  "duration": 5,
  "image_urls": ["https://example.com/char.jpg"],
  "audios": ["https://example.com/voice.mp3"]
}
```

**禁止：** 调用已下架的 `seedance-2.0` / `seedance-2.5`；`first_frame_image`（或首尾帧角色）与 `video_urls`/`audios` 混用；只有 `audios` 没有图/视频。

### 5.3 wan3.0-video

`resolution`：`480P` | `720P` | `1080P`（可写小写，网关会归一）  
`duration`：`2`–`30`，或 `-1`（模型自选时长）  
`size` / `aspect_ratio`：`adaptive` | `16:9` | `4:3` | `1:1` | `3:4` | `9:16`  

模式（帧族与参考族互斥）：  
- **文生**：仅 prompt + resolution + duration  
- **首帧**：`image_urls` 1 张（默认帧族）  
- **首尾帧**：`image_urls` 2 张，或 `image_with_roles`  
- **参考**：必须 `generation_type":"reference"` + `image_urls` / `video_urls` / `audio_urls`（prompt 可用「图1」「视频1」）  
- **文件/网页**：`file_url` **或** `link_url`（二选一）

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
  "prompt": "视频1抱着图1，在图3的椅子上弹奏",
  "resolution": "480P",
  "duration": 5,
  "generation_type": "reference",
  "image_urls": [
    "https://example.com/a.jpg",
    "https://example.com/b.png",
    "https://example.com/c.png"
  ],
  "video_urls": ["https://example.com/role.mp4"]
}
```

**禁止：** 首尾帧角色与 `generation_type=reference` / `video_urls` / `audio_urls` / `file_url` / `link_url` 混用；同时传 `file_url` 和 `link_url`。

### 5.4 flux-3-video

`duration`：整数 `5`–`20`  
`resolution`：`hd` | `fhd`（也可用 `tier`：`DRAFT`/`HD`/`FHD`；`DRAFT`≡`draft:true`+hd）  
`aspect_ratio`：`21:9` | `2:1` | `16:9` | `4:3` | `1:1` | `3:4` | `9:16` | `auto`  
`image_urls`：1=首帧；2=首+尾；3–10=关键帧  
`video_url` / `video_urls`：续写（有视频时优先于图）  
草稿：`draft:true`（仅 hd）；成片：`draft_from_task_id` 且**不要**带 prompt

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

**禁止：** `draft:true` 配 fhd；`draft` 与 `draft_from_task_id` 同时出现；finalize 时带 prompt；`image_urls`>10。

### 5.5 gemini-omni-1.1-flash

**禁止传 `duration` / `seconds`**（时长由模型决定约 3–10s）。  
`resolution`：`360p`|`720p`|`1080p`|`4k`；`aspect_ratio`：`16:9`|`9:16`。  
可用：`image_urls`、`first_frame_image`+`last_frame_image`、`video_urls`（≤1）或 `extend_from_task_id`（与 video_urls 互斥）。

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

### 5.5b gemini-omni-1.1-flash-ext

`duration` **必须**是 `4`|`6`|`8`|`10`。  
`generation_type`：`frame`（恰好 1 张图）或 `reference`（图数量为 **0/1/3，禁止恰好 2**）。  
有 `video_urls` 时**不要**再传 duration。

```json
{
  "model": "gemini-omni-1.1-flash-ext",
  "prompt": "多主体互动",
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

**仅图生视频。** 必须有 `image.url`（公网 https）。只传 prompt 会失败。  
`aspect_ratio`：`1:1`|`16:9`|`9:16`；`resolution`：`480p`|`720p`；`duration`：1–15。

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

别名会映射：`image_url` / `image_urls[0]` / `images[0]` → `image.url`。

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
  "inputs": "你好，欢迎使用 KeyoAPI"
}
```

提交成功至少含 `id` / `task_id`。轮询到 `status=completed` 后读 **`url`** 或 `output.file_url`（§0.6）。

---

## 9. OCR（Unlimited-OCR）

`POST /v1/chat/completions`  

本机图片：先 §0.5 上传，把返回的 `url` 填进 `image_url.url`。

```json
{
  "model": "Unlimited-OCR",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "提取图中全部文字"},
      {"type": "image_url", "image_url": {"url": "https://www.keyoapi.xyz/uploads/<id>.png"}}
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

提交返回 `id`/`task_id`；轮询 `status=completed` 后读 **`text`**（或 `output.segments[].content`）。

---

## 11. 视觉 multipart（抠图 / 超分 / 展平 / 检测 / 分割 / 姿态）

统一：`-F model=...` + `-F image=@文件`（**可直接传本机文件**，不必先走 §0.5）  
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

multipart **可直接传本机文件**（不必先走 §0.5）。

```bash
curl https://www.keyoapi.xyz/v1/async/videos/image-to-video \
  -H "Authorization: Bearer sk-..." \
  -F model=InfiniteTalk \
  -F image=@face.png \
  -F audio=@speech.wav
```

提交返回 `id`/`task_id`；轮询 `status=completed` 后读 **`url`** 或 `output.file_url`。**不要**用 Path B 的 `/v1/tasks/`。

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
4. 用户要传本机图/音/视频给 Path B 或 OCR：先 §0.5 上传再填 `url`。  
5. 异步：用对 `tasks` vs `task`，轮询到归一后的 `completed` / `failed` / `cancelled`。进行中是 `processing`，不要把 `succeeded` 当成完成条件。  
6. 把结果（文本、图片 URL、视频 URL、错误信息）用中文简单告诉用户。  
7. 不要编造本手册没有的字段名（含 `/v1/assets`、`asset://`）。

---

## 16. 常见失败 → 正确做法

| 现象/错误做法 | 正确做法 |
|---------------|----------|
| MiniMax 用了 `image_with_roles` / `first_frame_image` | 改用 `images` / `audios` / `aspectRatio` |
| grok-imagine 只传 prompt | 必须加 `image:{"url":"https://..."}`（本机图先 §0.5） |
| 视频 JSON 塞了本机路径或 base64 | 先 `POST /v1/uploads`，把返回的 `url` 填进 JSON；或改文生 |
| 对 Path B 用 multipart / `-F file=@` | 先 uploads，再 JSON + `image_urls` 等；multipart 只给 ASR/抠图/InfiniteTalk |
| 调用 `POST /v1/assets` 或 `asset://` | **没有**；用 `POST /v1/uploads`（或 `/v1/files`） |
| 视频轮询写成 `/v1/task/` | Path B 用 `/v1/tasks/` |
| TTS 异步轮询写成 `/v1/tasks/` | 用 `/v1/task/` |
| `gemini-omni-1.1-flash` 传了 `duration` | 删掉 `duration` / `seconds` |
| `gemini-omni-1.1-flash-ext` 的 duration | 只能是 `4`/`6`/`8`/`10`；有 `video_urls` 时不要传 |

---

价格与余额：控制台 https://www.keyoapi.xyz/pricing · 手册页（复制给 AI）https://www.keyoapi.xyz/brand/keyo-api-ref.html · 给人看的说明 https://www.keyoapi.xyz/brand/keyo-docs.html
