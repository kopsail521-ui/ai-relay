# 透传「去痕迹」重部署（分 7 步，每次粘贴一个文件整段）

会更新：
- 响应头脱敏（不转发上游 gitee 头）
- 报错/日志中性化
- 带上 fix-marketplace-meta.mjs（启动时自动修分类）

Caddy 已配好则不动。

## 顺序

1. scripts/vps-passthrough-redeploy-1.txt → OK_1
2. scripts/vps-passthrough-redeploy-2.txt → OK_2_SERVER
3. scripts/vps-passthrough-redeploy-3.txt → OK_3_FIX
4. scripts/vps-passthrough-redeploy-4.txt → OK_4_DOCKER
5. scripts/vps-passthrough-redeploy-5.txt → OK_5
6. scripts/vps-passthrough-redeploy-6.txt → OK_6_CATALOG
7. scripts/vps-passthrough-redeploy-7.txt → DONE_PASSTHROUGH_REDEPLOY

第 7 步含 build，可能要 1～2 分钟。成功日志里应有 marketplace meta fix / Gitee passthrough on http...
