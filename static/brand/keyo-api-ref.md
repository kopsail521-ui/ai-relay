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
> - 异步任务按能力族判断终态：图片成功是 HTTP 200 + `status:"succeeded"` + 非空 `data[].url`（§3）；视频 / TTS / 文档解析 / InfiniteTalk 成功是 `completed`（§0.6）。尚未完成时轮询，再把结果 URL/文本交给用户。
> - 视频 Path B **只收 JSON**；其中的图/视频/音频必须是**公网 `http(s)` URL**。
> - 视频各模型的字段、模式、禁止项以本手册 **§4 / §5** 为准（用户复制本页给你即可，不必另找文档）。  
> - 用户只有本机文件时：**先** `POST /v1/uploads`（别名 `/v1/files`）拿到 `url`，再填进 Path B / OCR 的 JSON。  
> - **禁止**：JSON 中的本机路径、视频 Path B 的 `data:base64` 或直接 multipart、臆造的 `POST /v1/assets` / `asset://`；图片参考图支持 base64（§3）。
> - 图片 `/v1/images/edits` / ASR / 抠图 / 超分 / MinerU / InfiniteTalk 等 multipart 接口可直接 `-F file=@` / `-F image=@`（按各接口字段），不必先上传。
> - 完整模型列表以本手册为准；也可用 `GET /v1/models` 校验是否在售。

---

## 0. 轮询路径（禁止搞混）

| 场景 | 轮询 |
|------|------|
| 视频 Path B（`/v1/videos/generations`） | `GET /v1/tasks/{id}`（**复数 tasks**） |
| 视频 Path A（`/v1/videos`） | `GET /v1/videos/{id}` |
| TTS 异步 / 文档解析 / 数字人（InfiniteTalk / Duix-Avatar） | `GET /v1/task/{id}`（**单数 task**） |
| 图片任务 | `GET /v1/images/tasks/{task_id}`（图片专用路径） |

---

## 0.1 调用的三种形态（同一把 Key、同一余额）

- Base URL（OpenAI 形状）：`https://www.keyoapi.xyz/v1`
- Header：`Authorization: Bearer sk-...`

| 形态 | 用在什么上 | 路径示例 |
|------|-----------|----------|
| OpenAI 兼容 | 文本对话、模型列表、向量、文生图、语音识别、OCR | `POST /v1/chat/completions` · `GET /v1/models` · `POST /v1/embeddings` · `POST /v1/images/generations` · `POST /v1/audio/transcriptions` |
| OpenAI 形状（部分覆盖） | TTS 同步、内容审核 | `POST /v1/audio/speech`——覆盖 `GLM-TTS` / `Step-Audio-TTS-3B` / `IndexTTS-2` / `eleven-v4` / `eleven-v4-turbo` / `gemini-3.8-flash-tts`（见 §1.6 / §7，Gemini TTS 原生亦走 `POST /v1beta/models/...:generateContent`），其它 TTS 走异步（§1.7 / §8）；`POST /v1/moderations`——`model` + `input` 与 OpenAI 同形，响应契约见 §13 |
| 专属 REST | 视觉处理、异步视频、数字人、文档解析、系统一/结构化决策、视频工具 | 抠图/超分/展平/检测/分割/姿态（§1.10）· Path B 视频（§5）· 数字人说话视频（InfiniteTalk / Duix-Avatar，§1.11 / §12）· 文档解析 MinerU（§1.9 / §10）· 结构化决策（`POST /v1/systemone` 与 `POST /v1/decisions`，§1.11b）· 视频工具（§1.11a）——路径不同，Key 和余额相同 |

规则：换模型只改 `model`；只有能力本身不是 OpenAI 形状时，才换路径。

---

## 0.6 AI 读结果契约（所有异步统一习惯）

异步任务：**提交 → 拿到 id → 尚未完成时按族轮询 → 读 url/文本**。提交已返回成功结果或任务终态错误时直接处理；不要混轮询路径。

**图片任务（§3）：** 进行中返回 HTTP 202，`status` 为 `reserved` / `submitting` / `running`；成功为 HTTP 200 + `status:"succeeded"` + 非空 `data[].url`。已记录的任务终态错误返回 HTTP 502，含 `error.task_id`；临时查询错误不代表任务失败，应重试同一任务的 GET（详见 §3.3）。
**视频 / TTS / 文档解析 / 数字人（InfiniteTalk / Duix-Avatar）的归一状态：** `processing` | `completed` | `failed` | `cancelled`。这些接口可能仍带 `status_raw`（如 `succeeded` / `success` / `waiting`），以归一后的 `status` 为准；此规则不适用于图片任务。

| 能力族 | 提交后取 id | 轮询直到 | 结果怎么拿 |
|--------|-------------|---------|------------|
| 图片 | `id` 或 `task_id` | HTTP 200 + `status:"succeeded"` + 非空 `data[].url`；任务终态错误见 §3.3 | `data[].url` |
| 视频 Path B | `id` 或 `task_id` 或 `data[0].task_id` | `status`/`data.status` = `completed` | **`url`** 或 `data.result.videos[0].url[0]` |
| TTS 异步 / InfiniteTalk | `id` 或 `task_id` | `status` = `completed` | **`url`** 或 `output.file_url` |
| MinerU | `id` 或 `task_id` | `status` = `completed` | **`text`** 或 `output.segments[].content` |
| 视频 Path A（自动转发） | `id` | `status` = `completed` | 读 **`url`**。Path A 已无独立模型，仅作为 Path B 的自动转发入口 |
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
不用于：ASR、抠图、超分、MinerU、InfiniteTalk、Duix-Avatar（那些接口直接 multipart）。

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

赠送金（`:free` 后缀）：`Atria-dawn-v2:free` · `DeepSeek-Prover-V2-7B:free` · `deepseek-v4.1-flash-1017:free` · `glm-5.3:free` · `keyo-flash:free` · `keyo-flash2:free`

赠送金 ID（`:free` 后缀）包含上述对话模型，以及 `GLM-ASR:free`、`SenseVoiceSmall:free`（语音识别，见 §1.5）与 `Spark-TTS-0.5B:free`（语音合成，见 §1.7）。`:free` 按对应赠送金费率、优先扣赠送金（新用户一次性 $10，邀请 +$3）。完整名单与实时费率以 https://www.keyoapi.xyz/free-models 为准，会动态调整。客户端的“连接测试成功”只说明测试请求通过；流式聊天还应确认收到 `choices[].delta.content` 和结束标记 `[DONE]`。若某个付费模型返回余额不足，先核对账户余额；账户仍有余额时保留 request id 联系支持，勿反复重试。

付费：`gpt-5.6-luna` · `gpt-5.6-terra` · `gpt-5.6-sol` · `gpt-6-luna` · `gpt-6-sol` · `gpt-6-astra` · `gpt-6.1-sol` · `claude-sonnet-5` · `claude-sonnet-5-5` · `claude-opus-5` · `claude-opus-5-5` · `claude-haiku-5-5` · `claude-fable-5` · `claude-fable-5-1` · `gemini-3.7-flash` · `gemini-3.8-flash` · `gemini-4-argon` · `gemini-4-barium` · `grok-4.7` · `grok-4.6` · `minimax-m3` · `MiniMax-M3.1-Flash` · `glm-5.3` · `glm-5.3-flash` · `glm-5.2` · `deepseek-v4.1-flash` · `deepseek-v4.1-flash-1017` · `deepseek-v4-pro-0813` · `deepseek-v4-flash-0731` · `deepseek-v4-pro` · `deepseek-v4-flash` · `kimi-k3` · `kimi-k2.7-code` · `qwen3.8-flash` · `hy4-preview` · `mimo-v2.6-pro` · `mimo-v2.6-flash` · `qwen3.8-max-0902`

### 1.2 文生图 → `POST /v1/images/generations`

`gpt-image-2.5` · `gpt-image-2.5-flare` · `gpt-image-2.5-sunburst` · `gpt-image-2` · `gpt-image-2-vip` · `nano-banana-2.1` · `nano-banana-2` · `nano-banana-pro`

### 1.3 视频 Path A → `POST /v1/videos`（仅自动转发）

Path A 已无独立模型：打到这里的 wan / Seedance / FLUX / MiniMax / Gemini Omni 会自动转发到 Path B。Grok 视频改走 chat 接口（见 §4）。

### 1.4 视频 Path B → `POST /v1/videos/generations` → 轮询 `GET /v1/tasks/{id}`

`wan3.0-video` · `flux-3-video` · `MiniMax-H3` · `seedance-2.5` · `seedance-2.0` · `seedance-2.0-fast` · `seedance-2.0-mini` · `agnes-video-2.5` · `gemini-omni-1.1-flash` · `gemini-omni-1.1-flash-ext`

（字段因模型而异，见第 5 节。Seedance 亦兼容固定分辨率 SKU 如 `seedance-2.0-720p` / `seedance-2.0-1080p` 等。）

### 1.5 语音识别 ASR → `POST /v1/audio/transcriptions`（multipart）

`whisper-large-v3-turbo` · `whisper-large-v3` · `SenseVoiceSmall` · `GLM-ASR` · `MOSS-Audio-8B-Thinking`

### 1.6 TTS 同步 → `POST /v1/audio/speech`（返回音频字节）

`GLM-TTS` · `Step-Audio-TTS-3B` · `IndexTTS-2` · `eleven-v4`（$80/1M 字符） · `eleven-v4-turbo`（$40/1M 字符） · `gemini-3.8-flash-tts`（支持 Google 原生 `POST /v1beta/models/gemini-3.8-flash-tts:generateContent` 与 OpenAI 兼容语音端点）

### 1.7 TTS 异步 → `POST /v1/async/audio/speech` → 轮询 `GET /v1/task/{id}`

`Qwen3-TTS` · `CosyVoice3` · `Spark-TTS-0.5B` · `Spark-TTS-0.5B:free`（`IndexTTS-2` 也可走异步）

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

### 1.11 数字人说话视频 → 异步生成 → 轮询 `GET /v1/task/{id}`

- **图/视频+音频驱动**（`POST /v1/async/videos/image-to-video`）：`InfiniteTalk`（multipart：`model` + `prompt` + `cond_video` + `cond_audio`，约 $0.342/次）
- **音视频驱动口型同步**（`POST /v1/async/videos/audio-video-to-video`）：`Duix-Avatar`（multipart 必填：`model=Duix-Avatar`、`ref_audio` 音频文件、`ref_video` 视频文件，最长 60 秒，分档计费从 $0.0685/秒 起）

### 1.11a 视频工具（异步按秒）→ `GET /v1/task/{id}`

| 能力 | 路径 | 模型 | 售价（约） |
|------|------|------|------------|
| 硬字幕擦除（精细化） | `POST /v1/async/videos/subtitle-erase` | `subtitle-erase-pro` | **$0.018265/秒** |
| 画质增强（Pro） | `POST /v1/async/videos/enhance` | `video-enhance-pro` | 720p **$0.034247/秒** · 1080p **$0.068493/秒** · 2K **$0.136986/秒** |

JSON 提交（示例）含 `model` + 视频 URL（或平台约定的 `video_url` / `url` 字段）；按成功处理时长折算秒计费。

### 1.11b 结构化决策 → `POST /v1/systemone` 与 `POST /v1/decisions`

**System One 端点**（`POST /v1/systemone`）：
`Bespoke-Nimble-9B`（**Jev / Open-Jev** 风格，BespokeLabs 2026-09-18，底座 Qwen3.5-9B-Instruct；JSON：`model` + `state` + `questions`；约 **$0.032 / $0** 每百万 tokens。非通用对话；每字段最多 26 选项；>2048 tokens 拒绝而非截断）

`jev-1.13.0`（TypeSafe Jev System One；JSON 同上；约 **$0.0336 / $0** 每百万 tokens；上下文约 32k；不生成自由文本）

**类型化路由决策端点**（`POST /v1/decisions`）：
`cloudflare/clef`（Cloudflare 开源 27B 多模态结构化决策模型，从 **$0.063 / 1M** 输入 tokens 起，直接返回选项概率分布，免除自由生成与 JSON 解析）

```bash
curl https://www.keyoapi.xyz/v1/systemone \
  -H "Authorization: Bearer sk-你的密钥" \
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

### 1.12 内容审核 → `POST /v1/moderations`

`nonescape-v0` · `keyo-text-moderation` · `Security-semantic-filtering` · `nsfw-classifier`

### 1.13 向量（Embeddings）

| 能力 | 路径 | 模型 |
|------|------|------|
| 向量 | `POST /v1/embeddings` | `WeMM-Embedding-9B` · `WeMM-Embedding-4B` · `WeMM-Embedding-2B` · `gemini-embedding-2-preview` |

向量示例：

```json
{
  "model": "WeMM-Embedding-9B",
  "input": ["需要检索的文本"]
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

## 3. 图片生成与参考图（按型号选参数）

文生图：`POST https://www.keyoapi.xyz/v1/images/generations`，JSON。
图生图：同一接口加 `images`；本地文件可直接 `POST /v1/images/edits`，multipart。
八个型号的文生图与图生图使用同一套生成契约；参考图不会让输出尺寸字段失效。

```json
{
  "model": "nano-banana-2",
  "prompt": "一只橘猫坐在窗台上，阳光",
  "aspectRatio": "1:1",
  "imageSize": "2K",
  "n": 1,
  "response_format": "url",
  "replyType": "async"
}
```

### 3.1 逐型号能力

下表中的字段均为可选；只传该型号支持的值。`mask` 是蒙版输入，与上传参考图的 `image` 文件不同。

| model | 尺寸字段 | quality | background | mask |
|-------|----------|---------|------------|------|
| `gpt-image-2` | `size`：比例或表内 1K 像素 | `auto` | 不支持 | HTTP(S) URL |
| `gpt-image-2.5` | `size`：比例或表内 1K 像素 | `auto` | 不支持 | HTTP(S) URL |
| `gpt-image-2-vip` | `size`：约束内 1K–4K 像素或 `auto` | `medium` | `transparent` | HTTP(S) URL |
| `gpt-image-2.5-flare` | `size`：表内 1K/2K/4K 像素或 `auto` | `low` / `medium` / `high` | `transparent` | HTTP(S) URL |
| `gpt-image-2.5-sunburst` | `size`：表内 1K/2K/4K 像素或 `auto` | `low` / `medium` / `high` / `xhigh` / `max` | `transparent` | HTTP(S) URL |
| `nano-banana-2` | `aspectRatio` + `imageSize`：`1K` / `2K` / `4K` | 不支持 | 不支持 | 不支持 |
| `nano-banana-2.1` | `aspectRatio` + `imageSize`：`1K` / `2K` / `4K` | 不支持 | 不支持 | 不支持 |
| `nano-banana-pro` | `aspectRatio` + `imageSize`：`1K` / `2K` / `4K` | 不支持 | 不支持 | 不支持 |

**Nano 原生分辨率：** 用 `imageSize` 选 `1K` / `2K` / `4K`，用 `aspectRatio` 选画幅；不要套 GPT 的 `1024x1024` / `3840x2160` 像素写法。
Nano 的公共比例：`auto` / `1:1` / `16:9` / `9:16` / `4:3` / `3:4` / `3:2` / `2:3` / `5:4` / `4:5` / `21:9`；`nano-banana-2` 和 `nano-banana-2.1` 另支持 `1:4` / `4:1` / `1:8` / `8:1`，Pro 不支持这些极宽/极高比例。

**GPT 基础版（`gpt-image-2` / `gpt-image-2.5`）：** 比例为 `auto` / `1:1` / `16:9` / `9:16` / `4:3` / `3:4` / `3:2` / `2:3` / `5:4` / `4:5` / `21:9` / `9:21` / `1:2` / `2:1`。1K 像素值为：
`1024x1024` · `1672x941` · `941x1672` · `1443x1090` · `1090x1443` · `1536x1024` · `1024x1536` · `1408x1120` · `1120x1408` · `1920x832` · `832x1920` · `896x1792` · `1792x896`。

**GPT VIP / flare / sunburst：** 使用像素值（或 `auto`），不要传 `16:9` 等比例串。三者共同支持的档位如下：

| 画幅 | 1K | 2K | 4K |
|------|----|----|----|
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

另支持 `688x2048` / `1280x3840` / `2048x688` / `3840x1280` / `1536x768` / `3072x1536` / `3840x1920` / `768x1536` / `1536x3072` / `1920x3840`。
VIP 还支持满足全部约束的自定义像素：最长边 ≤ 3840、两边为 16 的倍数、长宽比 ≤ 3:1、总像素 655,360–8,294,400。flare / sunburst 只接受列出的像素值。`4096x4096` 不受支持。

### 3.2 URL、base64 与本地文件

JSON 的 `images` 数组支持 HTTP(S) 图片 URL、`data:image/png;base64,...` 等图片 data URL，以及有效图片的原始 base64；别名为 `image_urls` / `image_url` / `image`。不要把本机路径写进 JSON。

```json
{
  "model": "gpt-image-2-vip",
  "prompt": "参考图中的角色抱着一只狗",
  "images": ["https://example.com/reference.png"],
  "size": "3840x2160",
  "quality": "medium",
  "replyType": "async"
}
```

本地图直接上传（不要手动设置 multipart 的 Content-Type，curl 会生成 boundary）：

```bash
curl https://www.keyoapi.xyz/v1/images/edits \
  -H "Authorization: Bearer sk-..." \
  -H "Idempotency-Key: cat-edit-001" \
  -F model=nano-banana-2 \
  -F 'prompt=保持人物身份，改为水彩画风' \
  -F image=@./reference.png \
  -F aspectRatio=16:9 \
  -F imageSize=2K \
  -F n=1 \
  -F response_format=url \
  -F replyType=async
```

参考图文件会转换为 base64 输入。**这不代表支持二进制蒙版：** GPT 的 `mask` 只收 HTTP(S) URL；base64 mask 和 `-F mask=@...` 均未支持。Nano 完全不支持 `mask`。所有图片型号只接受 `n=1`、`response_format=url`；不支持 `b64_json` 输出模式和 `stream=true`。

### 3.3 任务查询与安全重放

`replyType:"async"` 在任务尚未完成时返回 **HTTP 202**，含 `id` / `task_id`、任务 `status`、`result_url` 和 `billing`；已有终态（如幂等重放）可直接返回 HTTP 200（成功）或 HTTP 502（任务失败 / 提交结果不确定）。`replyType:"json"`（默认）等待结果：完成返回 HTTP 200；同步等待超时且任务尚未完成时返回同一任务的 HTTP 202，任务继续运行。图片任务查询专用路径为 `GET /v1/images/tasks/{task_id}`，使用提交时同一把 API Key；不要混用视频或 TTS 的查询路径。

HTTP 202 示例（`reserved` / `submitting` / `running` 都表示尚未交付）：

```json
{
  "id": "img_00000000-0000-4000-8000-000000000001",
  "task_id": "img_00000000-0000-4000-8000-000000000001",
  "status": "running",
  "result_url": "/v1/images/tasks/img_00000000-0000-4000-8000-000000000001",
  "billing": { "charged": false, "reserved_quota": 10000, "reservation_expires_at": 1791800600 }
}
```

GET 进行中返回 202；完成返回 **HTTP 200**，以图片接口的 `status:"succeeded"` 和非空 `data[].url` 判断成功（不同于视频的 `completed`）：

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

`billing` 的数值是额度单位，示例不代表售价。提交时预留额度；结果响应交付时结算一次。首次成功响应的 `billing.charged` 可能仍为 `false`（它是结算前的快照），**不表示免费**。结果持久化，GET 或幂等 POST 可取回，已结算任务不会再次收费。失败或缺少有效图片结果时不结算图片费用并释放预留；额度预留默认 600 秒后释放，但保留任务与结果，此后取回未结算结果仍需足够余额。余额或结算有疑问时保留 `task_id` 联系支持，不要把此契约当成历史扣费已退款的证明。

已记录的任务终态错误返回 HTTP 502，错误体含 `error.code`、`error.message`、`error.task_id`。代码可为 `image_generation_failed` / `image_result_missing` / `image_policy_rejected` / `image_submission_rejected` / `image_submission_unknown`。`image_submission_unknown` 表示提交结果不确定：保留任务 ID 联系支持，不要重新生成。

临时查询错误 `image_task_unavailable` 也返回 HTTP 502，可仅含 `request_id` 而无 `task_id`，不代表任务失败；用已保存的同一任务 ID 重试 GET。提交转发错误 `image_forwarding_failed` 也可能无 `task_id`：有 ID 就查询原任务，无 ID 就用原 `Idempotency-Key` 和相同参数重放。参数、鉴权、余额、幂等冲突或服务不可用等错误按实际 HTTP 状态（如 400 / 401 / 403 / 409 / 503）和 `error.code` 处理；不能把所有错误都当成带 `task_id` 的任务终态失败。

发送 `Idempotency-Key`（1–128 个可见 ASCII 字符）可标识一次图片生成：同一把 Key、相同幂等键及相同生成参数重放时取原任务/结果，不新生成。幂等键对应不同参数时返回 409。每个有意新建的任务使用新的幂等键。

同步等待超时或连接中断时保留原任务：拿到 `task_id` 就查询该任务；没有收到响应时，用原 `Idempotency-Key` 和相同参数重放。不要为取回图片更换幂等键、修改参数或再次新建生成任务。

---

## 4. Grok Imagine Video 1.5（chat 接口）

`POST https://www.keyoapi.xyz/v1/chat/completions` · model=`grok-video-1.5` · **$0.3082/次**

文生 / 单图 / 首尾帧 / 多参考图同一个接口；字段与官方 Grok Imagine Video API 一致，视频链接随回复返回。可选 `duration`、`resolution`（`480p`/`720p`/`1080p`）、`aspect_ratio`（如 `16:9`）。

**单图（钉首帧）**
```json
{
  "model": "grok-video-1.5",
  "messages": [{"role": "user", "content": "a red paper boat drifting on calm water at sunset"}],
  "image": "https://example.com/first.jpg",
  "duration": 10,
  "resolution": "720p"
}
```

**首尾帧**（`image` 钉首帧；只传 `last_frame` 则只钉尾帧）
```json
{
  "model": "grok-video-1.5",
  "messages": [{"role": "user", "content": "camera glides from the day scene into the night skyline"}],
  "image": "https://example.com/first.jpg",
  "last_frame": "https://example.com/last.jpg"
}
```

**多参考图**（不锁首帧；prompt 里用 `<IMAGE_0>`、`<IMAGE_1>` 引用）
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

支持 4 个核心模型 ID（`seedance-2.5`、`seedance-2.0`、`seedance-2.0-fast`、`seedance-2.0-mini`，通过 `resolution` 参数指定 `480p` / `720p` / `1080p`），同时向下兼容下列固定分辨率 SKU：

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

**禁止：** `first_frame_image`（或首尾帧角色）与 `video_urls`/`audios` 混用；只有 `audios` 没有图/视频。

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

### 5.6 grok-video-1.5 → 已改走 chat 接口

文生 / 单图 / 首尾帧 / 多参考图统一走 `POST /v1/chat/completions`（字段与官方一致），见 §4。不属于 Path B。

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
模型：`GLM-TTS` · `Step-Audio-TTS-3B` · `IndexTTS-2` · `eleven-v4` · `eleven-v4-turbo` · `gemini-3.8-flash-tts`（原生端点 `POST /v1beta/models/gemini-3.8-flash-tts:generateContent`）

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
模型：`Qwen3-TTS` · `CosyVoice3` · `Spark-TTS-0.5B` · `Spark-TTS-0.5B:free`

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
`cond_video` 可以直接上传人物图片，无须先制成静态视频；`cond_audio` 上传驱动音频。**当前单任务音频最多 15 秒**。长音频需自行切段，拆片会按次计费。分辨率支持 **480P / 720P**；画幅跟随输入图。没有拿到任务 `id` 时不要盲目重试。

```bash
curl https://www.keyoapi.xyz/v1/async/videos/image-to-video \
  -H "Authorization: Bearer sk-..." \
  -F model=InfiniteTalk \
  -F 'prompt=人物自然地面对镜头口播，保持身份和背景稳定' \
  -F cond_video=@face.png \
  -F cond_audio=@speech.wav
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
5. 异步按族处理：图片用 `/v1/images/tasks/{task_id}`，HTTP 200 + `status:"succeeded"` + 非空 `data[].url` 为成功，202 继续查；临时查询错误重试同一任务，任务终态错误按 §3.3 处理。其它异步用对应 `tasks` / `task` 路径，进行中是 `processing`，终态为 `completed` / `failed` / `cancelled`。提交已返回终态时直接处理。
6. 把结果（文本、图片 URL、视频 URL、错误信息）用中文简单告诉用户。  
7. 不要编造本手册没有的字段名（含 `/v1/assets`、`asset://`）。

---

## 16. 常见失败 → 正确做法

| 现象/错误做法 | 正确做法 |
|---------------|----------|
| MiniMax 用了 `image_with_roles` / `first_frame_image` | 改用 `images` / `audios` / `aspectRatio` |
| grok-imagine 只传 prompt | 必须加 `image:{"url":"https://..."}`（本机图先 §0.5） |
| 视频 JSON 塞了本机路径或 base64 | 先 `POST /v1/uploads`，把返回的 `url` 填进 JSON；或改文生 |
| 对 Path B 用 multipart / `-F file=@` | Path B 先 uploads，再 JSON + `image_urls` 等；图片 `/v1/images/edits`、ASR/抠图/超分/MinerU/InfiniteTalk 等接口可按各自字段直接 multipart |
| 调用 `POST /v1/assets` 或 `asset://` | **没有**；用 `POST /v1/uploads`（或 `/v1/files`） |
| 视频轮询写成 `/v1/task/` | Path B 用 `/v1/tasks/` |
| TTS 异步轮询写成 `/v1/tasks/` | 用 `/v1/task/` |
| `gemini-omni-1.1-flash` 传了 `duration` | 删掉 `duration` / `seconds` |
| `gemini-omni-1.1-flash-ext` 的 duration | 只能是 `4`/`6`/`8`/`10`；有 `video_urls` 时不要传 |

---

价格与余额：控制台 https://www.keyoapi.xyz/pricing · 手册页（复制给 AI）https://www.keyoapi.xyz/brand/keyo-api-ref.html · 给人看的说明 https://www.keyoapi.xyz/brand/keyo-docs.html
