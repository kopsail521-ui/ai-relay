# 上架 DeepSeek 官方 API（高峰价×1.2）

模型：
- deepseek-v4.1-flash → upstream deepseek-flash · 售价 ~$0.36 / $1.44
- deepseek-v4-pro-0813 → upstream deepseek-v4-pro · 售价 ~$1.584 / $4.752

1) 在 VPS 写入密钥（勿提交 Git）：
   grep -q '^DEEPSEEK_API_KEY=' /opt/ai-relay/.env || echo 'DEEPSEEK_API_KEY=sk-YOUR_KEY' | sudo tee -a /opt/ai-relay/.env

2) 粘贴 scripts/vps-add-deepseek-official-short.txt
   → DONE_ADD_DEEPSEEK_OFFICIAL
