# 上架 9 个媒体模型（成本×2，CNY/7.3；复用 Keyo Video 渠道）

上游 /api/pricing 实测 2026-10-11，全部按次计费（quota_type=1，default 组）：

| 公开 ID | 上游 SKU | 成本 CNY | 售价 USD/次 | 标签 |
|---|---|---|---|---|
| keyo-super-resolution-1080p | 小裴-大模型超分-1080分辨率 | 0.2 | 0.054795 | 视频模型 |
| keyo-super-resolution-2k | 小裴-大模型超分-2k分辨率 | 0.4 | 0.109589 | 视频模型 |
| keyo-super-resolution-4k | 小裴-大模型超分-4k分辨率 | 0.8 | 0.219178 | 视频模型 |
| keyo-video-subtitle-removal | 小裴-视频去字幕 | 0.05 | 0.013699 | 视频模型 |
| grok-image-2.0 | grok-图片-2.0 | 0.01 | 0.00274 | 图片 |
| keyo-voice-clone | 【豆姐】音色复刻 | 0.05 | 0.013699 | 语音合成 |
| keyo-tts | 【豆姐】文字转语音 | 0.05 | 0.013699 | 语音合成 |
| keyo-song | 【豆姐】音频生成（歌曲生成） | 0.05 | 0.013699 | 音乐 |
| keyo-asr | 【豆姐】语音转文字 | 0.05 | 0.013699 | 语音识别 |

- 渠道：复用 Keyo Video（model_mapping 合并，既有 grok 映射保留）
- 供应商：8 个 Keyo（icon Custom）+ grok-image-2.0 xAI（icon XAI）
- 端点：4 个视频 SKU 走 /v1/videos（openai-video），其余 5 个走 /v1/chat/completions
- vendor/key 读取 /opt/ai-relay/.env 的 AICOPY_API_KEY；读不到则保留渠道现有 key

粘贴：scripts/vps-add-aicopy-media-short.txt（一整行）
期望：
  channel 1 Keyo Video models added [9 个] mapping added [9 个]
  marketplace created ×9 / vendor created（如缺失）
  price ... = $0.054795 / request (CNY 0.2 x2 / 7.3) ×9
  copy_merged ... ×2
  DONE_ADD_AICOPY_MEDIA
  pricing=200
  9 行 price + tags + vendor
  public_leak False
  ALL_OK
  DONE_ADD_AICOPY_MEDIA
