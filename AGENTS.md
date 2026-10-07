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
