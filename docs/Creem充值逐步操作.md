# Creem 充值接入 · 逐步操作（KeyoAPI）

站点：`https://www.keyoapi.xyz`  
Webhook（创建时填这个）：

```text
https://www.keyoapi.xyz/api/creem/webhook
```

New API 需要 4 样东西：

| 项 | 说明 |
|----|------|
| CreemApiKey | API 密钥（测试/正式各一把） |
| CreemWebhookSecret | Webhook 签名密钥 |
| CreemTestMode | 测试开 true，正式关 false |
| CreemProducts | 产品列表 JSON（含 Creem 的 product id 和对应额度） |

---

## 一、注册 Creem

1. 打开 https://www.creem.io/ 或 https://creem.io/ 注册并登录  
2. 按提示完成商家资料（Creem 面向全球收款，具体是否支持你的大陆主体以官网审核为准；比 Stripe 对个人/出海更友好的情况常见，但仍以他们审核结果为准）  
3. 进入 **Dashboard（控制台）**

---

## 二、先开测试模式（推荐）

1. 控制台左侧找到 **Test Mode** 开关，先打开  
2. 测试环境和正式环境的 **密钥、产品、Webhook 是分开的**，测通再切正式

---

## 三、创建充值产品

在 Creem 后台创建若干「一次性」商品，例如：

| 对外显示名 | 金额举例 | 用途 |
|------------|----------|------|
| $10 Credit | $10 | 小额 |
| $50 Credit | $50 | 常用 |
| $100 Credit | $100 | 大额 |

每个产品创建后复制 **Product ID**（一般是 `prod_...`）。

说明：Creem 是按「固定商品」结账；用户钱包里会显示这些套餐按钮，不是任意金额输入（和易支付那种填金额略有不同）。

---

## 四、拿 API Key

1. 左侧 **Developers（开发者）**  
2. 复制当前模式（Test / Live）下的 **API Key**  
   - 测试多半是 `creem_test_...`  
   - 正式多半是 `creem_live_...` 之类  

---

## 五、配 Webhook

1. Developers → **Webhooks** → 添加  
2. URL 填：

```text
https://www.keyoapi.xyz/api/creem/webhook
```

3. 事件至少包含支付完成相关（如 `checkout.completed`；若后台是勾选「全部」也可以）  
4. 创建后复制 **Webhook Secret**（签名密钥）

---

## 六、交给我写入站点

把下面写进本机  
`E:\01来粉来粉\中转\ai-relay\.env`：

```env
CREEM_API_KEY=creem_test_...
CREEM_WEBHOOK_SECRET=whsec_或后台给你的密钥
CREEM_TEST_MODE=true
# 产品：productId=Creem的prod_xxx；name=显示名；price=美元标价；quota=到账额度(站点配额单位)
# New API 默认约 QuotaPerUnit=500000 表示 $1 余额
# 若充 $10，quota 可先按 500000*10=5000000
CREEM_PRODUCTS=[{"productId":"prod_xxx","name":"$10","price":"10","quota":"5000000"},{"productId":"prod_yyy","name":"$50","price":"50","quota":"25000000"}]
```

然后回复：**「Creem 写好了」**

我会写入 https://www.keyoapi.xyz ，并帮你确认钱包是否出现 Creem 套餐。

---

## 七、你自己也可先填（可选）

登录管理员 → **系统设置 → 支付 → Creem** 标签：

- API Key  
- Webhook Secret  
- Test Mode 打开  
- Products：用可视化编辑或 JSON  

保存后打开钱包页测试。

---

## 注意

- 大陆身份能否过 Creem 正式收款以他们审核为准；先用 **Test Mode** 把网站链路跑通。  
- 正式上线要：关 Test Mode、换 live API Key、live Webhook、live 产品 ID。  
- 支付合规我们站点已确认过，Creem 配齐密钥后即可启用。
