# Gitee 模力方舟接入说明

26 个 Serverless 模型已按类目写入 `config/gitee-selected-models.json`，售价 = 上游成本 ×5。

## 类目

| 类目 | 模型 |
|------|------|
| 多模态对话 | gemma-4-26B-A4B-it |
| 视觉检测/分割 | VajraV1, sam3 |
| 图像处理 | AnimeSharp, Real-ESRGAN, UVDoc, RMBG-2.0 |
| 文档/OCR | MinerU2.5-Pro, Unlimited-OCR, DeepSeek-OCR-2 |
| 数字人/视频 | Duix-Avatar, InfiniteTalk |
| 语音识别 ASR | MOSS-Audio-8B-Thinking, Fun-ASR-Nano-2512, GLM-ASR, whisper-large-v3, whisper-large-v3-turbo |
| 语音合成 TTS | Qwen3-TTS, CosyVoice3, GLM-TTS, IndexTTS-2, Step-Audio-TTS-3B |
| 内容风控 | nonescape-v0, moark-text-moderation, Security-semantic-filtering, nsfw-classifier |

## 一键上线

1. `.env` 填写：
   - `GITEE_API_KEY` = 模力方舟「工作台 → 设置 → 访问令牌」
   - `NEW_API_ADMIN_PASSWORD` = New API 管理员密码
2. 启动 New API：`start-new-api.bat`
3. 创建/更新渠道并写售价：

```bat
node scripts/setup-gitee-channel.mjs
node scripts/setup-gitee-pricing.mjs
node scripts/sync-gitee-pricing-admin.mjs
```

4. （可选）自定义 CV / 异步路径透传：

```bat
services\gitee-passthrough\start.bat
```

默认监听 `http://127.0.0.1:3010`，客户仍用 New API 令牌鉴权。

## 客户怎么调

统一 Base URL：`https://你的域名/v1`（New API）

| 能力 | 路径 | 示例 model |
|------|------|------------|
| 对话 / OCR chat | `POST /v1/chat/completions` | gemma-4-26B-A4B-it, DeepSeek-OCR-2, Unlimited-OCR |
| ASR | `POST /v1/audio/transcriptions` | whisper-large-v3-turbo, GLM-ASR … |
| TTS 同步 | `POST /v1/audio/speech` | GLM-TTS, Step-Audio-TTS-3B, IndexTTS-2 |
| 风控 | `POST /v1/moderations` | nsfw-classifier, moark-text-moderation … |
| 检测/超分/抠图等 | 透传服务同路径 | VajraV1 → `/v1/images/object-detection` 等 |
| 异步文档/视频/TTS | 透传 `/v1/async/...`，轮询 `/v1/task/{id}` | MinerU2.5-Pro, InfiniteTalk, Qwen3-TTS … |

请求头建议加：`X-Failover-Enabled: true`（模力方舟故障转移）。

## 计费说明

- Token 模型：New API `ModelRatio` / `CompletionRatio`（人民币成本×5 后换算）
- 按次/页/秒/万字符等：`ModelPrice`（单位售价÷汇率）
- 上游标价为 0 的模型：按成本底价 ¥0.01×5=¥0.05 计费

官方文档：https://ai.gitee.com/docs/openapi/v1
