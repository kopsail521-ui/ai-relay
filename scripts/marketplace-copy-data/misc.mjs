export default {
  "Security-semantic-filtering": {
    unit: "request", per: "0.006849",
    fam: "Security 语义过滤模型",
    famEn: "Security semantic filtering model",
    feat: "基于语义理解识别违规内容，比关键词拦截更精准",
    featEn: "semantic understanding for more accurate content violation detection than keyword blocking",
    mod: "文本", modEn: "text",
    usage: "社区内容审核、评论过滤、平台安全",
    usageEn: "community moderation, comment filtering, platform safety"
  },
  "nsfw-classifier": {
    unit: "request", per: "0.006849",
    fam: "NSFW 内容分类模型",
    famEn: "NSFW content classifier",
    feat: "自动识别不适宜内容并分级，保护社区环境",
    featEn: "automatically detects and grades inappropriate content",
    mod: "图像", modEn: "image",
    usage: "图像审核、社区安全、广告合规",
    usageEn: "image moderation, community safety, advertising compliance"
  },
  "nonescape-v0": {
    unit: "request", per: "0.006849",
    fam: "Nonescape V0 内容风控模型",
    famEn: "Nonescape V0 content moderation model",
    feat: "识别敏感与违规内容，支持多种输入类型",
    featEn: "detects sensitive and violating content across input types",
    mod: "文本与图像", modEn: "text and image",
    usage: "内容审核、风险内容拦截、平台治理",
    usageEn: "content moderation, risk blocking, platform governance"
  },
  "keyo-text-moderation": {
    unit: "character", per: "0.000137",
    fam: "Keyo 文本内容审核模型",
    famEn: "Keyo's text content moderation model",
    feat: "识别色情、暴力、辱骂等风险内容，按字符计费",
    featEn: "detects profanity, violence, and abuse, billed per character",
    mod: "文本", modEn: "text",
    usage: "社交评论审核、即时通讯过滤、UGC 安全",
    usageEn: "social comment moderation, messaging filters, UGC safety"
  },
  "suno_music_open": {
    unit: "request", per: "0.003922",
    fam: "Suno 音乐生成模型",
    famEn: "Suno music generation model",
    feat: "根据文字描述生成完整歌曲，支持自定义与续写",
    featEn: "generates complete songs from text with custom and continuation modes",
    mod: "音乐", modEn: "music",
    usage: "音乐创作、背景音乐、灵感试听",
    usageEn: "music creation, background tracks, inspiration demos"
  },
  "keyo-song": {
    unit: "request", per: "0.013699",
    fam: "Keyo 歌曲生成模型",
    famEn: "Keyo's song generation model",
    feat: "从歌词或文字描述创作完整歌曲",
    featEn: "creates complete songs from lyrics or text descriptions",
    mod: "音乐", modEn: "music",
    usage: "原创音乐、短视频配乐、歌曲 demo",
    usageEn: "original music, short-video soundtracks, song demos"
  }
};