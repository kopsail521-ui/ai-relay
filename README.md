# AI 出海中转站

> **项目目录（请用这个）：** `E:\01来粉来粉\中转\ai-relay`

两层结构：

| 组件 | 作用 | 地址 |
|------|------|------|
| **[New API](https://github.com/QuantumNous/new-api)** | 开源 API 中转网关（渠道、令牌、计费、兼容 OpenAI） | http://localhost:3000 |
| **pricing-admin** | 价格后台：成本 / 售价 / 官方价对照 | http://localhost:3100 |

## 本机快速启动（Windows，无需 Docker）

### 1）价格后台

双击 `start-pricing.bat`，或：

```bat
cd pricing-admin
npm install
npm start
```

打开 http://localhost:3100  
默认密码：`admin123`（环境变量 `ADMIN_PASSWORD` 可改）

已预填你截图里的一批模型，售价按成本 ×3；可在后台改，并一键「成本×3」。

### 2）New API 网关

**方式 A：Windows 预编译包（推荐本机）**

```bat
start-new-api.bat
```

首次打开 http://localhost:3000 按提示创建管理员。

**方式 B：Docker（海外 VPS 推荐）**

```bat
docker compose up -d
```

## 日常用法（转卖国内站）

1. New API → **渠道** → 填国内中转站的 Base URL + Key  
2. **模型** 映射到上游模型名（可上架「全量」）  
3. New API 里设对外倍率/价格（真正扣用户余额）  
4. 本仓库 **价格后台** 记：`成本`（付给上游）、`售价`（卖给客户）、`官方价`（OpenRouter/官方对照）

价格后台是「决策台账」，不会自动改 New API 扣费；两边数字你对齐即可。

## 目录

```
ai-relay/
  bin/new-api.exe         # Windows 预编译网关（下载后出现）
  docker-compose.yml      # New API + 价格后台
  pricing-admin/          # 成本/售价/官方价后台
  data/                   # 运行数据
  start-pricing.bat
  start-new-api.bat
  README.md
```

## 环境变量（价格后台）

| 变量 | 默认 | 说明 |
|------|------|------|
| `ADMIN_PASSWORD` | `admin123` | 价格后台密码 |
| `PORT` | `3100` | 价格后台端口 |
| `DATA_DIR` | `./data` | 模型 JSON 存储目录 |

## 文档

- **[完整文档](docs/完整文档.md)**（客户用法 + 运维 + 上线清单）
- [Grsai 统一接入](docs/grsai-统一接入.md)

## Grsai 上游（当前已接模型）

见 [docs/grsai-统一接入.md](docs/grsai-统一接入.md)。

```bat
copy .env.example .env
:: 编辑 .env 填 GRSAI_API_KEY 和 NEW_API_ADMIN_PASSWORD
node scripts/setup-grsai-channel.mjs
```

模型：`gpt-image-2` / `gpt-image-2-vip` / `nano-banana-pro` / `nano-banana-2` / `gpt-5.6-sol` / `gpt-5.6-terra`

## 下一步

1. 改掉默认密码  
2. New API 配好上游渠道  
3. 在价格后台把「官方价」按 OpenRouter 表校准  
4. 需要时再做：售价一键同步到 New API 模型倍率
