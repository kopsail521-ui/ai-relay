# PRD — 充值金 / 赠送金分层钱包

## 1. Summary

把 KeyoAPI 账户从「一笔配额」改成两笔钱：**充值金**可打任意模型；**赠送金**只能打免费模型（对内按收费孪生价扣，对外价目仍显示免费 / $0）。新用户注册送 **$10 赠送金**；老用户每成功邀请一人注册，立刻得 **$3 赠送金**。存量 `quota` 全部视为充值金。

## 2. Contacts

| 角色 | 人 | 说明 |
|------|----|------|
| 决策 | 老板 | 规则已拍板（见 §7.4） |
| 实现 | 研发 | New API 计费 + 钱包 UI + 兑换码 |
| 运营 | 客服 | 话术：免费仍耗赠送金 |

## 3. Background

现在用户只有 `users.quota`。邀请奖励先堆在 `aff_quota`，要手动「奖励转入余额」才能用；新用户赠送 `QuotaForNewUser` 也进同一桶，能打付费模型。免费模型多数 `ratio/price=0`，真正不扣费，成本全由平台扛。

要控试用成本、同时保持「免费」观感，必须分账：补贴只打免费池，且按收费价计量。

## 4. Objective

- 试用可玩、付费模型必须充值。
- 邀请带来的额度不能洗成通用余额。
- 对外仍是 $0 免费模型；对内账本清楚。

**Key Results（上线后 30 天）**

- KR1：≥80% 新注册用户钱包出现 $10 赠送金且未进入充值金。
- KR2：邀请发放在注册成功当次完成；邀请人 `gift` 增加 $3，且无法转入充值金。
- KR3：付费模型请求 0 次从赠送金扣成功（监控告警）。
- KR4：赠送金耗尽后 7 日首次充值率可统计（基线先打点）。

## 5. Market Segment(s)

- **新开发者**：要一把能跑通的 key，不想先付钱。
- **已付费用户**：要拉熟人；奖励只能试免费池，不能抵付费账单。
- **刷邀请的人**：产品上允许注册即奖，必须靠风控压成本（V1 最小：同 IP / 同设备计数 + 后台可关发放）。

## 6. Value Proposition(s)

- 新用户：立刻有 $10 试用（仅免费 ID）。
- 老用户：每邀一人注册 +$3 赠送金，不用再点「转入」。
- 平台：免费展示不变，真实消耗走赠送金或充值金，付费模型必须充值。

## 7. Solution

### 7.1 UX

**钱包顶栏（现 3 列：余额 / 用量 / 请求）改为至少 4 列：**

| 列 | 数据 | 说明 |
|----|------|------|
| 充值余额 | `quota` | 原「当前余额」改名；任意模型 |
| 赠送金 | `gift_quota` | 新列；仅免费模型 |
| 累计用量 | `used_quota` | 两金合计消耗（可后续拆） |
| API 请求 | `request_count` | 保持 |

**邀请卡**

- 去掉「奖励转入余额」按钮和转入弹窗。
- 文案改为：每邀请一位新用户注册成功，立即获得 $3 **赠送金**（仅免费模型）。
- 三列改为：赠送金（当前） / 累计邀请奖励 / 邀请人数。当前赠送金也可只在顶栏展示，邀请卡保留「累计邀请奖励 + 人数 + 链接」。

**兑换**

- 原兑换码默认进 **充值金**。
- 新增 **体验码**：兑换进 **赠送金**。用户侧可同一输入框，后台按码类型入账。

**定价 / 免费页**

- `/pricing`、`/free-models`、控制台模型卡：免费 ID 仍显示 $0 / 免费。
- 用户账单可选「赠送金抵扣 $x.xx」；管理端必须看到孪生价成本。

**余额不足报错**

- 免费模型：赠送金不足时自动用充值金；两金都不足才 403。
- 付费模型：只看充值金，赠送金再多也不能用。

### 7.2 Key Features

**账户分账**

- `quota` = 充值金（充值、Waffo/易支付、普通兑换码、管理员加额默认）。
- `gift_quota` = 赠送金（注册 $10、邀请人 $3、体验码、管理员明确加赠送）。
- `used_quota` 继续记总消耗；建议日志带 `wallet=paid|gift`。

**存量迁移**

- 现有 `quota` → 全部充值金，不拆。
- 现有未转入的 `aff_quota` → **迁入赠送金**（性质是邀请奖励，禁止再转入充值金）。
- `aff_history` 仅作累计展示，不再作为可转额度。
- `POST /api/user/aff_transfer`：关闭（返回明确错误）或改为 no-op。

**发放（注册成功即发）**

| 事件 | 对象 | 金额 | 钱包 |
|------|------|------|------|
| 任意方式注册成功（邮箱 / Google 等） | 新用户 | $10 | 赠送金 |
| 带邀请关系的注册成功 | 邀请人 | $3 | 赠送金 |
| 被邀请人 | 不再额外叠加 `QuotaForInvitee` | — | 仅 $10 |

金额按现网 `QuotaPerUnit`（默认 500000 = $1）换算：$10 = 5_000_000，$3 = 1_500_000。配置项建议新键 `GiftQuotaForNewUser` / `GiftQuotaForInviter`，与旧 `QuotaForNewUser`（进主余额）分开，避免误发到充值金。

**扣费顺序**

1. 判定是否免费模型（同一白名单，计费与展示共用）。
2. **付费模型**：只预扣/结算 `quota`。
3. **免费模型**：先 `gift_quota`，不够的差额从 `quota` 扣（允许一笔请求拆两钱包）。
4. 退款按原扣钱包退回。

**免费模型计价**

- 对外：price/ratio 展示 0。
- 对内：每个 free ID 绑定收费孪生（如 `glm-5.3-flash:free` → `glm-5.3-flash`），按孪生 **售价** 扣赠送金/充值金。
- 无孪生映射：拒绝上架或该 ID 不允许用赠送金（V1 必须映射完整）。

**体验码**

- `redemptions` 增加类型：`paid`（默认）/ `gift`。
- 管理后台创建时可选手动额度进哪一桶。
- 兑换日志写钱包类型。

**前端仍显示免费**

- creem `/api/pricing` 注入、marketplace copy：free 标签与 $0 不变。
- 控制台余额数字必须分两列，不能把赠送金加进「可打 GPT」的余额里。

### 7.3 Technology（改动面）

| 层 | 文件 / 模块 | 改什么 |
|----|-------------|--------|
| DB | `users` | 加 `gift_quota`；迁移 `aff_quota`→gift |
| DB | `redemptions` | 加 `credit_wallet`=`paid\|gift` |
| 用户缓存 | `user_cache.go` / Redis | 预扣必须读到 gift，否则会超扣 |
| 扣费 | `service/quota.go`、`text_quota.go`、relay 预扣/补扣/退款、异步 task | 双钱包 + 拆单 |
| 注册邀请 | `model/user.go` `Insert` / `finishInsert` / `FinalizeOAuthUserCreation` / `inviteUser` | $10/$3 进 gift，不再 `IncreaseUserQuota` / 不再堆 `aff_quota` |
| 充值 | `controller/topup*.go`、`creditTopUpQuota` | 只加 `quota` |
| 兑换 | `model/redemption.go` + 后台表单 | 体验码进 gift |
| 邀请转账 | `controller` `TransferAffQuota` | 下线 |
| 管理配置 | `QuotaForNewUser` 等 | 新 gift 配置；后台文案 |
| 钱包 UI | `wallet-stats-card`、`affiliate-rewards-card`、去掉 transfer-dialog | 充值余额 + 赠送金 |
| i18n | `en.json` / `zh*.json` 等 | 新文案 |
| 定价展示 | creem inject、`/free-models` | 仍 $0 |
| 日志 | `RecordLog` | 注册赠送 / 邀请 / 体验码 / 扣费钱包 |
| 用户列表后台 | users 表 | 两列余额可搜可改 |

内部额度单位不变（`QuotaPerUnit`）。公开文案禁止出现上游名。

### 7.4 Assumptions（已确认 / 仍开放）

**已确认**

- 存量 `quota` = 充值金。
- 钱包：「奖励转入余额」改为展示 **充值余额**；另加 **赠送金** 列。
- 体验码发放赠送金。
- 赠送金不足时，充值金可以打免费模型。
- 邀请在 **注册成功** 即发奖（$3 给邀请人）。

**默认（未反对则按此做）**

- 被邀请人不再另发 `QuotaForInvitee`，只有新用户 $10。
- 未转入的历史 `aff_quota` → 赠送金。
- 免费模型集合 = 广场 / copy 标记为 free 的 ID（含 `:free`），且必须有收费孪生。
- 一笔免费请求允许 gift+paid 拼扣。

**V1 不做**

- 赠送金打付费模型或互转。
- 邀请要首调才发奖。
- 完整反作弊（V1 只做开关 + 基础计数；刷量靠关发放）。

## 8. Release

不要排死日期。建议三刀：

1. **Schema + 迁移 + 钱包只读展示**（先分列，扣费仍走旧 `quota`，可灰度文案）。
2. **扣费路由 + 注册/邀请发放 + 下线转入 + 体验码**（真正分账）。
3. **免费展示仍 $0 + 孪生价映射 + 日志/后台**。

阻断发布：付费模型能扣赠送金；或公开页出现「赠送金按 $x 收费」把免费讲成价目。

---

### 字段草案

```text
users.quota              -- 充值金（不变语义）
users.gift_quota         -- 赠送金 NEW default 0
users.aff_quota          -- 冻结：迁移后恒 0，停止写入
users.aff_history        -- 累计邀请奖励（展示）
users.aff_count          -- 邀请人数

redemptions.credit_wallet  -- 'paid' | 'gift'  default paid

config:
  GiftQuotaForNewUser    -- 5_000_000  ($10)
  GiftQuotaForInviter    -- 1_500_000  ($3)
```

### 扣费伪代码

```text
cost = bill(model)                    # 付费：售价；免费：孪生售价
if paid_model:
  debit quota only
else: # free
  from_gift = min(gift_quota, cost)
  from_paid = cost - from_gift
  require gift_quota+quota >= cost
  debit gift then quota
```

### 验收清单

- 老用户：上线后充值余额 = 原余额；赠送金 = 原 pending 邀请额度（若有）。
- 新用户：注册后赠送金 $10，充值金 0（除非另充值）。
- 邀请：B 注册成功，A 赠送金 +$3，A 充值金不变；无转入按钮。
- 体验码：只加赠送金。
- 普通兑换码 / 在线充值：只加充值金。
- `glm-5.3-flash:free`：前端 $0；实际扣赠送金（不足用充值金）；日志有金额。
- `gpt-5.6-terra`：只扣充值金；赠送金再多也 余额不足。
- `aff_transfer` 不可把赠送洗成充值。
