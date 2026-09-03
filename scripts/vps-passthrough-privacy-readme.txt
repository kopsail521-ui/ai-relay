# 透传脱敏重新部署

第9步失败原因：构建时没有 fix-marketplace-meta.mjs（B 步没写完或断连）。

## 重新连接后，只补这几步

1. scripts/vps-passthrough-fix-p1.txt → OK_FIX_1_OF_2
2. scripts/vps-passthrough-fix-p2.txt → OK_FIX_2_OF_2
3. scripts/vps-passthrough-fix-decode.txt → 应看到文件列表 + OK_FIX_FILE
4. scripts/vps-passthrough-rebuild.txt → DONE_PASSTHROUGH_PRIVACY

若提示 MISSING server.mjs，再重跑 server p1~p3 + decode。
