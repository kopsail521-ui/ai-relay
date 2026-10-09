# keyo-pool —— Keyo 模型接力池（keyo-flash:free + keyo-pro:free）

一个进程、多个虚拟模型。每个别名是一组"模型条目"（每条目带自己的上游与密钥）+ 自动接力：某模型失败 / 超时 / 流断在半路 → 自动切下一条目（**可跨上游平台**），把已写内容带上让它**接着写**，下游看到一条完整回复。对外是标准 OpenAI 兼容 API，挂进 New API 即可给粉丝用。

| 别名 | 上游 | 池内模型 | 用途 |
|---|---|---|---|
| `keyo-flash:free` | UnoRouter + intern-ai + sensenova | 13 个免费/低价模型（10+1+2） | 跨平台免费接力 |
| `keyo-pro:free` | OpenLux（可改 New API） | 12 个最便宜付费文本模型，按价格升序 | 付费低价优先接力 |

> 灵感来自推文"OpenRouter 0 元模型接 Agent 当执行层"（Token 永动机）；本服务是它的免费接力版 + 付费低价版，并加上多模型接力与中转站落地。

## 池配置（ai-relay/.env）

按 `POOL_1_*` / `POOL_2_*` / ... 递增定义，遇到缺失的 `ALIAS` 即停止。每池可多上游（`UPSTREAMS` + 每上游各自的 `BASE_URL_<名>` / `API_KEYS_<名>` / `MODELS_<名>`），跨平台接力：

```ini
# 下游鉴权（所有池共用）：粉丝/中转站调用本服务用的 key
POOL_API_KEYS=sk-pool-xxx

# Pool 1 — keyo-flash:free（跨 UnoRouter + intern-ai + sensenova 三家接力）
POOL_1_ALIAS=keyo-flash:free
POOL_1_UPSTREAMS=uno,intern,sensenova          # 接力顺序 = 列出顺序
POOL_1_BASE_URL_UNO=https://api.unorouter.com/v1
POOL_1_API_KEYS_UNO=sk-uno-xxx,sk-uno-yyy       # 多 key 叠加免费额度
POOL_1_MODELS_UNO=agnes-3.0-flash:free,gemma-4-26b:free,...   # 10 个免费模型
POOL_1_BASE_URL_INTERN=https://discovery-api.intern-ai.org.cn/v1
POOL_1_API_KEYS_INTERN=sk-intern-xxx
POOL_1_MODELS_INTERN=glm-5.3
POOL_1_BASE_URL_SENSENOVA=https://token.sensenova.cn/v1
POOL_1_API_KEYS_SENSENOVA=sk-sensenova-xxx
POOL_1_MODELS_SENSENOVA=sensenova-6.8-flash-lite,glm-5.2

# Pool 2 — keyo-pro:free（付费低价优先接力；单上游简写示例）
POOL_2_ALIAS=keyo-pro:free
POOL_2_BASE_URL=https://api.openlux.ai/v1     # 或 http://127.0.0.1:3000/v1 指向自己的 New API
POOL_2_API_KEYS=sk-openlux-xxx
POOL_2_MODELS=gpt-6-luna,Bespoke-Nimble-9B,jev-1.13.0,qwen3.8-flash,...   # 按价格升序
```

- 单上游也可用简写（`POOL_${i}_BASE_URL` / `POOL_${i}_API_KEYS` / `POOL_${i}_MODELS`，不写 `UPSTREAMS` 即走单上游）。
- 条目顺序 = 失败时的接力优先级（flash 按 UnoRouter→intern→sensenova，pro 按价格升序）。
- 兼容旧版：若没有 `POOL_1_*` 但有 `UNO_API_KEYS`，自动合成单池（旧 `.env` 不用改）。
- 超时 / 冷却（全局）：`MAX_ATTEMPTS` `FIRST_TOKEN_TIMEOUT_MS` `IDLE_TIMEOUT_MS` `MODEL_COOLDOWN_MS` 等，见 server.mjs 顶部注释。

## 启动

```bat
services\unofree-pool\start.bat
:: 或 Docker（把 docker-compose.snippet.yml 合并进主 compose）
docker compose up -d --build unofree-pool
```

自测（本地 mock，验证 429 切换 / 断流续写 / 流式 / 鉴权 / 多池）：

```bat
cd services\unofree-pool && node selftest.mjs
```

## 接入 New API（给粉丝用）

New API 后台 → 渠道 → 添加两个渠道（或一个渠道填两个模型）：

| 项 | 值 |
|---|---|
| 类型 | OpenAI |
| Base URL | `http://127.0.0.1:3020`（Docker 同网络用 `http://unofree-pool:3020`） |
| 密钥 | `POOL_API_KEYS` 的值 |
| 模型 | `keyo-flash:free`、`keyo-pro:free`（点"填入模型列表"自动拉 `/v1/models`） |

粉丝侧用 `model=keyo-flash:free`（免费）或 `model=keyo-pro:free`（付费低价）调用，流式/非流式都支持。

## 容量与限制

- **flash**：UnoRouter 免费档约每用户·每模型·1 次/分钟；10 模型 × N key ≈ 每分钟 10N 次。粉丝多了多注册账号加 key。
- **pro**：付费按 token 计费，无免费限流；低价优先 = 先打最便宜的 `gpt-6-luna`，失败才升到 `Bespoke-Nimble-9B` → `jev-1.13.0` → …，控制在最低成本。
- 免费模型能力有限：`tools`/视觉/JSON mode 不保证支持；某模型不支持时自动跳过并冷却 5 分钟。
- 续写是"带已写内容让下一个模型接着写"：接缝处偶见少量重复（已做 12 字以上重叠自动裁剪）或风格变化，属正常。
- 全部模型限流/失败时返回 429 + `Retry-After`（flash）或 502（pro）。

## 监控

`GET /health`：每池的冷却状态、存活 key 数、请求数 / 接力次数 / 续写次数统计。
日志一行一条：`[keyo-flash:free] ok <id> models=a→b→c cont=1 chars=1234`。
