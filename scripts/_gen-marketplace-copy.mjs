/**
 * 模型广场多语言简介（跟随右上角语言：zhCN/zhTW/en/fr/ru/ja/vi）
 * 无人民币；计费单位元数据按语言切换
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EXTRA_MODELS, TAG_I18N } from "./marketplace-extra-i18n.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const FX = 7.3;
const LANGS = ["zhCN", "zhTW", "en", "fr", "ru", "ja", "vi"];

const cfg = JSON.parse(
  fs.readFileSync(path.join(root, "config/gitee-selected-models.json"), "utf8")
);

/** @type {Record<string, Record<string, string>>} */
const DESC = {
  VajraV1: {
    zhCN: "基于 YOLO 的实时视觉模型：目标检测、图像分割与人体关键点，适用于监控、零售与工业视觉。",
    zhTW: "基於 YOLO 的即時視覺模型：目標偵測、影像分割與人體關鍵點，適用於監控、零售與工業視覺。",
    en: "YOLO-based realtime vision: object detection, image segmentation, and human pose keypoints for monitoring, retail, and industrial CV.",
    fr: "Vision temps réel basée sur YOLO : détection d’objets, segmentation et points clés du corps pour la surveillance, le retail et l’industrie.",
    ru: "YOLO‑модель реального времени: детекция объектов, сегментация и ключевые точки тела для мониторинга, ритейла и промышленности.",
    ja: "YOLO 系リアルタイム視覚モデル。物体検出・画像分割・人体キーポイント。監視・小売・産業向け。",
    vi: "Mô hình thị giác thời gian thực dựa trên YOLO: phát hiện đối tượng, phân đoạn ảnh và điểm khớp cơ thể cho giám sát, bán lẻ và công nghiệp.",
  },
  sam3: {
    zhCN: "Meta SAM 3 开放词汇图像分割，无需预定义类别即可对任意目标做像素级 Mask。",
    zhTW: "Meta SAM 3 開放詞彙影像分割，無需預定義類別即可對任意目標做像素級 Mask。",
    en: "Meta SAM 3 open-vocabulary image segmentation — pixel-level masks for arbitrary objects without predefined classes.",
    fr: "Segmentation d’image open-vocabulary Meta SAM 3 — masques pixel pour des objets arbitraires sans classes prédéfinies.",
    ru: "Сегментация Meta SAM 3 без фиксированных классов — пиксельные маски для произвольных объектов.",
    ja: "Meta SAM 3 のオープン語彙画像分割。事前定義クラスなしで任意対象のピクセルマスクを生成。",
    vi: "Phân đoạn ảnh open-vocabulary Meta SAM 3 — mask cấp pixel cho mọi đối tượng mà không cần lớp cố định.",
  },
  AnimeSharp: {
    zhCN: "动漫/插画超分（4x-AnimeSharp/ESRGAN），放大并锐化线稿，保留二次元风格细节。",
    zhTW: "動漫/插畫超分（4x-AnimeSharp/ESRGAN），放大並銳化線稿，保留二次元風格細節。",
    en: "Anime/illustration super-resolution (4x-AnimeSharp/ESRGAN). Upscales and sharpens anime-style images while preserving line art.",
    fr: "Super-résolution anime/illustration (4x-AnimeSharp/ESRGAN). Agrandit et affine les traits tout en préservant le style.",
    ru: "Суперразрешение аниме/иллюстраций (4x-AnimeSharp/ESRGAN): увеличение и резкость с сохранением линии.",
    ja: "アニメ/イラスト超解像（4x-AnimeSharp/ESRGAN）。線画を保ちつつ拡大・シャープ化。",
    vi: "Siêu phân giải anime/minh họa (4x-AnimeSharp/ESRGAN): phóng to và làm nét, giữ nét vẽ.",
  },
  "Real-ESRGAN": {
    zhCN: "通用真实图像超分辨率，放大照片并恢复细节，输出更清晰。",
    zhTW: "通用真實影像超解析度，放大照片並還原細節，輸出更清晰。",
    en: "General real-world image super-resolution. Upscales photos and restores detail for clearer output.",
    fr: "Super-résolution d’images réelles. Agrandit les photos et restaure les détails.",
    ru: "Суперразрешение реальных фото: увеличение и восстановление деталей.",
    ja: "実写画像の汎用超解像。写真を拡大し細部を復元。",
    vi: "Siêu phân giải ảnh thật: phóng to và khôi phục chi tiết.",
  },
  UVDoc: {
    zhCN: "文档图片矫正：将弯曲、倾斜的扫描件展平，提升后续 OCR 准确率。",
    zhTW: "文件影像矯正：將彎曲、傾斜的掃描件展平，提升後續 OCR 準確率。",
    en: "Document image unwarping. Flattens curved/skewed scans to improve OCR accuracy.",
    fr: "Redressement d’images de documents. Aplatit les scans courbés/inclinés pour améliorer l’OCR.",
    ru: "Выпрямление изображений документов: убирает изгибы/перекосы для лучшего OCR.",
    ja: "文書画像の歪み補正。曲がった/傾いたスキャンを平坦化し OCR 精度を向上。",
    vi: "Chỉnh phẳng ảnh tài liệu bị cong/nghiêng để cải thiện độ chính xác OCR.",
  },
  "RMBG-2.0": {
    zhCN: "BRIA RMBG 智能抠图去背景，适用于商品图、人像与设计素材的高精度抠图。",
    zhTW: "BRIA RMBG 智慧去背，適用於商品圖、人像與設計素材的高精度去背。",
    en: "BRIA RMBG background removal. High-accuracy cutouts for product photos, portraits, and design assets.",
    fr: "Détourage BRIA RMBG. Découpes précises pour produits, portraits et assets design.",
    ru: "Удаление фона BRIA RMBG: точные вырезы для товаров, портретов и дизайна.",
    ja: "BRIA RMBG 背景除去。商品・人物・デザイン素材向け高精度切り抜き。",
    vi: "Gỡ nền BRIA RMBG: cắt nền chính xác cho ảnh sản phẩm, chân dung và tài nguyên thiết kế.",
  },
  "MinerU2.5-Pro": {
    zhCN: "复杂文档解析与 OCR：从 PDF/图片提取文字、版面、表格与结构，输出结构化结果。",
    zhTW: "複雜文件解析與 OCR：從 PDF/圖片提取文字、版面、表格與結構，輸出結構化結果。",
    en: "Complex document parsing & OCR. Extracts text, layout, tables, and structure from PDFs/images into machine-readable output.",
    fr: "Analyse documentaire et OCR. Extrait texte, mise en page, tableaux et structure depuis PDF/images.",
    ru: "Разбор сложных документов и OCR: текст, вёрстка, таблицы и структура из PDF/изображений.",
    ja: "複雑文書の解析と OCR。PDF/画像から文字・レイアウト・表・構造を抽出。",
    vi: "Phân tích tài liệu phức tạp & OCR: trích xuất chữ, bố cục, bảng và cấu trúc từ PDF/ảnh.",
  },
  "Unlimited-OCR": {
    zhCN: "面向长文档的智能 OCR，支持版面理解与结构化提取，可通过 chat/completions 调用。",
    zhTW: "面向長文件的智慧 OCR，支援版面理解與結構化提取，可透過 chat/completions 呼叫。",
    en: "Long-document OCR with layout understanding and structured extraction via chat/completions.",
    fr: "OCR pour longs documents avec compréhension de mise en page et extraction structurée via chat/completions.",
    ru: "OCR длинных документов с пониманием вёрстки и структурированным извлечением через chat/completions.",
    ja: "長文書向け OCR。レイアウト理解と構造化抽出。chat/completions で呼び出し可能。",
    vi: "OCR tài liệu dài với hiểu bố cục và trích xuất có cấu trúc qua chat/completions.",
  },
  "Duix-Avatar": {
    zhCN: "音频+视频驱动的数字人（异步），生成口型同步与表情互动，适合虚拟角色说话场景。",
    zhTW: "音訊+視訊驅動的數位人（非同步），產生口型同步與表情互動，適合虛擬角色說話場景。",
    en: "Audio+video driven digital human (async). Lip-sync and expression generation for talking avatars.",
    fr: "Humain digital audio+vidéo (async). Synchronisation labiale et expressions pour avatars parlants.",
    ru: "Цифровой человек по аудио+видео (async): липсинк и мимика для говорящих аватаров.",
    ja: "音声+映像駆動のデジタルヒューマン（非同期）。口パク同期と表情生成。",
    vi: "Người số điều khiển bởi audio+video (async): đồng bộ miệng và biểu cảm cho avatar nói chuyện.",
  },
  InfiniteTalk: {
    zhCN: "音频驱动的数字人讲述视频（异步）：图/视频 + 音频生成自然口型与肢体动作，时长跟随音频。",
    zhTW: "音訊驅動的數位人講述影片（非同步）：圖/影片 + 音訊產生自然口型與肢體動作，時長跟隨音訊。",
    en: "Audio-driven talking-head video from an image/video (async). Natural lip-sync and body motion; duration follows the input audio.",
    fr: "Vidéo talking-head pilotée par l’audio (async) à partir d’image/vidéo. Sync labiale et mouvements ; durée = audio.",
    ru: "Видео говорящей головы по аудио (async) из изображения/видео. Липсинк и жесты; длительность = аудио.",
    ja: "音声駆動のトーキングヘッド動画（非同期）。画像/動画+音声で自然な口パクと動作。尺は音声に追従。",
    vi: "Video talking-head điều khiển bởi audio (async) từ ảnh/video. Đồng bộ miệng & cử động; thời lượng theo audio.",
  },
  "MOSS-Audio-8B-Thinking": {
    zhCN: "具备语音理解与推理的音频大模型，可转写并分析多人对话，适用于会议与语音交互。",
    zhTW: "具備語音理解與推理的音訊大模型，可轉寫並分析多人對話，適用於會議與語音互動。",
    en: "Audio understanding & reasoning ASR. Transcribes speech and analyzes multi-speaker dialogue for meetings and voice apps.",
    fr: "ASR avec compréhension et raisonnement audio. Transcrit et analyse les dialogues multi-locuteurs.",
    ru: "Аудио‑LLM с пониманием и рассуждением: транскрипция и анализ многоспикерных диалогов.",
    ja: "音声理解・推論 ASR。会議や音声アプリ向けに多話者対話を書き起こし・分析。",
    vi: "ASR hiểu & suy luận âm thanh: chuyển lời nói và phân tích hội thoại nhiều người.",
  },
  "Fun-ASR-Nano-2512": {
    zhCN: "轻量多语言语音识别，低延迟，适合实时转写、会议记录与语音交互。",
    zhTW: "輕量多語語音辨識，低延遲，適合即時轉寫、會議紀錄與語音互動。",
    en: "Lightweight multilingual ASR with low latency. Suited for realtime transcription, meetings, and voice UX.",
    fr: "ASR multilingue léger à faible latence. Idéal pour transcription temps réel, réunions et UX vocale.",
    ru: "Лёгкий многоязычный ASR с низкой задержкой для реалтайм‑транскрипции и встреч.",
    ja: "軽量多言語 ASR。低遅延でリアルタイム書起こし・会議・音声 UX 向け。",
    vi: "ASR đa ngôn ngữ nhẹ, độ trễ thấp: chuyển lời thời gian thực, họp và UX thoại.",
  },
  "GLM-ASR": {
    zhCN: "超轻量中文语音识别，适合端侧/低资源场景的实时转写。",
    zhTW: "超輕量中文語音辨識，適合端側/低資源場景的即時轉寫。",
    en: "Compact Chinese ASR for realtime transcription on constrained devices and edge deployments.",
    fr: "ASR chinois compact pour transcription temps réel sur appareils contraints / edge.",
    ru: "Компактный китайский ASR для реалтайм‑транскрипции на слабых/edge устройствах.",
    ja: "超軽量中国語 ASR。低リソース/エッジ向けリアルタイム書起こし。",
    vi: "ASR tiếng Trung siêu nhẹ cho chuyển lời thời gian thực trên thiết bị hạn chế/edge.",
  },
  "whisper-large-v3": {
    zhCN: "OpenAI Whisper Large V3 高精度多语种语音转写，适用于转录与语音应用。",
    zhTW: "OpenAI Whisper Large V3 高精度多語語音轉寫，適用於轉錄與語音應用。",
    en: "OpenAI Whisper Large V3 multilingual speech-to-text for accurate transcription and voice applications.",
    fr: "OpenAI Whisper Large V3 — speech-to-text multilingue précis pour transcription et apps vocales.",
    ru: "OpenAI Whisper Large V3 — точная многоязычная речь→текст для транскрипции и голосовых приложений.",
    ja: "OpenAI Whisper Large V3。高精度多言語音声認識。書起こし・音声アプリ向け。",
    vi: "OpenAI Whisper Large V3: speech-to-text đa ngôn ngữ chính xác cho chép lời và ứng dụng thoại.",
  },
  "whisper-large-v3-turbo": {
    zhCN: "Whisper Large V3 Turbo：更快的多语种语音转写，在准确度与延迟之间更均衡。",
    zhTW: "Whisper Large V3 Turbo：更快的多語語音轉寫，在準確度與延遲之間更均衡。",
    en: "Faster Whisper Large V3 Turbo speech-to-text. Strong multilingual accuracy with lower latency.",
    fr: "Whisper Large V3 Turbo plus rapide. Bonne précision multilingue avec latence réduite.",
    ru: "Более быстрый Whisper Large V3 Turbo: сильная многоязычная точность при меньшей задержке.",
    ja: "Whisper Large V3 Turbo。より高速な多言語音声認識。精度と遅延のバランスが良い。",
    vi: "Whisper Large V3 Turbo nhanh hơn: độ chính xác đa ngôn ngữ tốt, độ trễ thấp hơn.",
  },
  "Qwen3-TTS": {
    zhCN: "通义 Qwen3 文本转语音（异步），自然多语言合成，支持短样本快速音色克隆。",
    zhTW: "通義 Qwen3 文字轉語音（非同步），自然多語合成，支援短樣本快速音色克隆。",
    en: "Qwen3 text-to-speech (async). Natural multilingual synthesis with quick voice cloning from short samples.",
    fr: "Qwen3 text-to-speech (async). Synthèse multilingue naturelle et clonage de voix rapide.",
    ru: "Qwen3 TTS (async): естественный многоязычный синтез и быстрый клон голоса по короткому сэмплу.",
    ja: "Qwen3 テキスト音声合成（非同期）。自然な多言語合成と短サンプルの声クローン。",
    vi: "Qwen3 text-to-speech (async): tổng hợp đa ngôn ngữ tự nhiên và clone giọng nhanh từ mẫu ngắn.",
  },
  CosyVoice3: {
    zhCN: "CosyVoice 3 多语言零样本 TTS，支持流式、方言及情绪/语速等控制。",
    zhTW: "CosyVoice 3 多語零樣本 TTS，支援串流、方言及情緒/語速等控制。",
    en: "CosyVoice 3 multilingual zero-shot TTS with streaming, dialects, and controls for emotion/speed.",
    fr: "CosyVoice 3 TTS zero-shot multilingue avec streaming, dialectes et contrôle émotion/vitesse.",
    ru: "CosyVoice 3 многоязычный zero-shot TTS: стриминг, диалекты, контроль эмоций/темпа.",
    ja: "CosyVoice 3 多言語ゼロショット TTS。ストリーミング・方言・感情/速度制御。",
    vi: "CosyVoice 3 TTS zero-shot đa ngôn ngữ: streaming, phương ngữ, điều khiển cảm xúc/tốc độ.",
  },
  "GLM-TTS": {
    zhCN: "智谱 GLM 文本转语音，支持零样本音色克隆、情感控制与低延迟合成。",
    zhTW: "智譜 GLM 文字轉語音，支援零樣本音色克隆、情感控制與低延遲合成。",
    en: "GLM text-to-speech with zero-shot voice clone, emotion control, and low-latency synthesis.",
    fr: "GLM text-to-speech avec clonage zero-shot, contrôle d’émotion et synthèse faible latence.",
    ru: "GLM TTS: zero-shot клон голоса, контроль эмоций и низкая задержка.",
    ja: "GLM テキスト音声合成。ゼロショット声クローン、感情制御、低遅延。",
    vi: "GLM text-to-speech: clone giọng zero-shot, điều khiển cảm xúc và độ trễ thấp.",
  },
  "IndexTTS-2": {
    zhCN: "IndexTTS 零样本 TTS，可通过音频或文本提示控制音色、情感与语气。",
    zhTW: "IndexTTS 零樣本 TTS，可透過音訊或文字提示控制音色、情感與語氣。",
    en: "IndexTTS zero-shot TTS with timbre, emotion, and tone control via audio or text prompts.",
    fr: "IndexTTS TTS zero-shot avec contrôle timbre/émotion/ton via audio ou texte.",
    ru: "IndexTTS zero-shot TTS: тембр, эмоции и тон через аудио или текстовые подсказки.",
    ja: "IndexTTS ゼロショット TTS。音声/テキスト指示で音色・感情・口調を制御。",
    vi: "IndexTTS TTS zero-shot: điều khiển âm sắc, cảm xúc và giọng điệu qua audio hoặc text.",
  },
  "Step-Audio-TTS-3B": {
    zhCN: "Step-Audio TTS 3B 自然语言合成，支持多种语音风格与口音。",
    zhTW: "Step-Audio TTS 3B 自然語言合成，支援多種語音風格與口音。",
    en: "Step-Audio TTS 3B natural speech synthesis with multiple styles and accents.",
    fr: "Step-Audio TTS 3B — synthèse vocale naturelle avec styles et accents multiples.",
    ru: "Step-Audio TTS 3B: естественный синтез речи с разными стилями и акцентами.",
    ja: "Step-Audio TTS 3B。自然な音声合成。多様なスタイルとアクセント。",
    vi: "Step-Audio TTS 3B: tổng hợp giọng nói tự nhiên với nhiều phong cách và giọng địa phương.",
  },
  "nonescape-v0": {
    zhCN: "AI 生成图检测：判断图片是真实拍摄还是模型生成。",
    zhTW: "AI 生成圖偵測：判斷圖片是真實拍攝還是模型生成。",
    en: "AI-generated image detector. Classifies whether an image is camera-captured or model-generated.",
    fr: "Détecteur d’images générées par IA. Distingue photo réelle et image synthétique.",
    ru: "Детектор AI‑изображений: реальная съёмка или сгенерировано моделью.",
    ja: "AI 生成画像検出。実写かモデル生成かを判定。",
    vi: "Phát hiện ảnh AI: phân biệt ảnh máy ảnh thật và ảnh do mô hình tạo.",
  },
  "moark-text-moderation": {
    zhCN: "文本内容审核：识别色情、暴力、辱骂等风险，适用于社交、评论与即时通讯。",
    zhTW: "文字內容審核：識別色情、暴力、辱罵等風險，適用於社群、評論與即時通訊。",
    en: "Text content moderation for porn, violence, abuse, and related risks. For social, comments, and IM.",
    fr: "Modération de texte (porno, violence, insultes…). Pour réseaux sociaux, commentaires et messagerie.",
    ru: "Модерация текста: порно, насилие, оскорбления и др. Для соцсетей, комментариев и IM.",
    ja: "テキストモデレーション。ポルノ・暴力・罵倒などを検出。SNS・コメント・IM 向け。",
    vi: "Kiểm duyệt văn bản: khiêu dâm, bạo lực, lăng mạ… cho mạng xã hội, bình luận và IM.",
  },
  "Security-semantic-filtering": {
    zhCN: "安全语义过滤：在内容触达用户或模型前拦截敏感与合规风险信息。",
    zhTW: "安全語意過濾：在內容觸達使用者或模型前攔截敏感與合規風險資訊。",
    en: "Semantic security filter for sensitive/compliance-sensitive content before it reaches users or models.",
    fr: "Filtre sémantique de sécurité pour contenus sensibles / conformité avant utilisateurs ou modèles.",
    ru: "Семантический security‑фильтр чувствительного/комплаенс контента до пользователей или моделей.",
    ja: "安全セマンティックフィルタ。ユーザー/モデル到達前にセンシティブ・コンプラ情報を遮断。",
    vi: "Bộ lọc ngữ nghĩa bảo mật: chặn nội dung nhạy cảm/tuân thủ trước khi tới người dùng hoặc mô hình.",
  },
  "nsfw-classifier": {
    zhCN: "NSFW 图片分类，实时识别并过滤不适宜公开的敏感视觉内容。",
    zhTW: "NSFW 圖片分類，即時識別並過濾不適宜公開的敏感視覺內容。",
    en: "NSFW image classifier for realtime detection and filtering of sensitive visual content.",
    fr: "Classifieur d’images NSFW pour détecter et filtrer en temps réel les contenus visuels sensibles.",
    ru: "NSFW‑классификатор изображений: реалтайм‑детекция и фильтрация чувствительного визуала.",
    ja: "NSFW 画像分類。センシティブな視覚コンテンツをリアルタイム検出・フィルタ。",
    vi: "Phân loại ảnh NSFW: phát hiện và lọc nội dung hình ảnh nhạy cảm theo thời gian thực.",
  },
  "gemma-4-26B-A4B-it": {
    zhCN: "Google Gemma 4 26B MoE 指令模型（约激活 4B 参数），擅长推理、编程与多模态对话。",
    zhTW: "Google Gemma 4 26B MoE 指令模型（約啟動 4B 參數），擅長推理、程式設計與多模態對話。",
    en: "Google Gemma 4 26B MoE instruction model (~4B active). Strong reasoning, coding, and multimodal chat.",
    fr: "Modèle d’instruction Google Gemma 4 26B MoE (~4B actifs). Raisonnement, code et chat multimodal.",
    ru: "Google Gemma 4 26B MoE instruction (~4B активных): рассуждение, код и мультимодальный чат.",
    ja: "Google Gemma 4 26B MoE 指示モデル（約 4B 活性）。推論・コーディング・マルチモーダル対話に強い。",
    vi: "Mô hình instruction Google Gemma 4 26B MoE (~4B active): mạnh suy luận, lập trình và chat đa phương thức.",
  },
};

const UNIT_META = {
  per_call: {
    key: "request",
    badge: {
      zhCN: "按次计费",
      zhTW: "按次計費",
      en: "Per Request",
      fr: "Par requête",
      ru: "За запрос",
      ja: "リクエスト課金",
      vi: "Theo lần gọi",
    },
    suffix: {
      zhCN: "/次",
      zhTW: "/次",
      en: "/ request",
      fr: "/ requête",
      ru: "/ запрос",
      ja: "/ 回",
      vi: "/ lần",
    },
    priceKey: {
      zhCN: "每次请求",
      zhTW: "每次請求",
      en: "Per request",
      fr: "Par requête",
      ru: "За запрос",
      ja: "リクエストごと",
      vi: "Mỗi lần gọi",
    },
  },
  per_second: {
    key: "second",
    badge: {
      zhCN: "按秒计费",
      zhTW: "按秒計費",
      en: "Per Second",
      fr: "Par seconde",
      ru: "За секунду",
      ja: "秒課金",
      vi: "Theo giây",
    },
    suffix: {
      zhCN: "/秒",
      zhTW: "/秒",
      en: "/ second",
      fr: "/ seconde",
      ru: "/ сек",
      ja: "/ 秒",
      vi: "/ giây",
    },
    priceKey: {
      zhCN: "每秒",
      zhTW: "每秒",
      en: "Per second",
      fr: "Par seconde",
      ru: "За секунду",
      ja: "秒ごと",
      vi: "Mỗi giây",
    },
  },
  per_page: {
    key: "page",
    badge: {
      zhCN: "按页计费",
      zhTW: "按頁計費",
      en: "Per Page",
      fr: "Par page",
      ru: "За страницу",
      ja: "ページ課金",
      vi: "Theo trang",
    },
    suffix: {
      zhCN: "/页",
      zhTW: "/頁",
      en: "/ page",
      fr: "/ page",
      ru: "/ стр.",
      ja: "/ ページ",
      vi: "/ trang",
    },
    priceKey: {
      zhCN: "每页",
      zhTW: "每頁",
      en: "Per page",
      fr: "Par page",
      ru: "За страницу",
      ja: "ページごと",
      vi: "Mỗi trang",
    },
  },
  per_char: {
    key: "character",
    badge: {
      zhCN: "按字符计费",
      zhTW: "按字元計費",
      en: "Per Character",
      fr: "Par caractère",
      ru: "За символ",
      ja: "文字課金",
      vi: "Theo ký tự",
    },
    suffix: {
      zhCN: "/字符",
      zhTW: "/字元",
      en: "/ character",
      fr: "/ caractère",
      ru: "/ символ",
      ja: "/ 文字",
      vi: "/ ký tự",
    },
    priceKey: {
      zhCN: "每字符",
      zhTW: "每字元",
      en: "Per character",
      fr: "Par caractère",
      ru: "За символ",
      ja: "文字ごと",
      vi: "Mỗi ký tự",
    },
  },
  per_10k_chars: {
    key: "10k_chars",
    badge: {
      zhCN: "按万字符计费",
      zhTW: "按萬字元計費",
      en: "Per 10K Characters",
      fr: "Par 10k caractères",
      ru: "За 10 тыс. символов",
      ja: "万文字課金",
      vi: "Theo 10K ký tự",
    },
    suffix: {
      zhCN: "/万字符",
      zhTW: "/萬字元",
      en: "/ 10K chars",
      fr: "/ 10k car.",
      ru: "/ 10к симв.",
      ja: "/ 万文字",
      vi: "/ 10K ký tự",
    },
    priceKey: {
      zhCN: "每万字符",
      zhTW: "每萬字元",
      en: "Per 10K characters",
      fr: "Par 10k caractères",
      ru: "За 10 тыс. символов",
      ja: "万文字ごと",
      vi: "Mỗi 10K ký tự",
    },
  },
  token: {
    key: "token",
    badge: {
      zhCN: "按 Token 计费",
      zhTW: "按 Token 計費",
      en: "Token-based",
      fr: "Au token",
      ru: "По токенам",
      ja: "Token 課金",
      vi: "Theo token",
    },
    suffix: Object.fromEntries(LANGS.map((l) => [l, ""])),
    priceKey: Object.fromEntries(LANGS.map((l) => [l, ""])),
  },
};

function usd(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  if (x >= 1) return "$" + Number(x.toFixed(2));
  if (x >= 0.1) return "$" + Number(x.toFixed(3));
  if (x >= 0.01) return "$" + Number(x.toFixed(4));
  return "$" + Number(x.toFixed(6));
}

function priceNote(lang, bill, meta) {
  if (bill.mode === "token") {
    const inUsd = usd((bill.sell_in_cny_per_m || 0) / FX);
    const outUsd = usd((bill.sell_out_cny_per_m || bill.sell_in_cny_per_m || 0) / FX);
    const map = {
      zhCN: `计费：输入 ${inUsd} / 输出 ${outUsd}（每百万 tokens）。`,
      zhTW: `計費：輸入 ${inUsd} / 輸出 ${outUsd}（每百萬 tokens）。`,
      en: `Pricing: ${inUsd} input / ${outUsd} output per 1M tokens.`,
      fr: `Tarif : ${inUsd} entrée / ${outUsd} sortie pour 1M tokens.`,
      ru: `Тариф: вход ${inUsd} / выход ${outUsd} за 1M токенов.`,
      ja: `料金：入力 ${inUsd} / 出力 ${outUsd}（100万 tokens あたり）。`,
      vi: `Giá: vào ${inUsd} / ra ${outUsd} mỗi 1M tokens.`,
    };
    return map[lang] || map.en;
  }
  const p = usd(bill.model_price_usd ?? (bill.sell_cny || 0) / FX);
  const s = meta.suffix[lang] || meta.suffix.en;
  const map = {
    zhCN: `计费：${p}${s}。`,
    zhTW: `計費：${p}${s}。`,
    en: `Pricing: ${p} ${s}.`,
    fr: `Tarif : ${p} ${s}.`,
    ru: `Тариф: ${p} ${s}.`,
    ja: `料金：${p}${s}。`,
    vi: `Giá: ${p}${s}.`,
  };
  return map[lang] || map.en;
}

const copy = {};
for (const m of cfg.models) {
  const bill = m.billing || {};
  const unitKey = bill.mode === "token" ? "token" : bill.unit || "per_call";
  const meta = UNIT_META[unitKey] || UNIT_META.per_call;
  const base = DESC[m.id] || {};
  const descriptions = {};
  for (const lang of LANGS) {
    const body = (base[lang] || base.en || m.description || "").replace(/\s+/g, " ").trim();
    descriptions[lang] = `${body} ${priceNote(lang, bill, meta)}`.trim();
  }
  copy[m.id] = {
    description: descriptions.zhCN,
    descriptions,
    unit: meta.key,
    badge: meta.badge,
    suffix: meta.suffix,
    price_key: meta.priceKey,
    // 兼容旧注入字段
    description_zh: descriptions.zhCN,
    description_en: descriptions.en,
    badge_zh: meta.badge.zhCN,
    badge_en: meta.badge.en,
    suffix_zh: meta.suffix.zhCN,
    suffix_en: meta.suffix.en,
    price_key_zh: meta.priceKey.zhCN,
    price_key_en: meta.priceKey.en,
  };
  m.description = (base.zhCN || base.en || m.description || "").replace(/\s+/g, " ").trim();
}

// —— 合并 OpenLux / 出图等非 Gitee 模型 ——
function entryFromExtra(id, extra) {
  const meta =
    extra.mode === "token"
      ? UNIT_META.token
      : UNIT_META[extra.unit || "per_call"] || UNIT_META.per_call;
  const bill =
    extra.mode === "token"
      ? {
          mode: "token",
          sell_in_cny_per_m: (extra.ratio || 0) * 2 * FX,
          sell_out_cny_per_m: (extra.ratio || 0) * 2 * (extra.completion || 1) * FX,
        }
      : {
          mode: "unit",
          unit: extra.unit || "per_call",
          model_price_usd: extra.model_price_usd,
        };
  const descriptions = {};
  for (const lang of LANGS) {
    const body = (extra.desc[lang] || extra.desc.en || "").replace(/\s+/g, " ").trim();
    // token 模型价格已在卡片展示，简介不再重复；出图保留单价说明
    if (extra.mode === "token") descriptions[lang] = body;
    else descriptions[lang] = `${body} ${priceNote(lang, bill, meta)}`.trim();
  }
  return {
    description: descriptions.zhCN,
    descriptions,
    unit: meta.key,
    badge: meta.badge,
    suffix: meta.suffix,
    price_key: meta.priceKey,
    description_zh: descriptions.zhCN,
    description_en: descriptions.en,
    badge_zh: meta.badge.zhCN,
    badge_en: meta.badge.en,
    suffix_zh: meta.suffix.zhCN,
    suffix_en: meta.suffix.en,
    price_key_zh: meta.priceKey.zhCN,
    price_key_en: meta.priceKey.en,
  };
}

for (const [id, extra] of Object.entries(EXTRA_MODELS)) {
  copy[id] = entryFromExtra(id, extra);
}

copy.__tags__ = TAG_I18N;

fs.writeFileSync(
  path.join(root, "config/marketplace-model-copy.json"),
  JSON.stringify(copy, null, 2) + "\n"
);
fs.writeFileSync(
  path.join(root, "config/gitee-selected-models.json"),
  JSON.stringify(cfg, null, 2) + "\n"
);

const passthrough = path.join(root, "services/gitee-passthrough/catalog.json");
if (fs.existsSync(passthrough)) {
  const cat = JSON.parse(fs.readFileSync(passthrough, "utf8"));
  for (const mm of cat.models || []) {
    if (DESC[mm.id]?.zhCN) mm.description = DESC[mm.id].zhCN;
  }
  fs.writeFileSync(passthrough, JSON.stringify(cat, null, 2) + "\n");
}

const modelCount = Object.keys(copy).filter((k) => k !== "__tags__").length;
console.log(
  JSON.stringify(
    {
      models: modelCount,
      tags: Object.keys(TAG_I18N).length,
      sampleExtra: copy["gpt-5.6-terra"]?.descriptions,
      sampleTag: TAG_I18N["大语言模型"],
    },
    null,
    2
  )
);
