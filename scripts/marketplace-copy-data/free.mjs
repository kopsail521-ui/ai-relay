export default {
  "DeepSeek-Prover-V2-7B:free": {
    unit: "token", in: "0.01", out: "0.04",
    fam: "DeepSeek Prover V2 7B 的赠送金调用模型",
    famEn: "DeepSeek Prover V2 7B gift-credit edition",
    feat: "调用按对应模型费率计费，优先扣减赠送金，赠送金不足时扣充值余额",
    featEn: "billed at the base model rate; gift credits are used first, with any shortfall charged to your recharge balance",
    ctx: "16K", mod: "文本", modEn: "text",
    usage: "数学定理证明、形式化验证、研究辅助",
    usageEn: "mathematical theorem proving, formal verification, research assistance"
  },
  "Atria-dawn-v2:free": {
    unit: "token", in: "0.01", out: "0.04",
    fam: "Atria Dawn V2 的赠送金调用模型",
    famEn: "Atria Dawn V2 gift-credit edition",
    feat: "调用按对应模型费率计费，优先扣减赠送金，赠送金不足时扣充值余额",
    featEn: "billed at the base model rate; gift credits are used first, with any shortfall charged to your recharge balance",
    ctx: "128K", mod: "文本", modEn: "text",
    usage: "文献整理、笔记生成、研究辅助",
    usageEn: "literature organization, note generation, research assistance"
  },
  "keyo-flash:free": {
    unit: "token",
    fam: "Keyo Flash 的赠送金调用模型",
    famEn: "Keyo Flash gift-credit edition",
    feat: "可用赠送金调用，按对应模型费率计费，优先扣减赠送金；新用户注册送 $10，每邀请一位新用户送 $3",
    featEn: "callable with gift credits at the base model rate; gift credits are used first — new users get $10, and each successful invite earns $3",
    mod: "文本", modEn: "text",
    usage: "通用对话、内容创作、智能助手",
    usageEn: "general chat, content creation, intelligent assistance"
  },
  "keyo-flash2:free": {
    unit: "token",
    fam: "Keyo Flash2 的赠送金调用模型",
    famEn: "Keyo Flash2 gift-credit edition",
    feat: "可用赠送金调用，按对应模型费率计费，优先扣减赠送金；新用户注册送 $10，每邀请一位新用户送 $3",
    featEn: "callable with gift credits at the base model rate; gift credits are used first — new users get $10, and each successful invite earns $3",
    mod: "文本", modEn: "text",
    usage: "通用对话、内容创作、智能助手",
    usageEn: "general chat, content creation, intelligent assistance"
  }
};