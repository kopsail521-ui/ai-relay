export default {
  "Qwen3-TTS": {
    unit: "10k_chars", per: "0.547945",
    fam: "阿里 Qwen3 TTS 语音合成模型",
    famEn: "Alibaba's Qwen3 TTS speech synthesis model",
    feat: "生成自然流畅的中英文语音，支持多种音色与风格",
    featEn: "natural Chinese and English speech with multiple voices and styles",
    mod: "音频", modEn: "audio",
    usage: "有声内容、语音助手、视频配音",
    usageEn: "audio content, voice assistants, video dubbing"
  },
  "CosyVoice3": {
    unit: "10k_chars", per: "1.369863",
    fam: "阿里 CosyVoice3 语音合成模型",
    famEn: "Alibaba's CosyVoice3 speech synthesis model",
    feat: "支持零样本音色克隆与情感表达，音质细腻",
    featEn: "zero-shot voice cloning and expressive speech with refined quality",
    mod: "音频", modEn: "audio",
    usage: "个性化语音、有声书、角色配音",
    usageEn: "personalized voice, audiobooks, character dubbing"
  },
  "IndexTTS-2": {
    unit: "10k_chars", per: "1.369863",
    fam: "IndexTTS-2 语音合成模型",
    famEn: "IndexTTS-2 speech synthesis model",
    feat: "高质量中文语音合成，支持音色克隆与精细控制",
    featEn: "high-quality Chinese TTS with voice cloning and fine-grained control",
    mod: "音频", modEn: "audio",
    usage: "有声书、配音、语音应用",
    usageEn: "audiobooks, dubbing, voice applications"
  },
  "GLM-TTS": {
    unit: "request", per: "0.013699",
    fam: "智谱 GLM TTS 语音合成模型",
    famEn: "Zhipu's GLM TTS speech synthesis model",
    feat: "快速生成自然语音，按次计费，适合批量调用",
    featEn: "fast, natural speech billed per request for batch use",
    mod: "音频", modEn: "audio",
    usage: "语音播报、客服语音、内容配音",
    usageEn: "voice announcements, support voice, content dubbing"
  },
  "Step-Audio-TTS-3B": {
    unit: "request", per: "0.013699",
    fam: "阶跃星辰 Step Audio TTS 3B 语音合成模型",
    famEn: "StepFun's Step Audio TTS 3B speech synthesis model",
    feat: "轻量高效的语音合成，支持多语言与情感变化",
    featEn: "lightweight, efficient TTS with multilingual and emotional variation",
    mod: "音频", modEn: "audio",
    usage: "语音助手、游戏配音、多媒体内容",
    usageEn: "voice assistants, game dubbing, multimedia content"
  },
  "Spark-TTS-0.5B": {
    unit: "request", per: "0",
    fam: "Spark TTS 0.5B 轻量语音合成模型",
    famEn: "Spark TTS 0.5B lightweight speech synthesis model",
    feat: "开源轻量级 TTS，音色自然，适合低成本语音场景",
    featEn: "lightweight open TTS with natural voices for low-cost speech scenarios",
    mod: "音频", modEn: "audio",
    usage: "语音提示、轻量配音、原型验证",
    usageEn: "voice prompts, lightweight dubbing, prototyping"
  },
  "keyo-voice-clone": {
    unit: "request", per: "0.013699",
    fam: "Keyo 声音克隆模型",
    famEn: "Keyo's voice cloning model",
    feat: "通过少量样本克隆音色，生成目标声音的语音内容",
    featEn: "clones a voice from a small sample and synthesizes speech in that voice",
    mod: "音频", modEn: "audio",
    usage: "个性化配音、有声内容、虚拟角色",
    usageEn: "personalized dubbing, audio content, virtual characters"
  },
  "keyo-tts": {
    unit: "request", per: "0.013699",
    fam: "Keyo 语音合成模型",
    famEn: "Keyo's text-to-speech model",
    feat: "快速文本转语音，支持多种语言与音色",
    featEn: "fast text-to-speech with multiple languages and voices",
    mod: "音频", modEn: "audio",
    usage: "语音播报、视频配音、语音助手",
    usageEn: "voice announcements, video dubbing, voice assistants"
  },
  "eleven-v4-turbo": {
    unit: "million_chars", per: "40",
    fam: "ElevenLabs Eleven V4 Turbo 语音合成模型",
    famEn: "ElevenLabs' Eleven V4 Turbo speech synthesis model",
    feat: "高速高保真语音合成，适合实时交互场景",
    featEn: "high-speed, high-fidelity speech synthesis for real-time interaction",
    mod: "音频", modEn: "audio",
    usage: "实时语音对话、直播配音、互动应用",
    usageEn: "real-time voice dialogue, live dubbing, interactive apps"
  },
  "eleven-v4": {
    unit: "million_chars", per: "80",
    fam: "ElevenLabs Eleven V4 语音合成模型",
    famEn: "ElevenLabs' Eleven V4 speech synthesis model",
    feat: "顶级自然度与角色表现力，适合专业配音",
    featEn: "top-tier naturalness and character performance for professional dubbing",
    mod: "音频", modEn: "audio",
    usage: "有声书、角色配音、影视后期",
    usageEn: "audiobooks, character dubbing, post-production"
  },
  "whisper-large-v3-turbo": {
    unit: "request", per: "0.010274",
    fam: "OpenAI Whisper Large V3 Turbo 语音识别模型",
    famEn: "OpenAI's Whisper Large v3 Turbo speech recognition model",
    feat: "在保持精度的同时显著提升转写速度",
    featEn: "much faster transcription while retaining Whisper large-model accuracy",
    mod: "音频", modEn: "audio",
    usage: "会议转写、视频字幕、语音搜索",
    usageEn: "meeting transcription, video subtitles, voice search"
  },
  "whisper-large-v3": {
    unit: "request", per: "0.010274",
    fam: "OpenAI Whisper Large V3 语音识别模型",
    famEn: "OpenAI's Whisper Large v3 speech recognition model",
    feat: "高精度多语言语音转写，抗噪能力强",
    featEn: "highly accurate multilingual transcription with strong noise robustness",
    mod: "音频", modEn: "audio",
    usage: "专业转写、字幕制作、语音分析",
    usageEn: "professional transcription, subtitling, voice analytics"
  },
  "SenseVoiceSmall": {
    unit: "request", per: "0",
    fam: "阿里 SenseVoice Small 语音识别模型",
    famEn: "Alibaba's SenseVoice Small speech recognition model",
    feat: "轻量快速的中英文语音识别，支持情感与事件检测",
    featEn: "lightweight, fast Chinese and English ASR with emotion and event detection",
    mod: "音频", modEn: "audio",
    usage: "实时语音转写、语音指令、内容审核辅助",
    usageEn: "real-time transcription, voice commands, content moderation assistance"
  },
  "GLM-ASR": {
    unit: "request", per: "0.006849",
    fam: "智谱 GLM ASR 语音识别模型",
    famEn: "Zhipu's GLM ASR speech recognition model",
    feat: "高准确率语音转文字，支持多语言与标点恢复",
    featEn: "high-accuracy speech-to-text with multilingual support and punctuation restoration",
    mod: "音频", modEn: "audio",
    usage: "会议记录、客服质检、字幕生成",
    usageEn: "meeting notes, support quality analysis, subtitle generation"
  },
  "keyo-asr": {
    unit: "request", per: "0.013699",
    fam: "Keyo 语音识别模型",
    famEn: "Keyo's speech recognition model",
    feat: "快速可靠的语音转文字服务",
    featEn: "fast, reliable speech-to-text",
    mod: "音频", modEn: "audio",
    usage: "语音输入、字幕生成、语音存档",
    usageEn: "voice input, subtitles, voice archiving"
  },
  "MOSS-Audio-8B-Thinking": {
    unit: "request", per: "0.020548",
    fam: "MOSS Audio 8B Thinking 语音理解模型",
    famEn: "MOSS Audio 8B Thinking speech understanding model",
    feat: "具备深层语音理解与推理能力，支持复杂语音任务",
    featEn: "deep speech understanding and reasoning for complex audio tasks",
    mod: "音频", modEn: "audio",
    usage: "智能语音助手、语音问答、音频分析",
    usageEn: "intelligent voice assistants, voice Q&A, audio analysis"
  },
  "Fun-ASR-Nano-2512": {
    unit: "request", per: "0.0103",
    fam: "阿里 FunASR Nano 语音识别模型",
    famEn: "Alibaba's FunASR Nano speech recognition model",
    feat: "极轻量高速的语音识别，适合端侧与大规模部署",
    featEn: "ultra-lightweight, high-speed ASR for edge and large-scale deployment",
    mod: "音频", modEn: "audio",
    usage: "实时字幕、语音搜索、IoT 语音",
    usageEn: "real-time subtitles, voice search, IoT voice"
  }
};
