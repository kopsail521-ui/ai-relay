# Creem 正式审核 · 整改回复草稿（英文可直接粘贴）

把下面内容发到 Creem 通知回复 / 客服，或在 **Balance → Payout Account → Request re-review** 时附上。

---

## English reply (copy/paste)

```text
Hello Creem team,

Thank you for the review feedback. We have completed the requested website and compliance updates for KeyoAPI.

Product
- Live product URL: https://www.keyoapi.xyz
- What we sell: prepaid API credits for an OpenAI-compatible gateway (chat + image models). Independent reseller / gateway; not affiliated with OpenAI, Anthropic, Google, or other model vendors.
- Pricing is publicly visible at https://www.keyoapi.xyz/pricing and via Wallet top-up products.
- Docs: https://www.keyoapi.xyz/about

Legal & support (now public)
- Privacy Policy: https://www.keyoapi.xyz/privacy-policy
- Terms of Service (includes Acceptable Use / NSFW prohibitions): https://www.keyoapi.xyz/user-agreement
- Acceptable Use Policy: https://www.keyoapi.xyz/brand/aup.html
- Support email (shown in footer, docs, and policies): support@keyoapi.xyz

API reseller due diligence
- Prior payment processors: none in production yet. We completed end-to-end checkout in Creem Test Mode only (successful $1 test payment + webhook credit).
- Historical transaction volume / chargeback rate: N/A (no live volume yet; new store launching on Creem as first MoR).
- Reason for choosing Creem: we need a Merchant of Record for global card payments and tax handling for a small indie API gateway; mainland Stripe onboarding was not viable for our situation. Creem Test Mode integration is complete; we are requesting live approval to begin real sales.

We are happy to provide any additional documentation you need. Please re-review our store when convenient.

Store / product: KeyoAPI — https://www.keyoapi.xyz
Support: support@keyoapi.xyz

Thank you,
KeyoAPI
```

---

## 你还要自己做的 2 件事

1. **邮箱能收到信**  
   把域名邮箱 `support@keyoapi.xyz` 配好（阿里云邮箱 / 转发到你的 QQ 邮箱均可）。Creem 和客户都会写这个地址。

2. **同步品牌静态页到 VPS**（Workbench 执行）：
   ```bash
   # 本机先把 static/brand 整目录上传到服务器 /opt/ai-relay/static/brand
   # 然后在服务器：
   sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh
   ```
   或至少确保 `/opt/ai-relay/static/brand/aup.html` 与更新后的 `keyo-home.html` / `keyo-docs.html` 在线上。

3. 改完后回 Creem 点 **Request re-review**。

---

## 说明

- `/privacy-policy` 与 `/user-agreement` 已写入 New API 系统设置，页脚会显示链接。  
- 若审核仍卡「established API reseller」，可能需要补充其他支付平台历史；没有历史时通过率不保证。  
- 若后续要求 **Creem Moderation API**（文生图），再单独接入。
