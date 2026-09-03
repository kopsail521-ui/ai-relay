/**
 * Rebuild static/brand/keyo-docs.html with 7-language i18n (matches New API).
 * Keeps existing CSS; replaces body + script.
 *
 *   node scripts/build-keyo-docs-i18n.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const docsPath = path.join(root, "static", "brand", "keyo-docs.html");

const html = fs.readFileSync(docsPath, "utf8");
const styleEnd = html.indexOf("</style>");
if (styleEnd < 0) throw new Error("missing </style>");
const css = html.slice(0, styleEnd + "</style>".length);

const I18N = {
  en: {
    title: "KeyoAPI Docs",
    docTitle: "KeyoAPI Integration Docs",
    heroSub:
      "One Base URL + one API Key. OpenAI-compatible — works with Cursor, ChatBox, and official SDKs.",
    tocAccess: "Connection",
    tocChat: "Chat",
    tocImage: "Images",
    tocClients: "Clients",
    tocSupport: "Billing & support",
    accessTitle: "Connection",
    accessDesc: "Get the Base URL and key first — every request uses these two.",
    apiKeyNote: 'Sign in → Tokens → create, or use a key from support: sk-...',
    authLabel: "Auth header",
    authValue: "Authorization: Bearer sk-YOUR_KEY",
    goCreate: "Create key",
    copy: "Copy",
    copyUrl: "Copy full URL",
    chatTitle: "Chat",
    thModel: "Model",
    thIn: "Input / MTok",
    thOut: "Output / MTok",
    thNote: "Notes",
    nLuna: "Budget default",
    nTerra: "Daily coding / chat",
    nSol: "Premium",
    nClaudeBal: "Claude balanced",
    nClaudeStrong: "Claude strong",
    nClaudeFlag: "Claude flagship",
    nClaudeFlag51: "Claude flagship 5.1",
    nGemFast: "Gemini fast",
    nGemFast38: "Gemini 3.8 fast",
    nDsFast: "DeepSeek fast",
    nDsStrong: "DeepSeek strong",
    nKimi: "Kimi",
    nGrok: "Grok",
    nMinimax: "MiniMax",
    nGlm: "Zhipu GLM",
    chatHint:
      "Click a model name to copy. Billed by token usage (console is source of truth). Top up when quota runs out.",
    imageTitle: "Images",
    thPrice: "Approx. price",
    perImage: "/ image",
    clientsTitle: "Clients",
    clientsDesc: "Fill these in common tools. Model names must match the table exactly.",
    clientsTools: "ChatBox / Cursor etc.",
    apiAddress: "API base",
    modelLabel: "Model",
    pickModel: "Pick one from the table",
    yourKey: "sk-YOUR_KEY",
    listModels: "List models",
    copyCurl: "Copy curl",
    supportTitle: "Billing & support",
    supportBody:
      "<strong>Console</strong>: <a href=\"https://www.keyoapi.xyz\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.keyoapi.xyz</a> — check usage; keep tokens private.<br /><strong>Top-up</strong>: pay as agreed, then an admin adds quota (online payments may follow).<br /><strong>Common errors</strong>: wrong model name, invalid key, insufficient balance.",
    footA: "KeyoAPI · One endpoint, many models",
    footB: "OpenAI-compatible · usage-based billing",
    copied: "Copied",
    selectText: "Select text",
    manualCopyTitle: "Copy manually",
    manualCopyHint:
      "Auto-copy failed. Select the text below and press Ctrl+C / ⌘C.",
    close: "Close",
    hello: "Hello",
  },
  zhCN: {
    title: "KeyoAPI 接入文档",
    docTitle: "KeyoAPI 接入文档",
    heroSub:
      "一个 Base URL + 一把 API Key，兼容 OpenAI 协议。可直接用于 Cursor、ChatBox 与官方 SDK。",
    tocAccess: "接入信息",
    tocChat: "文本对话",
    tocImage: "图片生成",
    tocClients: "客户端接入",
    tocSupport: "充值与支持",
    accessTitle: "接入信息",
    accessDesc: "先备好地址和密钥，后面所有请求都用这两样。",
    apiKeyNote: "登录控制台 →「令牌」创建，或由客服发放的 sk-...",
    authLabel: "鉴权头",
    authValue: "Authorization: Bearer sk-你的密钥",
    goCreate: "去创建",
    copy: "复制",
    copyUrl: "复制完整 URL",
    chatTitle: "文本对话",
    thModel: "模型",
    thIn: "输入 / MTok",
    thOut: "输出 / MTok",
    thNote: "说明",
    nLuna: "便宜主力",
    nTerra: "日常编程 / 对话",
    nSol: "高档",
    nClaudeBal: "Claude 均衡",
    nClaudeStrong: "Claude 强档",
    nClaudeFlag: "Claude 旗舰",
    nClaudeFlag51: "Claude 旗舰 5.1",
    nGemFast: "Gemini 快",
    nGemFast38: "Gemini 3.8 快",
    nDsFast: "DeepSeek 快",
    nDsStrong: "DeepSeek 强",
    nKimi: "Kimi",
    nGrok: "Grok",
    nMinimax: "MiniMax",
    nGlm: "智谱",
    chatHint:
      "点击模型名即可复制。计费按 token 用量，以控制台实时扣费为准；额度用完需充值。",
    imageTitle: "图片生成",
    thPrice: "约价",
    perImage: "/ 张",
    clientsTitle: "客户端接入",
    clientsDesc: "在常见工具里这样填；模型名必须与上表完全一致。",
    clientsTools: "ChatBox / Cursor 等",
    apiAddress: "API 地址",
    modelLabel: "模型",
    pickModel: "从上表选一个",
    yourKey: "sk-你的密钥",
    listModels: "查可用模型",
    copyCurl: "复制 curl",
    supportTitle: "充值与支持",
    supportBody:
      "<strong>控制台</strong>：<a href=\"https://www.keyoapi.xyz\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.keyoapi.xyz</a> · 可查看用量，令牌请自行保管。<br /><strong>充值</strong>：按约定付款后由管理员加额度（或后续开通在线支付）。<br /><strong>常见报错</strong>：模型名写错、Key 无效、余额不足。",
    footA: "KeyoAPI · 一个地址，多模型",
    footB: "OpenAI 兼容 · 按量计费",
    copied: "已复制",
    selectText: "点此选中",
    manualCopyTitle: "手动复制",
    manualCopyHint: "自动复制未成功，请选中下方内容后 Ctrl+C / ⌘C。",
    close: "关闭",
    hello: "你好",
  },
  zhTW: {
    title: "KeyoAPI 接入文件",
    docTitle: "KeyoAPI 接入文件",
    heroSub:
      "一個 Base URL + 一把 API Key，相容 OpenAI 協定。可直接用於 Cursor、ChatBox 與官方 SDK。",
    tocAccess: "接入資訊",
    tocChat: "文字對話",
    tocImage: "圖片生成",
    tocClients: "客戶端接入",
    tocSupport: "儲值與支援",
    accessTitle: "接入資訊",
    accessDesc: "先備好位址和金鑰，後面所有請求都用這兩樣。",
    apiKeyNote: "登入控制台 →「令牌」建立，或由客服發放的 sk-...",
    authLabel: "驗證標頭",
    authValue: "Authorization: Bearer sk-你的金鑰",
    goCreate: "去建立",
    copy: "複製",
    copyUrl: "複製完整 URL",
    chatTitle: "文字對話",
    thModel: "模型",
    thIn: "輸入 / MTok",
    thOut: "輸出 / MTok",
    thNote: "說明",
    nLuna: "便宜主力",
    nTerra: "日常程式／對話",
    nSol: "高檔",
    nClaudeBal: "Claude 均衡",
    nClaudeStrong: "Claude 強檔",
    nClaudeFlag: "Claude 旗艦",
    nClaudeFlag51: "Claude 旗艦 5.1",
    nGemFast: "Gemini 快",
    nGemFast38: "Gemini 3.8 快",
    nDsFast: "DeepSeek 快",
    nDsStrong: "DeepSeek 強",
    nKimi: "Kimi",
    nGrok: "Grok",
    nMinimax: "MiniMax",
    nGlm: "智譜",
    chatHint:
      "點擊模型名即可複製。計費依 token 用量，以控制台即時扣費為準；額度用完需儲值。",
    imageTitle: "圖片生成",
    thPrice: "約價",
    perImage: "/ 張",
    clientsTitle: "客戶端接入",
    clientsDesc: "在常見工具裡這樣填；模型名必須與上表完全一致。",
    clientsTools: "ChatBox / Cursor 等",
    apiAddress: "API 位址",
    modelLabel: "模型",
    pickModel: "從上表選一個",
    yourKey: "sk-你的金鑰",
    listModels: "查可用模型",
    copyCurl: "複製 curl",
    supportTitle: "儲值與支援",
    supportBody:
      "<strong>控制台</strong>：<a href=\"https://www.keyoapi.xyz\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.keyoapi.xyz</a> · 可查看用量，令牌請自行保管。<br /><strong>儲值</strong>：依約定付款後由管理員加額度（或後續開通線上支付）。<br /><strong>常見錯誤</strong>：模型名寫錯、Key 無效、餘額不足。",
    footA: "KeyoAPI · 一個位址，多模型",
    footB: "OpenAI 相容 · 按量計費",
    copied: "已複製",
    selectText: "點此選取",
    manualCopyTitle: "手動複製",
    manualCopyHint: "自動複製未成功，請選取下方內容後 Ctrl+C / ⌘C。",
    close: "關閉",
    hello: "你好",
  },
  ja: {
    title: "KeyoAPI ドキュメント",
    docTitle: "KeyoAPI 連携ドキュメント",
    heroSub:
      "1つの Base URL と 1つの API Key。OpenAI 互換で Cursor / ChatBox / 公式 SDK にそのまま使えます。",
    tocAccess: "接続情報",
    tocChat: "チャット",
    tocImage: "画像生成",
    tocClients: "クライアント",
    tocSupport: "課金とサポート",
    accessTitle: "接続情報",
    accessDesc: "まず Base URL とキーを用意。以降のリクエストはすべてこの2つです。",
    apiKeyNote: "コンソールにログイン →「トークン」で作成、またはサポート発行の sk-...",
    authLabel: "認証ヘッダー",
    authValue: "Authorization: Bearer sk-YOUR_KEY",
    goCreate: "作成する",
    copy: "コピー",
    copyUrl: "URL をコピー",
    chatTitle: "チャット",
    thModel: "モデル",
    thIn: "入力 / MTok",
    thOut: "出力 / MTok",
    thNote: "メモ",
    nLuna: "コスパ定番",
    nTerra: "日常コーディング / 会話",
    nSol: "プレミアム",
    nClaudeBal: "Claude バランス",
    nClaudeStrong: "Claude 強",
    nClaudeFlag: "Claude 旗艦",
    nClaudeFlag51: "Claude 旗艦 5.1",
    nGemFast: "Gemini 高速",
    nGemFast38: "Gemini 3.8 高速",
    nDsFast: "DeepSeek 高速",
    nDsStrong: "DeepSeek 強",
    nKimi: "Kimi",
    nGrok: "Grok",
    nMinimax: "MiniMax",
    nGlm: "Zhipu GLM",
    chatHint:
      "モデル名をクリックでコピー。課金はトークン使用量（コンソールが正）。残高不足時はチャージ。",
    imageTitle: "画像生成",
    thPrice: "目安価格",
    perImage: "/ 枚",
    clientsTitle: "クライアント",
    clientsDesc: "よく使うツールではこう設定。モデル名は表と完全一致させてください。",
    clientsTools: "ChatBox / Cursor など",
    apiAddress: "API ベース",
    modelLabel: "モデル",
    pickModel: "上表から1つ選ぶ",
    yourKey: "sk-YOUR_KEY",
    listModels: "利用可能モデル",
    copyCurl: "curl をコピー",
    supportTitle: "課金とサポート",
    supportBody:
      "<strong>コンソール</strong>：<a href=\"https://www.keyoapi.xyz\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.keyoapi.xyz</a> — 使用量を確認。トークンは厳重に。<br /><strong>チャージ</strong>：合意どおり支払い後、管理者が枠を追加（オンライン決済は後日）。<br /><strong>よくあるエラー</strong>：モデル名ミス、無効キー、残高不足。",
    footA: "KeyoAPI · ひとつのエンドポイントで多モデル",
    footB: "OpenAI 互換 · 従量課金",
    copied: "コピー済み",
    selectText: "選択する",
    manualCopyTitle: "手動コピー",
    manualCopyHint: "自動コピーに失敗しました。下の文字を選んで Ctrl+C / ⌘C。",
    close: "閉じる",
    hello: "こんにちは",
  },
  fr: {
    title: "Docs KeyoAPI",
    docTitle: "Documentation d’intégration KeyoAPI",
    heroSub:
      "Une Base URL + une clé API. Compatible OpenAI — Cursor, ChatBox et SDK officiels.",
    tocAccess: "Connexion",
    tocChat: "Chat",
    tocImage: "Images",
    tocClients: "Clients",
    tocSupport: "Paiement & support",
    accessTitle: "Connexion",
    accessDesc: "Préparez l’URL et la clé — toutes les requêtes les utilisent.",
    apiKeyNote: "Connexion → Jetons → créer, ou clé fournie : sk-...",
    authLabel: "En-tête d’auth",
    authValue: "Authorization: Bearer sk-YOUR_KEY",
    goCreate: "Créer une clé",
    copy: "Copier",
    copyUrl: "Copier l’URL",
    chatTitle: "Chat",
    thModel: "Modèle",
    thIn: "Entrée / MTok",
    thOut: "Sortie / MTok",
    thNote: "Notes",
    nLuna: "Économique",
    nTerra: "Code / chat quotidien",
    nSol: "Premium",
    nClaudeBal: "Claude équilibré",
    nClaudeStrong: "Claude fort",
    nClaudeFlag: "Claude phare",
    nClaudeFlag51: "Claude phare 5.1",
    nGemFast: "Gemini rapide",
    nGemFast38: "Gemini 3.8 rapide",
    nDsFast: "DeepSeek rapide",
    nDsStrong: "DeepSeek fort",
    nKimi: "Kimi",
    nGrok: "Grok",
    nMinimax: "MiniMax",
    nGlm: "Zhipu GLM",
    chatHint:
      "Cliquez un modèle pour copier. Facturation au token (console = référence). Rechargez si le quota est épuisé.",
    imageTitle: "Images",
    thPrice: "Prix approx.",
    perImage: "/ image",
    clientsTitle: "Clients",
    clientsDesc: "Remplissez ainsi dans vos outils. Les noms de modèles doivent correspondre exactement.",
    clientsTools: "ChatBox / Cursor etc.",
    apiAddress: "Base API",
    modelLabel: "Modèle",
    pickModel: "Choisir dans le tableau",
    yourKey: "sk-YOUR_KEY",
    listModels: "Lister les modèles",
    copyCurl: "Copier curl",
    supportTitle: "Paiement & support",
    supportBody:
      "<strong>Console</strong> : <a href=\"https://www.keyoapi.xyz\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.keyoapi.xyz</a> — usage ; gardez les jetons privés.<br /><strong>Recharge</strong> : paiement convenu, puis quota ajouté par un admin.<br /><strong>Erreurs fréquentes</strong> : mauvais modèle, clé invalide, solde insuffisant.",
    footA: "KeyoAPI · Un endpoint, plusieurs modèles",
    footB: "Compatible OpenAI · facturation à l’usage",
    copied: "Copié",
    selectText: "Sélectionner",
    manualCopyTitle: "Copie manuelle",
    manualCopyHint: "Échec de la copie auto. Sélectionnez le texte puis Ctrl+C / ⌘C.",
    close: "Fermer",
    hello: "Bonjour",
  },
  ru: {
    title: "Документация KeyoAPI",
    docTitle: "Документация по подключению KeyoAPI",
    heroSub:
      "Один Base URL + один API Key. Совместимо с OpenAI — Cursor, ChatBox и официальные SDK.",
    tocAccess: "Подключение",
    tocChat: "Чат",
    tocImage: "Изображения",
    tocClients: "Клиенты",
    tocSupport: "Оплата и поддержка",
    accessTitle: "Подключение",
    accessDesc: "Сначала Base URL и ключ — дальше все запросы используют их.",
    apiKeyNote: "Войти → Токены → создать, или ключ от поддержки: sk-...",
    authLabel: "Заголовок auth",
    authValue: "Authorization: Bearer sk-YOUR_KEY",
    goCreate: "Создать ключ",
    copy: "Копировать",
    copyUrl: "Копировать URL",
    chatTitle: "Чат",
    thModel: "Модель",
    thIn: "Вход / MTok",
    thOut: "Выход / MTok",
    thNote: "Заметки",
    nLuna: "Бюджетный",
    nTerra: "Код / чат ежедневно",
    nSol: "Премиум",
    nClaudeBal: "Claude баланс",
    nClaudeStrong: "Claude сильный",
    nClaudeFlag: "Claude флагман",
    nClaudeFlag51: "Claude флагман 5.1",
    nGemFast: "Gemini быстрый",
    nGemFast38: "Gemini 3.8 быстрый",
    nDsFast: "DeepSeek быстрый",
    nDsStrong: "DeepSeek сильный",
    nKimi: "Kimi",
    nGrok: "Grok",
    nMinimax: "MiniMax",
    nGlm: "Zhipu GLM",
    chatHint:
      "Клик по модели — копировать. Оплата по токенам (консоль источник истины). Пополняйте при нулевом балансе.",
    imageTitle: "Изображения",
    thPrice: "Примерно",
    perImage: "/ изобр.",
    clientsTitle: "Клиенты",
    clientsDesc: "Так заполняйте в инструментах. Имена моделей — точно как в таблице.",
    clientsTools: "ChatBox / Cursor и др.",
    apiAddress: "API base",
    modelLabel: "Модель",
    pickModel: "Выберите из таблицы",
    yourKey: "sk-YOUR_KEY",
    listModels: "Список моделей",
    copyCurl: "Копировать curl",
    supportTitle: "Оплата и поддержка",
    supportBody:
      "<strong>Консоль</strong>: <a href=\"https://www.keyoapi.xyz\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.keyoapi.xyz</a> — расход; храните токены.<br /><strong>Пополнение</strong>: оплата по договорённости, админ добавляет квоту.<br /><strong>Частые ошибки</strong>: неверная модель, неверный ключ, мало баланса.",
    footA: "KeyoAPI · Один endpoint — много моделей",
    footB: "Совместимо с OpenAI · оплата по использованию",
    copied: "Скопировано",
    selectText: "Выделить",
    manualCopyTitle: "Скопировать вручную",
    manualCopyHint: "Автокопирование не удалось. Выделите текст и Ctrl+C / ⌘C.",
    close: "Закрыть",
    hello: "Привет",
  },
  vi: {
    title: "Tài liệu KeyoAPI",
    docTitle: "Tài liệu tích hợp KeyoAPI",
    heroSub:
      "Một Base URL + một API Key. Tương thích OpenAI — dùng với Cursor, ChatBox và SDK chính thức.",
    tocAccess: "Kết nối",
    tocChat: "Chat",
    tocImage: "Ảnh",
    tocClients: "Client",
    tocSupport: "Nạp tiền & hỗ trợ",
    accessTitle: "Kết nối",
    accessDesc: "Chuẩn bị Base URL và key trước — mọi request đều dùng hai thứ này.",
    apiKeyNote: "Đăng nhập → Token → tạo, hoặc key từ hỗ trợ: sk-...",
    authLabel: "Header xác thực",
    authValue: "Authorization: Bearer sk-YOUR_KEY",
    goCreate: "Tạo key",
    copy: "Sao chép",
    copyUrl: "Sao chép URL",
    chatTitle: "Chat",
    thModel: "Model",
    thIn: "Input / MTok",
    thOut: "Output / MTok",
    thNote: "Ghi chú",
    nLuna: "Rẻ, mặc định",
    nTerra: "Code / chat hàng ngày",
    nSol: "Cao cấp",
    nClaudeBal: "Claude cân bằng",
    nClaudeStrong: "Claude mạnh",
    nClaudeFlag: "Claude flagship",
    nClaudeFlag51: "Claude flagship 5.1",
    nGemFast: "Gemini nhanh",
    nGemFast38: "Gemini 3.8 nhanh",
    nDsFast: "DeepSeek nhanh",
    nDsStrong: "DeepSeek mạnh",
    nKimi: "Kimi",
    nGrok: "Grok",
    nMinimax: "MiniMax",
    nGlm: "Zhipu GLM",
    chatHint:
      "Bấm tên model để sao chép. Tính theo token (console là chuẩn). Hết hạn mức thì nạp thêm.",
    imageTitle: "Ảnh",
    thPrice: "Giá ước tính",
    perImage: "/ ảnh",
    clientsTitle: "Client",
    clientsDesc: "Điền như sau trong công cụ. Tên model phải khớp bảng.",
    clientsTools: "ChatBox / Cursor v.v.",
    apiAddress: "API base",
    modelLabel: "Model",
    pickModel: "Chọn một trong bảng",
    yourKey: "sk-YOUR_KEY",
    listModels: "Liệt kê model",
    copyCurl: "Sao chép curl",
    supportTitle: "Nạp tiền & hỗ trợ",
    supportBody:
      "<strong>Console</strong>: <a href=\"https://www.keyoapi.xyz\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.keyoapi.xyz</a> — xem usage; giữ token riêng.<br /><strong>Nạp tiền</strong>: thanh toán theo thỏa thuận, admin cộng hạn mức.<br /><strong>Lỗi thường gặp</strong>: sai model, key lỗi, hết số dư.",
    footA: "KeyoAPI · Một endpoint, nhiều mô hình",
    footB: "Tương thích OpenAI · tính theo usage",
    copied: "Đã sao chép",
    selectText: "Chọn chữ",
    manualCopyTitle: "Sao chép thủ công",
    manualCopyHint: "Tự sao chép thất bại. Chọn chữ bên dưới rồi Ctrl+C / ⌘C.",
    close: "Đóng",
    hello: "Xin chào",
  },
};

const chatModels = [
  ["gpt-5.6-luna", "~$0.10", "~$0.62", "nLuna"],
  ["gpt-5.6-terra", "~$0.37", "~$2.21", "nTerra"],
  ["gpt-5.6-sol", "~$0.92", "~$5.52", "nSol"],
  ["claude-sonnet-5", "~$0.88", "~$4.41", "nClaudeBal"],
  ["claude-opus-5", "~$2.21", "~$11.03", "nClaudeStrong"],
  ["claude-fable-5", "~$8.82", "~$44.12", "nClaudeFlag"],
  ["claude-fable-5-1", "~$14.71", "~$73.53", "nClaudeFlag51"],
  ["gemini-3.7-flash", "~$0.28", "~$1.38", "nGemFast"],
  ["gemini-3.8-flash", "~$0.28", "~$1.38", "nGemFast38"],
  ["deepseek-v4-flash", "~$1.10", "~$3.30", "nDsFast"],
  ["deepseek-v4-pro-0813", "~$3.30", "~$9.90", "nDsStrong"],
  ["kimi-k3", "~$7.50", "~$37.50", "nKimi"],
  ["grok-4.6", "~$0.74", "~$2.21", "nGrok"],
  ["MiniMax-M3", "~$0.75", "~$3.00", "nMinimax"],
  ["glm-5.3", "~$3.50", "~$11.00", "nGlm"],
];

const imageModels = [
  ["gpt-image-2", "¥0.05"],
  ["gpt-image-2-vip", "¥0.20"],
  ["nano-banana-2", "¥0.15"],
  ["nano-banana-pro", "¥0.20"],
];

const chatRows = chatModels
  .map(
    ([id, a, b, note]) =>
      `<tr><td class="model"><button type="button" class="model-btn" data-copy="${id}">${id}</button></td><td class="price">${a}</td><td class="price">${b}</td><td class="note-cell" data-i18n="${note}"></td></tr>`
  )
  .join("\n");

const imageRows = imageModels
  .map(
    ([id, price]) =>
      `<tr><td class="model"><button type="button" class="model-btn" data-copy="${id}">${id}</button></td><td class="price">${price} <span data-i18n="perImage"></span></td></tr>`
  )
  .join("\n");

const body = `
<style>
  .lang-bar {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 20;
  }
  .lang-bar.embedded { display: none; }
  .lang-bar select {
    border: 1px solid var(--line-strong);
    background: #fff;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--ink);
  }
</style>
</head>
<body>
  <div class="lang-bar" id="langBar">
    <select id="langSelect" aria-label="Language"></select>
  </div>
  <div class="wrap">
    <aside class="toc">
      <div class="brand">Keyo<span>API</span></div>
      <nav id="toc-nav">
        <a href="#access" data-i18n="tocAccess"></a>
        <a href="#chat" data-i18n="tocChat"></a>
        <a href="#image" data-i18n="tocImage"></a>
        <a href="#clients" data-i18n="tocClients"></a>
        <a href="#support" data-i18n="tocSupport"></a>
      </nav>
    </aside>

    <div class="main">
      <header class="hero">
        <div class="eyebrow">Documentation</div>
        <h1 data-i18n="docTitle"></h1>
        <p data-i18n="heroSub"></p>
      </header>

      <section id="access">
        <div class="sec-head">
          <span class="num">01</span>
          <h2 data-i18n="accessTitle"></h2>
        </div>
        <p class="sec-desc" data-i18n="accessDesc"></p>
        <div class="creds">
          <div class="cred">
            <div class="label">Base URL</div>
            <div class="value" id="base-url">https://www.keyoapi.xyz/v1</div>
            <button type="button" class="btn-copy" data-copy="https://www.keyoapi.xyz/v1" data-i18n="copy"></button>
          </div>
          <div class="cred">
            <div class="label">API Key</div>
            <div class="value note" data-i18n="apiKeyNote"></div>
            <a class="btn-copy" href="https://www.keyoapi.xyz" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-flex;align-items:center;" data-i18n="goCreate"></a>
          </div>
          <div class="cred">
            <div class="label" data-i18n="authLabel"></div>
            <div class="value" id="auth-header" data-i18n="authValue"></div>
            <button type="button" class="btn-copy" data-copy-i18n="authValue" data-i18n="copy"></button>
          </div>
        </div>
      </section>

      <section id="chat">
        <div class="sec-head">
          <span class="num">02</span>
          <h2 data-i18n="chatTitle"></h2>
        </div>
        <div class="endpoint">
          <span class="method">POST</span>
          <span class="path">/v1/chat/completions</span>
          <button type="button" class="btn-copy" data-copy="https://www.keyoapi.xyz/v1/chat/completions" data-i18n="copyUrl"></button>
        </div>

        <div class="code-block">
          <div class="code-bar">
            <span class="lang">cURL</span>
            <button type="button" class="btn-copy" data-copy-target="curl-chat" data-i18n="copy"></button>
          </div>
          <pre id="curl-chat"></pre>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th data-i18n="thModel"></th>
                <th data-i18n="thIn"></th>
                <th data-i18n="thOut"></th>
                <th data-i18n="thNote"></th>
              </tr>
            </thead>
            <tbody>
${chatRows}
            </tbody>
          </table>
        </div>
        <p class="hint" data-i18n="chatHint"></p>
      </section>

      <section id="image">
        <div class="sec-head">
          <span class="num">03</span>
          <h2 data-i18n="imageTitle"></h2>
        </div>
        <div class="endpoint">
          <span class="method">POST</span>
          <span class="path">/v1/images/generations</span>
          <button type="button" class="btn-copy" data-copy="https://www.keyoapi.xyz/v1/images/generations" data-i18n="copyUrl"></button>
        </div>

        <div class="code-block">
          <div class="code-bar">
            <span class="lang">cURL</span>
            <button type="button" class="btn-copy" data-copy-target="curl-image" data-i18n="copy"></button>
          </div>
          <pre id="curl-image"></pre>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th data-i18n="thModel"></th>
                <th data-i18n="thPrice"></th>
              </tr>
            </thead>
            <tbody>
${imageRows}
            </tbody>
          </table>
        </div>
      </section>

      <section id="clients">
        <div class="sec-head">
          <span class="num">04</span>
          <h2 data-i18n="clientsTitle"></h2>
        </div>
        <p class="sec-desc" data-i18n="clientsDesc"></p>

        <div class="client-grid">
          <div class="client-card">
            <h3 data-i18n="clientsTools"></h3>
            <dl>
              <div>
                <dt data-i18n="apiAddress"></dt>
                <dd>
                  <span>https://www.keyoapi.xyz/v1</span>
                  <button type="button" class="btn-copy" data-copy="https://www.keyoapi.xyz/v1" data-i18n="copy"></button>
                </dd>
              </div>
              <div>
                <dt>API Key</dt>
                <dd><span data-i18n="yourKey"></span></dd>
              </div>
              <div>
                <dt data-i18n="modelLabel"></dt>
                <dd><span data-i18n="pickModel"></span></dd>
              </div>
            </dl>
          </div>
          <div class="client-card">
            <h3 data-i18n="listModels"></h3>
            <dl>
              <div>
                <dt>Endpoint</dt>
                <dd>
                  <span>GET /v1/models</span>
                  <button type="button" class="btn-copy" data-copy-target="curl-models" data-i18n="copyCurl"></button>
                </dd>
              </div>
            </dl>
            <pre id="curl-models" hidden></pre>
          </div>
        </div>

        <div class="code-block">
          <div class="code-bar">
            <span class="lang">Python · OpenAI SDK</span>
            <button type="button" class="btn-copy" data-copy-target="py-sdk" data-i18n="copy"></button>
          </div>
          <pre id="py-sdk"></pre>
        </div>
      </section>

      <section id="support">
        <div class="sec-head">
          <span class="num">05</span>
          <h2 data-i18n="supportTitle"></h2>
        </div>
        <div class="footer-note" data-i18n-html="supportBody"></div>
      </section>

      <div class="page-foot">
        <span data-i18n="footA"></span>
        <span data-i18n="footB"></span>
      </div>
    </div>
  </div>

<script>
const I18N = ${JSON.stringify(I18N, null, 2)};

const LANG_LABELS = {
  en: 'English',
  zhCN: '简体中文',
  zhTW: '繁體中文',
  ja: '日本語',
  fr: 'Français',
  ru: 'Русский',
  vi: 'Tiếng Việt'
};

function normalizeLang(raw) {
  if (!raw) return 'en';
  const v = String(raw).trim().replace(/_/g, '-');
  if (v === 'zhCN' || /^zh(-cn|-hans)?$/i.test(v)) return 'zhCN';
  if (v === 'zhTW' || /^zh-(tw|hk|mo|hant)/i.test(v)) return 'zhTW';
  const short = v.split('-')[0].toLowerCase();
  if (['en', 'ja', 'fr', 'ru', 'vi'].includes(short)) return short;
  return 'en';
}

let current = 'en';
const embedded = window.parent !== window;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSamples(dict) {
  const key = dict.yourKey || 'sk-YOUR_KEY';
  const hello = dict.hello || 'Hello';
  const chat = document.getElementById('curl-chat');
  const image = document.getElementById('curl-image');
  const models = document.getElementById('curl-models');
  const py = document.getElementById('py-sdk');
  if (chat) {
    chat.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/chat/completions \\\\\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\\\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\\\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "gpt-5.6-luna",\\n    "messages": [{"role":"user","content":"' + escapeHtml(hello) + '"}]\\n  }\\'</span></code>';
  }
  if (image) {
    image.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/images/generations \\\\\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\\\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\\\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "nano-banana-2",\\n    "prompt": "a red circle on white background",\\n    "size": "1024x1024"\\n  }\\'</span></code>';
  }
  if (models) {
    models.textContent = 'curl https://www.keyoapi.xyz/v1/models \\\\\\n  -H "Authorization: Bearer ' + key + '"';
  }
  if (py) {
    py.innerHTML = '<code><span class="tok-cmd">from</span> openai <span class="tok-cmd">import</span> OpenAI\\n' +
      'client = OpenAI(\\n' +
      '    base_url=<span class="tok-str">"https://www.keyoapi.xyz/v1"</span>,\\n' +
      '    api_key=<span class="tok-str">"' + escapeHtml(key) + '"</span>,\\n' +
      ')\\n' +
      'r = client.chat.completions.create(\\n' +
      '    model=<span class="tok-str">"gpt-5.6-luna"</span>,\\n' +
      '    messages=[{<span class="tok-str">"role"</span>: <span class="tok-str">"user"</span>, <span class="tok-str">"content"</span>: <span class="tok-str">"' + escapeHtml(hello) + '"</span>}],\\n' +
      ')\\n' +
      'print(r.choices[0].message.content)</code>';
  }
}

function applyLang(raw) {
  const code = normalizeLang(raw);
  current = code;
  const dict = I18N[code] || I18N.en;
  document.documentElement.lang = code === 'zhCN' ? 'zh-CN' : code === 'zhTW' ? 'zh-TW' : code;
  document.title = dict.title || 'KeyoAPI Docs';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] != null) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (dict[key] != null) el.innerHTML = dict[key];
  });
  document.querySelectorAll('[data-copy-i18n]').forEach((el) => {
    const key = el.getAttribute('data-copy-i18n');
    if (dict[key] != null) el.setAttribute('data-copy', dict[key]);
  });
  renderSamples(dict);
  const sel = document.getElementById('langSelect');
  if (sel && sel.value !== code) sel.value = code;
}

function readStoredLang() {
  try { return localStorage.getItem('i18nextLng') || ''; } catch { return ''; }
}

function signalReady() {
  if (!embedded) return;
  try { window.parent.postMessage({ type: 'keyo-brand-ready' }, '*'); } catch {}
}

(function () {
  const langBar = document.getElementById('langBar');
  const langSelect = document.getElementById('langSelect');
  if (embedded) langBar.classList.add('embedded');
  Object.entries(LANG_LABELS).forEach(([code, label]) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    langSelect.appendChild(opt);
  });
  langSelect.addEventListener('change', () => {
    applyLang(langSelect.value);
    try { localStorage.setItem('i18nextLng', langSelect.value); } catch {}
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.lang) applyLang(data.lang);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === 'i18nextLng') applyLang(event.newValue || 'en');
  });

  applyLang(readStoredLang() || navigator.language || 'en');
  signalReady();
  if (embedded) {
    let n = 0;
    const retry = setInterval(() => {
      signalReady();
      if (++n >= 8) clearInterval(retry);
    }, 250);
  }
  setInterval(() => {
    const lang = readStoredLang();
    if (lang && normalizeLang(lang) !== current) applyLang(lang);
  }, 800);

  function plainTextFrom(el) {
    return (el.innerText || el.textContent || '').replace(/\\u00a0/g, ' ').trim();
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:2px;height:2px;padding:0;border:none;outline:none;box-shadow:none;background:transparent';
    document.body.appendChild(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (!ok) throw new Error('copy failed');
  }
  function showCopyFallback(text) {
    var dict = I18N[current] || I18N.en;
    var existing = document.getElementById('copy-fallback');
    if (existing) existing.remove();
    var mask = document.createElement('div');
    mask.id = 'copy-fallback';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:12px;max-width:560px;width:100%;padding:18px 18px 14px;box-shadow:0 20px 50px rgba(15,23,42,.2);';
    panel.innerHTML = '<div style="font-weight:700;margin-bottom:8px;color:#0f172a;">' + (dict.manualCopyTitle || 'Copy') + '</div><div style="font-size:13px;color:#64748b;margin-bottom:10px;">' + (dict.manualCopyHint || '') + '</div>';
    var area = document.createElement('textarea');
    area.value = text;
    area.readOnly = true;
    area.style.cssText = 'width:100%;min-height:110px;font-family:IBM Plex Mono,ui-monospace,monospace;font-size:12.5px;padding:10px;border:1px solid #e2e8f0;border-radius:8px;resize:vertical;color:#0f172a;';
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = dict.close || 'Close';
    close.style.cssText = 'margin-top:12px;appearance:none;border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 12px;font-weight:600;cursor:pointer;';
    close.onclick = function () { mask.remove(); };
    mask.onclick = function (ev) { if (ev.target === mask) mask.remove(); };
    panel.appendChild(area); panel.appendChild(close); mask.appendChild(panel);
    document.body.appendChild(mask);
    area.focus(); area.select();
  }
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; } catch (e) {}
    }
    try { fallbackCopy(text); } catch (e) { showCopyFallback(text); throw e; }
  }
  function flash(btn, ok) {
    var dict = I18N[current] || I18N.en;
    var prev = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', prev);
    if (ok) {
      btn.classList.add('copied');
      btn.textContent = dict.copied || 'Copied';
      setTimeout(function () { btn.classList.remove('copied'); btn.textContent = prev; }, 1600);
    } else {
      btn.textContent = dict.selectText || 'Select';
      setTimeout(function () { btn.textContent = prev; }, 1600);
    }
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy], [data-copy-target], [data-copy-i18n]');
    if (!btn || btn.tagName === 'A') return;
    e.preventDefault();
    var text = '';
    if (btn.hasAttribute('data-copy-target')) {
      var target = document.getElementById(btn.getAttribute('data-copy-target'));
      if (!target) return;
      text = plainTextFrom(target);
    } else {
      text = btn.getAttribute('data-copy') || '';
    }
    copyText(text).then(function () { flash(btn, true); }).catch(function () { flash(btn, false); });
  });

  var links = Array.prototype.slice.call(document.querySelectorAll('#toc-nav a'));
  var sections = links.map(function (a) {
    return document.querySelector(a.getAttribute('href'));
  }).filter(Boolean);
  function setActive() {
    var y = window.scrollY + 80;
    var currentSec = sections[0];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= y) currentSec = sections[i];
    }
    links.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + currentSec.id);
    });
  }
  window.addEventListener('scroll', setActive, { passive: true });
  setActive();
})();
</script>
</body>
</html>
`;

// css currently ends with </style> and was cut from original which had </head> after — rebuild head start
const headOpen = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>KeyoAPI Docs</title>
<!--
  Multilingual brand docs (en / zhCN / zhTW / ja / fr / ru / vi).
  Syncs with New API shell via postMessage { lang } when embedded.
-->
`;

// original file: DOCTYPE... through </style> — extract only style block
const styleStart = html.indexOf("<style>");
const styleBlock = html.slice(styleStart, styleEnd + "</style>".length);

const out = headOpen + styleBlock + body;
fs.writeFileSync(docsPath, out, "utf8");
console.log("Wrote", docsPath, "(" + out.length + " bytes)");

// Keep mirrors in sync
for (const mirror of [
  path.join(root, "docs", "keyoapi-接入文档.html"),
  path.join(root, "new-api", "web", "public", "keyoapi-docs.html"),
]) {
  fs.writeFileSync(mirror, out, "utf8");
  console.log("Synced", mirror);
}
