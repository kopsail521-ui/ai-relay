# AGENTS.md

## 项目

ai-relay（品牌 **keyoapi** / keyoapi.xyz）：面向出海用户的 AI API 中转站，聚合大模型 / 图像 / 视频模型的 API 转售与计费，包含用户系统、充值支付、模型上架、定价、SEO 引流等模块。

## 历史 AI 对话上下文（从 Cursor 迁移）

本项目 2026-08-27 → 2026-10-05 在 Cursor 的全部开发对话已导出到 **`.cursor-history/`**（入口：`.cursor-history/INDEX.md`，共 18 个主会话 + 99 个子代理会话）。需要了解某功能的来龙去脉、某次改动的原因时，先查 INDEX 按标题/日期定位会话，再读对应文件；文件内 `> 🔧` 行可还原当时的文件改动与命令执行。

## 其他重要上下文

- `docs/` — PRD、支付渠道（Creem / Waffo-Pancake）部署与审核操作记录
- `.cursor/rules/*.mdc` — 代理规则（GitHub 代理、keyoapi 上下文、市场定价注入）
- `.agents/skills/` — 本地技能
- `README.md` — 快速开始

## 生产 VPS 运维要点（2026-10 实测）

- **管理 API 鉴权**：脚本调 `https://www.keyoapi.xyz/api/*` 用 `.env` 里的
  `NEW_API_ADMIN_TOKEN`（系统访问令牌，永不过期，`Authorization: Bearer <token>`），
  **不要再 `POST /api/user/login`**——每次密码登录新建一个 30 天有效期的会话，
  每账号上限 50 个（`USER_SESSION_ACTIVE_LIMIT`），攒满后登录直接 409
  `AUTH_SESSION_LIMIT`，网页也进不去。解锁用 `scripts/vps-unlock-admin-login.sh`。
  注意：`/api/user/sessions*` 只接受真实登录会话，令牌调它会 403。
- **控制台部署**：改 `new-api/**` 后 push 触发 CI 构建 `ghcr.io/kopsail521-ui/keyo-new-api:main`
  （镜像公开可匿名拉取，但 CI 的 Update VPS job 因未配 `KEYO_VPS_HOST` 不会跑）。
  上 VPS 执行：`cd /opt/ai-relay && git pull --ff-only origin main && bash scripts/vps-deploy-console.sh`
  （纯 bash，inspect 现有容器保参重建，失败自动回滚；挂载读 `HostConfig.Binds` 优先）。
- **VPS 环境**：Ubuntu 22.04，容器 `ai-relay-new-api`（自定义网络 `ai-relay_default`，
  -p 3000:3000，bind mount `/opt/ai-relay/data/new-api:/data`，4 个环境变量，
  CMD `--log-dir /app/logs`）。Workbench 粘贴多行易断连，优先给单行短命令。
- **git 推送**：本仓库 `http.sslBackend` 固定为 `openssl`（schannel 会间歇性
  `Failed to connect to github.com port 443`）。
- **钱包上限**：用户 `quota` 硬上限 `MaxQuota = MaxInt32 = 2147483647`，充值前校验
  「余额+新充」超限即拒（`top-up quota limit exceeded`）。管理员账号余额曾达 5.49B 超限。
- **已知未配**：站点 SMTP（SMTPServer/Account/From 全空）——密码重置、邮箱验证等
  一切邮件功能不可用；接口返回 success:true 是防枚举设计，不代表邮件已发出。

