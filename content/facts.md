# KeyoAPI 品牌事实卡（content/facts.md）

用途：所有对外内容（落地页、手册、博客、AI 问答口径）的唯一事实底座。
**无来源的事实一律标 E（待确认），不得直接对外使用。**

## 证据等级

| 级 | 含义 |
|---|---|
| A | 仓库代码/配置可直接验证（附文件引用） |
| B | 公网实测可复现（附最近核验日期） |
| C | 控制台/VPS 内部观测 |
| D | 用户口头/书面陈述 |
| E | 待确认假设，禁止对外引用 |

## 实体

| 事实 | 等级 | 来源 |
|---|---|---|
| 品牌名：KeyoAPI | A | 全站标题、logo |
| 域名：keyoapi.xyz，规范主机 www.keyoapi.xyz（裸域 301 → www） | B | 2026-10-24 实测 |
| **规范定义句（四处逐字一致：首页首屏 / About / 两处 JSON-LD / llms.txt / 本卡）**：`KeyoAPI is a prepaid AI API gateway — one key for chat, speech, OCR and digital humans on a single balance.` | A | scripts/gen-seo-pages.mjs `SITE_DEFINITION`；static/brand/llms.txt |

## 接入

| 事实 | 等级 | 来源 |
|---|---|---|
| Base URL：`https://www.keyoapi.xyz/v1` | A+B | 2026-10-24 实测；手册 |
| 鉴权：`Authorization: Bearer sk-<key>`，OpenAI SDK 兼容 | A | new-api 中间件 |
| 聊天/图像/语音主路径 OpenAI 兼容；OCR、视觉工具、异步视频、数字人走专用 REST | B | /brand/keyo-api-ref.html |

## 计费

| 事实 | 等级 | 来源 |
|---|---|---|
| 预付费钱包，USD；1 美元 = 500,000 配额单位（QuotaPerUnit） | A | new-api 常量 |
| 新用户赠送金 $10（5,000,000 单位）；邀请 +$3 | A | GiftQuotaForNewUser；FAQ a5 |
| `:free` 后缀 = 赠送金通道：按各模型的赠送金价率计费、赠送金优先扣、不足部分扣充值余额（**不是 $0**） | A+C | 2026-10-24 冒烟实测：GLM-ASR:free 扣 3,425 单位（$0.006849×500k），充值余额为 0 |
| `glm-5.3:free` 赠送金价率是付费版 5 倍；`deepseek-v4.1-flash-1017:free` 是 3.33 倍 | B | /free-models 价表 |
| 计价单位随模型而异：token / 按次 / 按秒 / 按字符 | B | FAQ a3 |

## 模型目录（快照 2026-10-24，变动以 /pricing-list 为准）

| 事实 | 等级 | 来源 |
|---|---|---|
| sitemap 共 87 个 URL，全部 www 域 | B | 2026-10-24 实测 |
| 赠送金 ID 共 9 个：Atria-dawn-v2 / DeepSeek-Prover-V2-7B / keyo-flash / keyo-flash2 / glm-5.3 / deepseek-v4.1-flash-1017 / SenseVoiceSmall / GLM-ASR / Spark-TTS-0.5B（均带 `:free`） | B | /free-models |
| TTS 家族：Qwen3-TTS、CosyVoice3、GLM-TTS、IndexTTS-2、Step-Audio-TTS-3B、Spark-TTS-0.5B，另有 eleven-v4 / eleven-v4-turbo / gemini-3.8-flash-tts | B | /tts-api、手册 §1.6 |
| gemini-omni 两个 ID 属 video 类、按秒计价、`POST /v1/videos/generations` | B | /pricing-list（2026-10-24 修复后口径） |
| Spark-TTS-0.5B：config 价 0 vs 线上展示 0.013699——**价目矛盾未决**，对外引用一律以 /pricing-list 实时数为准 | C | config/gitee-selected-models.json vs /api/pricing |

## 不适用 / 禁用表达（对外内容红线）

| 禁用 | 改用 | 等级 |
|---|---|---|
| 「免费模型 / free models / $0」指 `:free` ID | 「gift-credit models / billed from your gift credit / 按赠送金价率计费」 | A |
| 「bill at normal rates」描述赠送金 ID | 「billed at dedicated gift-credit rates (see the gift-credit table)」 | B（P0-1 教训） |
| 「没有赠送金 TTS」 | Spark-TTS-0.5B:free 在售 | B |
| grok voice 3.0 相关页面/承诺 | 控制台未上架，等上架再建页 | C |
| gemini-omni 说成 per-request / chat 端点 | video 类 + /v1/videos/generations 按秒 | B |

## 最高级纪律（cheapest / lowest / only，三轮复盘沉淀）

写任何 `cheapest / lowest / only` 之前，先问：**比较集合包不包含 `/free-models` 那 9 行？**

- 包含 → 措辞必须出现 `gift-credit`（如 "the cheapest lanes overall sit in the gift-credit catalog at ~$0.01 / $0.04"）；
- 不包含 → 必须写 `metered` 或家族限定（如 "cheapest metered chat lane"、"cheapest Claude-class lane"）；
- **禁止**裸写 `cheapest … overall` 指向任何 metered ID（曾三次复现：gpt-6-luna、deepseek-v4.1-flash、-1017 各错一次）。

同规则适用于品牌归属（`is X's …`：写前查 console 目录确认归属）与模板变量（`{id}` 等：改句先 grep 变量和路径片段）。
以上三条已固化为 `scripts/seo-content.test.mjs` 的断言，违规会在 CI 直接失败。

## 待确认（E，不得对外引用）

- Spark-TTS-0.5B:free 端到端链路（passthrough 修复已上主线，等手动授权冒烟跑通后升 C→B）
- `/pricing`（Model Square SPA）是否需要 SSR（当前刻意 noindex，T-005 判定不动）
- RMBG-2.0 对比页 10 倍价差、/tts-api 起价与标题缺口等 20 条清单中未修项（另一个会话在处理）
