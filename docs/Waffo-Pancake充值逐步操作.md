# Waffo Pancake 充值接入 · KeyoAPI

New API **已内置** Waffo Pancake（无需改代码发版），在管理后台配置即可。

站点：`https://www.keyoapi.xyz`  
Webhook（测试）：`https://www.keyoapi.xyz/api/waffo-pancake/webhook/test`  
Webhook（生产）：`https://www.keyoapi.xyz/api/waffo-pancake/webhook/prod`  

> 注意：路径末尾的 `/test` 或 `/prod` **必须带**，否则 New API 收不到回调，订单会一直 Pending。

---

## 一、在 Waffo Pancake 后台准备

1. 打开 Pancake 控制台（你截图里的那个），确认右上角是 **生产模式** 或先用测试模式跑通。
2. 顶部点 **「API 与开发」**，拿到：
   - **Merchant ID**（商户 ID）
   - **Private Key**（私钥，用于签名）
   - 若有 **Webhook 签名/公钥**，一并记下
3. **产品**页你已有 `keyo1`（约 `$1`），点复制记下完整 **Product ID**（形如 `PROD_...`）
4. 找到当前 **店铺 / Store**，记下 **Store ID**（形如 `store_...`）
5. **网络钩子 / Webhook** 里新增：
   - 测试 URL：`https://www.keyoapi.xyz/api/waffo-pancake/webhook/test`
   - 生产 URL：`https://www.keyoapi.xyz/api/waffo-pancake/webhook/prod`
   - 事件：勾选支付成功 / checkout completed 一类（按后台选项全选支付相关即可）
   - **生产** 和 **测试** 若分两个槽位，分别填，别混用

---

## 二、在 KeyoAPI（New API）后台配置

1. 管理员登录 https://www.keyoapi.xyz  
2. **系统设置 → 支付 / 运营**（找 **Waffo Pancake** 或 **Pancake** 标签）  
3. 打开 **启用 Waffo Pancake**  
4. 填入：
   - Merchant ID  
   - Private Key  
   - Store ID  
   - Product ID（绑定你的 `keyo1`；钱包可按金额覆盖单价，一般绑定一个商品即可）  
   - Return URL：可填 `https://www.keyoapi.xyz/console/topup` 或留空用默认  
5. **保存**（有的版本有「保存 Waffo Pancake 设置」按钮，点它）  
6. （可选）**支付方式 PayMethods** 里增加一项，例如：

```json
[{"name":"Waffo Pancake","type":"waffo_pancake","color":"rgba(34,197,94,0.85)"}]
```

若界面有可视化开关「启用 Waffo Pancake 充值」，打开即可。

7. **Creem**：可关掉 Test Mode 产品（你已清空 `CreemProducts`），避免钱包再出现 Creem。

---

## 三、自测

1. 用带邮箱的账号打开 **钱包**  
2. 应看到 Waffo / Pancake 充值入口（任意金额或套餐，视版本而定）  
3. 付一笔最小金额（如 $1）  
4. 支付成功后：余额增加 + 订单历史有记录  

若跳转收银台失败：检查 Merchant/私钥/Store/Product 是否都是 **同一环境**（测试密钥配测试、生产密钥配生产）。

---

## 四、你发给我、我可代填的内容（打码私钥中间段也行）

把下面发我（私钥建议私聊或自行后台粘贴）：

```text
WAFFO_MERCHANT_ID=...
WAFFO_PRIVATE_KEY=...（或说「我自己在后台贴」）
WAFFO_STORE_ID=...
WAFFO_PRODUCT_ID=PROD_...
环境：测试 / 生产
```

---

## 注意

- Pancake 同样是 MoR，**也可能审核 API 转售**；比 Creem 友好与否以他们审核为准。  
- 网站要保持可访问（别再 502），法律页和客服邮箱继续留着。  
- Webhook 必须公网 HTTPS，已是 `www.keyoapi.xyz`。
