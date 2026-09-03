# Grsai 统一接入说明

你的 Grsai 上游同时有两种接口形态，**统一出口**靠 New API 按路径分流：

```
客户
  │  一个 Base URL + 一把 Key（New API 令牌）
  ▼
New API（你的站 :3000）
  │  按 model 名 + 请求路径选渠道
  ▼
Grsai（grsaiapi.com）
  ├─ POST /v1/chat/completions      → gpt-5.6-sol / gpt-5.6-terra
  └─ POST /v1/images/generations    → gpt-image-2 / vip / nano-banana-*
```

Grsai 原生接口 `/v1/api/generate` 一般**不需要**对客户暴露；OpenAI 格式的 `/v1/images/generations` 已够用。

## 一键配置

1. 编辑 `.env`（从 `.env.example` 复制）：
   - `GRSAI_API_KEY` = Grsai 控制台 Key
   - `NEW_API_ADMIN_PASSWORD` = 你在 New API 初始化时设的管理员密码

2. 启动 New API：`start-new-api.bat`，浏览器完成首次管理员注册

3. 创建渠道：

```bat
node scripts/setup-grsai-channel.mjs
```

4. 在 New API 后台 → **令牌** → 新建令牌 → 把 `sk-xxx` 发给客户

## 客户怎么调

| 类型 | 方法 | model 示例 |
|------|------|------------|
| 文本 | `POST /v1/chat/completions` | `gpt-5.6-sol`, `gpt-5.6-terra` |
| 图片 | `POST /v1/images/generations` | `gpt-image-2`, `nano-banana-2` |

```bash
# 文本
curl https://你的域名/v1/chat/completions \
  -H "Authorization: Bearer 客户令牌" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.6-terra","stream":false,"messages":[{"role":"user","content":"hi"}]}'

# 图片
curl https://你的域名/v1/images/generations \
  -H "Authorization: Bearer 客户令牌" \
  -H "Content-Type: application/json" \
  -d '{"model":"nano-banana-2","prompt":"a cat","size":"1024x1024","response_format":"url"}'
```

## 以后再接第二家中转站

1. New API 再建一个「渠道」（另一家 Base URL + Key）
2. 同一个对外 model 名可挂**多渠道**（优先级 / 权重）
3. 价格后台继续记各家的「成本」；对外仍是一个 model 名

模型清单见 `config/grsai.json`。

## 测试上游（不经过 New API）

```bat
node scripts/test-grsai.mjs
```
