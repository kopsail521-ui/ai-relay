import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "marketplace-copy-data");
const OUT_FILES = [
  path.join(ROOT, "config", "marketplace-model-copy.json"),
  path.join(ROOT, "services", "creem-moderation-proxy", "marketplace-model-copy.json"),
];

// ---------- 价格本地化 ----------
const PRICE = {
  token: {
    zhCN: (m) => `输入 $${m.in} / 输出 $${m.out} 每百万 tokens`,
    zhTW: (m) => `輸入 $${m.in} / 輸出 $${m.out} 每百萬 tokens`,
    en: (m) => `${m.in} in / ${m.out} out per 1M tokens`,
    fr: (m) => `${m.in} $ entrée / ${m.out} $ sortie par million de tokens`,
    ru: (m) => `${m.in} $ ввод / ${m.out} $ вывод за 1M токенов`,
    ja: (m) => `入力 $${m.in} / 出力 $${m.out}（100万トークンあたり）`,
    vi: (m) => `${m.in} $ đầu vào / ${m.out} $ đầu ra mỗi 1M token`,
  },
  request: {
    zhCN: (m) => `$${m.per}/次`,
    zhTW: (m) => `$${m.per}/次`,
    en: (m) => `${m.per} / request`,
    fr: (m) => `${m.per} $ / requête`,
    ru: (m) => `${m.per} $ / запрос`,
    ja: (m) => `${m.per} $ / 回`,
    vi: (m) => `${m.per} $ / lần`,
  },
  second: {
    zhCN: (m) => `$${m.per}/秒`,
    zhTW: (m) => `$${m.per}/秒`,
    en: (m) => `${m.per} / second`,
    fr: (m) => `${m.per} $ / seconde`,
    ru: (m) => `${m.per} $ / секунду`,
    ja: (m) => `${m.per} $ / 秒`,
    vi: (m) => `${m.per} $ / giây`,
  },
  page: {
    zhCN: (m) => `$${m.per}/页`,
    zhTW: (m) => `$${m.per}/頁`,
    en: (m) => `${m.per} / page`,
    fr: (m) => `${m.per} $ / page`,
    ru: (m) => `${m.per} $ / страница`,
    ja: (m) => `${m.per} $ / ページ`,
    vi: (m) => `${m.per} $ / trang`,
  },
  "10k_chars": {
    zhCN: (m) => `$${m.per}/10K 字符`,
    zhTW: (m) => `$${m.per}/10K 字元`,
    en: (m) => `${m.per} / 10K chars`,
    fr: (m) => `${m.per} $ / 10K caractères`,
    ru: (m) => `${m.per} $ / 10K символов`,
    ja: (m) => `${m.per} $ / 1万字`,
    vi: (m) => `${m.per} $ / 10K ký tự`,
  },
  character: {
    zhCN: (m) => `$${m.per}/字符`,
    zhTW: (m) => `$${m.per}/字元`,
    en: (m) => `${m.per} / character`,
    fr: (m) => `${m.per} $ / caractère`,
    ru: (m) => `${m.per} $ / символ`,
    ja: (m) => `${m.per} $ / 文字`,
    vi: (m) => `${m.per} $ / ký tự`,
  },
};

const BADGE = {
  million_chars: { zhCN: "按字符计费", zhTW: "按字元計費", en: "Per character", fr: "Par caractère", ru: "За символ", ja: "文字課金", vi: "Theo ký tự" },
  token: { zhCN: "按 Token 计费", zhTW: "按 Token 計費", en: "Token-based", fr: "Au token", ru: "По токенам", ja: "Token 課金", vi: "Theo token" },
  request: { zhCN: "按次计费", zhTW: "按次計費", en: "Per Request", fr: "Par requête", ru: "За запрос", ja: "リクエスト課金", vi: "Theo lần gọi" },
  second: { zhCN: "按秒计费", zhTW: "按秒計費", en: "Per Second", fr: "Par seconde", ru: "За секунду", ja: "秒課金", vi: "Theo giây" },
  page: { zhCN: "按页计费", zhTW: "按頁計費", en: "Per Page", fr: "Par page", ru: "За страницу", ja: "ページ課金", vi: "Theo trang" },
  "10k_chars": { zhCN: "按 10K 字符计费", zhTW: "按 10K 字元計費", en: "Per 10K chars", fr: "Par 10K caractères", ru: "За 10K символов", ja: "1万字課金", vi: "Theo 10K ký tự" },
  character: { zhCN: "按字符计费", zhTW: "按字元計費", en: "Per Character", fr: "Par caractère", ru: "За символ", ja: "文字課金", vi: "Theo ký tự" },
};

const SUFFIX = {
  million_chars: { zhCN: "/百万字符", zhTW: "/百萬字元", en: "/ 1M characters", fr: "/ 1M caractères", ru: "/ 1M символов", ja: "/ 100万文字", vi: "/ 1M ký tự" },
  token: { zhCN: "", zhTW: "", en: "", fr: "", ru: "", ja: "", vi: "" },
  request: { zhCN: "/次", zhTW: "/次", en: "/ request", fr: "/ requête", ru: "/ запрос", ja: "/ 回", vi: "/ lần" },
  second: { zhCN: "/秒", zhTW: "/秒", en: "/ second", fr: "/ seconde", ru: "/ секунду", ja: "/ 秒", vi: "/ giây" },
  page: { zhCN: "/页", zhTW: "/頁", en: "/ page", fr: "/ page", ru: "/ страница", ja: "/ ページ", vi: "/ trang" },
  "10k_chars": { zhCN: "/10K 字符", zhTW: "/10K 字元", en: "/ 10K chars", fr: "/ 10K caractères", ru: "/ 10K символов", ja: "/ 1万字", vi: "/ 10K ký tự" },
  character: { zhCN: "/字符", zhTW: "/字元", en: "/ character", fr: "/ caractère", ru: "/ символ", ja: "/ 文字", vi: "/ ký tự" },
};

const PRICE_KEY = {
  million_chars: { zhCN: "每百万字符", zhTW: "每百萬字元", en: "Per 1M characters", fr: "Par 1M caractères", ru: "За 1M символов", ja: "100万文字ごと", vi: "Mỗi 1M ký tự" },
  token: { zhCN: "", zhTW: "", en: "", fr: "", ru: "", ja: "", vi: "" },
  request: { zhCN: "每次请求", zhTW: "每次請求", en: "Per request", fr: "Par requête", ru: "За запрос", ja: "リクエストごと", vi: "Mỗi lần gọi" },
  second: { zhCN: "每秒", zhTW: "每秒", en: "Per second", fr: "Par seconde", ru: "За секунду", ja: "秒ごと", vi: "Mỗi giây" },
  page: { zhCN: "每页", zhTW: "每頁", en: "Per page", fr: "Par page", ru: "За страницу", ja: "ページごと", vi: "Mỗi trang" },
  "10k_chars": { zhCN: "每 10K 字符", zhTW: "每 10K 字元", en: "Per 10K chars", fr: "Par 10K caractères", ru: "За 10K символов", ja: "1万字ごと", vi: "Mỗi 10K ký tự" },
  character: { zhCN: "每字符", zhTW: "每字元", en: "Per character", fr: "Par caractère", ru: "За символ", ja: "文字ごと", vi: "Mỗi ký tự" },
};

// ---------- 简繁转换（覆盖描述常用词） ----------
const T2S = {
  "模型": "模型", "对话": "對話", "系列": "系列", "旗舰": "旗艦", "轻量": "輕量", "高速": "高速",
  "复杂": "複雜", "推理": "推理", "代码": "代碼", "生成": "生成", "支持": "支援", "上下文": "上下文",
  "适合": "適合", "场景": "場景", "输入": "輸入", "输出": "輸出", "计费": "計費", "价格": "價格",
  "图像": "圖像", "视频": "影片", "音频": "音訊", "文本": "文本", "语音": "語音", "识别": "辨識",
  "合成": "合成", "理解": "理解", "编码": "編碼", "智能体": "智能體", "任务": "任務", "能力": "能力",
  "表现": "表現", "稳定": "穩定", "可靠": "可靠", "工具": "工具", "调用": "呼叫", "低延迟": "低延遲",
  "高吞吐": "高吞吐", "并发": "並發", "规模": "規模", "高频": "高頻", "实时": "即時", "应用": "應用",
  "客服": "客服", "内容": "內容", "分类": "分類", "摘要": "摘要", "海量": "海量", "处理": "處理",
  "顶级": "頂級", "深度": "深度", "数学": "數學", "科学": "科學", "多步": "多步", "规划": "規劃",
  "研究": "研究", "算法": "演算法", "开发": "開發", "系统": "系統", "设计": "設計", "分析": "分析",
  "均衡": "均衡", "长上下文": "長上下文", "创作": "創作", "文档": "文件", "软件": "軟體", "营销": "行銷",
  "响应": "回應", "迅速": "迅速", "成本": "成本", "低廉": "低廉", "标注": "標註", "审核": "審核",
  "辅助": "輔助", "机器人": "機器人", "入门": "入門", "级": "級", "文生图": "文生圖", "图生图": "圖生圖",
  "速度": "速度", "批量": "批量", "配图": "配圖", "概念": "概念", "草图": "草圖", "社交": "社交",
  "媒体": "媒體", "素材": "素材", "细节": "細節", "丰富": "豐富", "光影": "光影", "画质": "畫質",
  "海报": "海報", "电商": "電商", "产品": "產品", "创意": "創意", "插画": "插畫", "高端": "高端",
  "语义": "語義", "构图": "構圖", "精细": "精細", "编辑": "編輯", "商业": "商業", "品牌": "品牌",
  "艺术": "藝術", "原型": "原型", "探索": "探索", "分辨率": "解析度", "还原": "還原", "印刷": "印刷",
  "物料": "物料", "精致": "精緻", "音乐": "音樂", "完整": "完整", "歌曲": "歌曲", "歌词": "歌詞",
  "文字": "文字", "描述": "描述", "自定义": "自訂", "续写": "續寫", "背景": "背景", "灵感": "靈感",
  "试听": "試聽", "原创": "原創", "配乐": "配樂", "样带": "樣帶", "决策": "決策", "判断": "判斷",
  "输出": "輸出", "概率": "機率", "校准": "校準", "状态": "狀態", "策略": "策略", "选择": "選擇",
  "评估": "評估", "流程": "流程", "自动化": "自動化", "轻量": "輕量", "决策": "決策", "实时": "即時",
  "路由": "路由", "多语言": "多語言", "筛选": "篩選", "规则": "規則", "替代": "替代", "结构化": "結構化",
  "读取": "讀取", "微调": "微調", "校准": "校準", "嵌入": "嵌入", "向量": "向量", "检索": "檢索",
  "增强": "增強", "知识库": "知識庫", "相似度": "相似度", "去重": "去重", "聚类": "聚類", "推荐": "推薦",
  "匹配": "匹配", "向量化": "向量化", "实时检索": "即時檢索", "重排序": "重排序", "相关": "相關",
  "性判断": "性判斷", "查询": "查詢", "重排": "重排", "精度": "精度", "票据": "票據", "证件": "證件",
  "数字化": "數位化", "解析": "解析", "结构化": "結構化", "公式": "公式", "表格": "表格", "版式": "版式",
  "学术": "學術", "论文": "論文", "转换": "轉換", "构建": "構建", "分割": "分割", "掩码": "遮罩",
  "目标": "目標", "抠图": "去背", "医学": "醫學", "影像": "影像", "背景移除": "背景移除", "移除": "移除",
  "一键": "一鍵", "图片": "圖片", "人像": "人像", "放大": "放大", "恢复": "恢復", "老照片": "老照片",
  "修复": "修復", "视觉": "視覺", "检测": "偵測", "关键点": "關鍵點", "监控": "監控", "工业": "工業",
  "质检": "質檢", "零售": "零售", "矫正": "矯正", "畸变": "畸變", "阴影": "陰影", "摩尔纹": "摩爾紋",
  "可读性": "可讀性", "扫描": "掃描", "纸质": "紙質", "资料": "資料", "拍摄": "拍攝", "动漫": "動漫",
  "优化": "優化", "插画": "插畫", "超分辨率": "超解析度", "水印": "浮水印", "去除": "去除", "字幕": "字幕",
  "二次创作": "二次創作", "清洗": "清洗", "超分": "超分", "旧片": "舊片", "升级": "升級", "修复": "修復",
  "清晰度": "清晰度", "档位": "檔位", "老旧": "老舊", "后期": "後期", "数字人": "數位人", "播报": "播報",
  "照片": "照片", "驱动": "驅動", "逼真": "逼真", "虚拟": "虛擬", "主播": "主播", "口播": "口播",
  "唇形": "唇形", "动作": "動作", "自然": "自然", "时长": "時長", "课程": "課程", "讲解": "講解",
  "介绍": "介紹", "连贯": "連貫", "画质": "畫質", "电影级": "電影級", "配置": "設定", "大片": "大片",
  "生成": "生成", "创意视频": "創意影片", "影视": "影視", "预览": "預覽", "全高清": "全高清",
  "高保真": "高保真", "成熟": "成熟", "稳定": "穩定", "快速版": "快速版", "时效性": "時效性",
  "轻量版": "輕量版", "预算": "預算", "敏感": "敏感", "迭代": "迭代", "原型": "原型", "高迭代": "高迭代",
  "最低": "最低", "测试": "測試", "新一代": "新一代", "多分辨率": "多解析度", "参考视频": "參考影片",
  "技术": "技術", "特点": "特點", "创意": "創意", "模型": "模型", "文本": "文本", "图像": "圖像",
  "质量": "質量", "多档": "多檔", "档": "檔", "生成视频": "生成影片", "动态视频": "動態影片",
  "风格": "風格", "多种": "多種", "短视频": "短影音", "广告": "廣告", "动态": "動態",
};

function toTraditional(text) {
  let out = text;
  // 常见整体词优先
  const phrases = [
    ["视频生成", "影片生成"], ["图像生成", "圖像生成"], ["语音合成", "語音合成"], ["语音识别", "語音辨識"],
    ["文本嵌入", "文字嵌入"], ["文本转语音", "文字轉語音"], ["文字识别", "文字辨識"], ["通用文字", "通用文字"],
    ["按次计费", "按次計費"], ["按秒计费", "按秒計費"], ["按页计费", "按頁計費"], ["按字符计费", "按字元計費"],
    ["按 Token 计费", "按 Token 計費"], ["赠送金", "贈送金"], ["新用户", "新用戶"], ["注册", "註冊"],
    ["邀请", "邀請"], ["充值", "儲值"], ["余额", "餘額"], ["赠送", "贈送"], ["每百万", "每百萬"],
    ["上下文窗口", "上下文視窗"], ["上下文长度", "上下文長度"], ["支持", "支援"], ["适合", "適合"],
    ["场景", "場景"], ["编程", "程式設計"], ["研发", "研發"], ["企业级", "企業級"], ["工作流", "工作流"],
    ["自动化", "自動化"], ["数据", "數據"], ["智能助手", "智慧助手"], ["对话", "對話"], ["模型", "模型"],
  ];
  for (const [s, t] of phrases) out = out.split(s).join(t);
  for (const [s, t] of Object.entries(T2S)) out = out.split(s).join(t);
  return out;
}

// ---------- 描述组装 ----------
// 用户明确规则：所有模型不要在简介里写价格，以下面定价分组表为准
function buildDescriptions(m) {
  const ctxZh = m.ctx ? `支持 ${m.ctx} 上下文。` : "";
  const ctxEn = m.ctx ? ` ${m.ctx} context window.` : "";
  const modZh = m.mod ? `支持${m.mod}模态。` : "";
  const modEn = m.modEn ? ` ${m.modEn} modality.` : "";

  const zhCN = `${m.fam}。${m.feat}。${ctxZh}${modZh}适合${m.usage}。`.replace(/。+/g, "。");
  const en = `${m.famEn}. ${m.featEn}.${ctxEn}${modEn} Ideal for ${m.usageEn}.`.replace(/\.\./g, ".");
  const zhTW = toTraditional(zhCN);
  const fr = `${m.famEn}. ${m.featEn}.${ctxEn}${modEn} Idéal pour ${m.usageEn}.`.replace(/\.\./g, ".");
  const ru = `${m.famEn}. ${m.featEn}.${ctxEn}${modEn} Подходит для ${m.usageEn}.`.replace(/\.\./g, ".");
  const ja = `${m.famEn}. ${m.featEn}.${ctxEn}${modEn} ${m.usageEn} 向け。`.replace(/\.\./g, ".");
  const vi = `${m.famEn}. ${m.featEn}.${ctxEn}${modEn} Phù hợp cho ${m.usageEn}.`.replace(/\.\./g, ".");

  return {
    description: zhCN,
    descriptions: { zhCN, zhTW, en, fr, ru, ja, vi },
    description_zh: zhCN,
    description_en: en,
  };
}

function buildEntry(m, existingEntry) {
  const { description, descriptions, description_zh, description_en } = buildDescriptions(m);
  const badge = BADGE[m.unit] || BADGE.request;
  const suffix = SUFFIX[m.unit] || SUFFIX.request;
  const priceKey = PRICE_KEY[m.unit] || PRICE_KEY.request;
  const entry = {
    description,
    descriptions,
    unit: m.unit,
    badge: { ...badge },
    suffix: { ...suffix },
    price_key: { ...priceKey },
    description_zh,
    description_en,
    badge_zh: badge.zhCN,
    badge_en: badge.en,
    suffix_zh: suffix.zhCN,
    suffix_en: suffix.en,
    price_key_zh: priceKey.zhCN,
    price_key_en: priceKey.en,
  };
  if (existingEntry) {
    if (existingEntry.price_table) entry.price_table = existingEntry.price_table;
    if (existingEntry.display_names) entry.display_names = existingEntry.display_names;
    if (existingEntry.free != null) entry.free = existingEntry.free;
  }
  return entry;
}

// ---------- 合并数据 ----------
const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".mjs"));
let models = {};
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(DATA_DIR, f)).href);
  Object.assign(models, mod.default);
}

// ---------- 读现有配置，保留特殊键 ----------
const existing = JSON.parse(fs.readFileSync(OUT_FILES[0], "utf8"));
const out = {};
// 保留/更新特殊键
out["__tags__"] = existing["__tags__"] || {};
if (!out["__tags__"]["音乐"]) {
  out["__tags__"]["音乐"] = { zhCN: "音乐", zhTW: "音樂", en: "Music", fr: "Musique", ru: "Музыка", ja: "音楽", vi: "Âm nhạc" };
}
out["__vendors__"] = existing["__vendors__"] || {};
out["__free_suffix__"] = {
  zhCN: "（赠送金）",
  zhTW: "（贈送金）",
  en: " (Gift Credit)",
  fr: " (Crédit offert)",
  ru: " (Подарочный кредит)",
  ja: "（ギフトクレジット）",
  vi: " (Tín dụng tặng)",
};
if (existing.tags) out.tags = existing.tags;
if (existing.vendors) out.vendors = existing.vendors;

// 写入模型条目（保持现有键顺序在前，新 :free 追加在后）
for (const key of Object.keys(existing)) {
  if (key.startsWith("__") || key === "tags" || key === "vendors") continue;
  if (models[key]) {
    out[key] = buildEntry(models[key], existing[key]);
    delete models[key];
  } else {
    // 保留旧条目但重写（理论上不应发生）
    out[key] = existing[key];
  }
}
// 追加新模型（:free）
for (const key of Object.keys(models)) {
  out[key] = buildEntry(models[key], existing[key]);
}

for (const file of OUT_FILES) {
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("written", file, Object.keys(out).length, "keys");
}
console.log("models written:", Object.keys(out).filter((k) => !k.startsWith("__") && k !== "tags" && k !== "vendors").length);
