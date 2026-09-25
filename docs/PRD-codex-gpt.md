# PRD：Codex 直接使用四个 GPT 模型

## 1. 摘要

让 Keyo 用户在 Codex 里直接选用 `gpt-6-astra`、`gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`。这四个模型站上已有。缺的是 Codex 现在唯一认的 Responses 接入包：配置、密钥文件、模型目录。

## 2. 联系人

| 角色 | 说明 |
|------|------|
| 产品负责人 | 站点所有者。决定是否上线、文案是否对外 |
| 工程 | 网关与静态页。先验证 Responses，再发目录和配置 |

## 3. 背景

Codex 从 2026 年 2 月起只走 Responses（`POST /v1/responses`），不再接受 Chat Completions。竞品的做法是：把 Codex 的 Base URL 指到自己的站，再下一份本地模型目录，界面里就会出现他们的 GPT 名字。

Keyo 网关代码里已经有 `/v1/responses` 和 `/v1/responses/compact`。公开手册仍只教 Chat Completions。用户按手册改 Base URL，在新版 Codex 里调不通，也看不到这四个模型。

## 4. 目标

用户登录拿到 Key 后，按一页说明保存两个本地文件，打开 Codex 就能在模型列表里选这四个 ID，并完成一次编码对话。

成功标准：

- 按文档配置后，Codex 模型列表里出现这四个名字，且 ID 与定价页一致。
- 任选其一能完成一次 Responses 对话（有正常回复，不是 404 / 协议错误）。
- 文档不要求用户改代码，也不把视频模型塞进 Codex 列表。

## 5. 市场

给已经在用 Codex 写代码、又想用 Keyo 密钥的人。他们的问题是：官方 Codex 只连 OpenAI，中转站如果只提供聊天补全，就接不上。

约束：不改用户本机 Codex 程序；配置必须写在用户自己的 `%userprofile%\.codex\`（或 macOS/Linux 的 `~/.codex/`）。

## 6. 价值

用户少做的事：不用自己猜协议，不用把 Chat 字段硬塞进 Codex。

我们相对竞品要守住的：模型名用站上真名，不另起 `gpt-5.5` 这类别名；密钥仍是 Keyo 的 `sk-`。

## 7. 方案

### 7.1 用户怎么做

1. 打开 Keyo 上的「Codex 接入」说明（可挂在现有手册页，不必新做一整站）。
2. 复制 `config.toml` 到 Codex 配置目录最上面。
3. 把密钥写入 `auth.json`。
4. 下载模型目录，存成配置里写的那个路径。
5. 重启 Codex，选择四个模型之一。

### 7.2 第一版要加的东西

1. **模型目录文件**（静态 JSON）  
   只含四个模型。每个都要有 Codex 能读的字段：`slug`、显示名、上下文长度、`supported_in_api`、工具调用、推理档位。`slug` 必须等于站上的模型 ID。

2. **配置模板**（Windows 与 macOS/Linux 各一份）  
   - `model_provider = "keyo"`（不要用保留名 `openai`）  
   - `base_url = "https://www.keyoapi.xyz/v1"`  
   - `wire_api = "responses"`  
   - `requires_openai_auth = false`  
   - `model_catalog_json` 指向用户刚保存的目录文件  
   - 默认模型建议 `gpt-5.6-luna`（四者里最便宜的日常档；用户可改）

3. **密钥文件模板**  
   `auth.json` 里放用户自己的 Keyo Key。页面上用占位符，不要写死任何人的密钥。

4. **上线前的一次协议核对**  
   用这四个 ID 各看一眼：`POST /v1/responses` 是否被对应渠道接受。若渠道只懂 Chat Completions，要在网关里把 Responses 转成渠道能收的格式，再转回 Codex 要的流。这一步没过，不要把说明页公开。

5. **给人看的短说明**  
   写在 `keyo-docs`（人读）。`keyo-api-ref` 不必整页改成 Responses；Codex 用户走这条新说明即可。

### 7.3 技术现状（已有 / 未有）

| 已有 | 未有 |
|------|------|
| 四个模型已在售 | Codex 模型目录 |
| 网关路由含 `/v1/responses` | 给用户复制的 `config.toml` / `auth.json` |
| Chat Completions 手册 | 这四个模型在 Responses 上是否真能跑完（未验证） |

### 7.4 假设（未证实）

- 这四个模型所在渠道能完成 Responses，或网关转换后 Codex 能用工具调用。
- 用户的 Codex 版本已去掉 Chat 协议。旧版若仍要 `wire_api = "chat"`，第一版不保证。
- 上下文长度、推理档位先按保守值填写；写错只会让 Codex 显示不准，不会创造出上游没有的能力。

## 8. 发布

**第一版（先做这些）：** 目录 JSON、两套配置模板、密钥模板、协议核对、一页说明。不做应用内一键安装，不做 WebSocket。

**以后再做：** 控制台按钮「下载目录」；把更多对话模型放进同一目录；Codex WebSocket 传输。

相对工作量：说明和静态文件是一小段；若 Responses 在渠道上失败，转换层才是大头。先核对再写页面。
