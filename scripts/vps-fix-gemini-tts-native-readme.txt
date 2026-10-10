# 修复 gemini TTS 真音频：原生 Gemini 渠道（type 24）+ /v1beta 原生协议

背景：上游 OpenAI 兼容 chat 路径返回 "[audio/wav data]" 占位符（无真音频，
已实测端到端）；上游原生 generateContent 返回真实 inline WAV。我们的
Gemini 原生中继逐字节透传响应，因此：

1. 新建/复用渠道 "Keyo Audio"（type 24，克隆主渠道 key/base_url）
2. 两个 TTS 模型（gemini-3.8-flash-tts、gemini-3.1-flash-tts-preview）
   从主渠道模型列表移除，abilities 换绑到 Keyo Audio（保留 default/vip 组）
3. 模型广场 endpoints 改为 {"gemini": "/v1beta/models/<model>:generateContent"}
4. 两个 SEO 模型页示例改为原生调用（deploy-brand-static 同步）

客户端调用方式（改后）：
  POST https://www.keyoapi.xyz/v1beta/models/gemini-3.8-flash-tts:generateContent
  Authorization: Bearer sk-...
  body: {"contents":[{"parts":[{"text":"..."}]}],
         "generationConfig":{"responseModalities":["AUDIO"],
           "speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":"Kore"}}}}}
  响应 candidates[0].content.parts[].inlineData = audio/wav base64

粘贴：scripts/vps-fix-gemini-tts-native-short.txt（一整行）
期望：
  donor <id> Keyo Primary
  audio channel created <id>      （或 reused ... added (none)）
  donor models trimmed ... removed [两个 TTS 模型]
  abilities repointed ... -> <id>
  endpoints set ... {"gemini":"/v1beta/models/...:generateContent"}
  DONE_FIX_GEMINI_TTS_NATIVE
  p38=200 p31=200
  audio_ok True b64len <几千>
  p38 native_page True · p31 native_page True
  DONE_FIX_GEMINI_TTS_NATIVE
