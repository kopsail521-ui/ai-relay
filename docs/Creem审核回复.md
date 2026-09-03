# Creem 正式收款 · 审核回复草稿（英文可直接粘贴）

把下面英文发给 Creem 通知回复 / 客服，或在 **Balance → Payout Account → Request re-review** 时附上。

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

Legal & support (now public, linked from footer / policies)
- Privacy Policy: https://www.keyoapi.xyz/privacy-policy
- Terms of Service (includes Acceptable Use / NSFW prohibitions): https://www.keyoapi.xyz/user-agreement
- Acceptable Use Policy: https://www.keyoapi.xyz/user-agreement
- Support email (shown in footer, notice, docs, and policies): kopsail521@gmail.com

API reseller due diligence
- Prior payment processors: none in production yet. We completed end-to-end checkout in Creem Test Mode only (successful $1 test payment + webhook credit).
- Historical transaction volume / chargeback rate: N/A (no live volume yet; new store launching on Creem as first MoR).
- Reason for choosing Creem: we need a Merchant of Record for global card payments and tax handling for a small indie API gateway; mainland Stripe onboarding was not viable for our situation. Creem Test Mode integration is complete; we are requesting live approval to begin real sales.

Image generation compliance
- Site Terms / AUP explicitly prohibit NSFW, deepfakes, and uncensored marketing.
- We are deploying Creem Moderation API screening on /v1/images/* (fail-closed; deny and flag both block) before live image traffic.

We are happy to provide any additional documentation you need. Please re-review our store when convenient.

Store / product: KeyoAPI — https://www.keyoapi.xyz
Support: kopsail521@gmail.com

Thank you,
KeyoAPI
```

---

## 你还要自己完成的几步

1. **确认能收到 `kopsail521@gmail.com` 邮件**  
   这是网站与 Creem 对外展示的客服邮箱，请保持能登录查信。

2. **VPS 同步品牌静态页**（Workbench）  
   本机先跑：`node scripts/print-vps-brand-install.mjs`  
   再把 `scripts/vps-one-liner.txt` 整段贴到服务器执行。

3. **（强烈建议）部署图片 Moderation 代理**  
   见 `docs/Creem-Moderation部署.md`。有文生图就必须接 Creem Moderation API。

4. 改完后回 Creem 点 **Request re-review**，粘贴上面英文。

---

## 说明

- `/privacy-policy` 与 `/user-agreement` 已写入 New API 系统设置，无需登录即可打开。
- 「established API reseller」仍可能被追问历史；没有历史时通过率不保证，回复已如实说明。
