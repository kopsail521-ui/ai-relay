# 上架 OpenLux 视频：grok-1.5-video / veo_3_1-components（售价 = OpenLux × 2.5）

服务器执行（路径按你的 DB 调整）：

```bash
cd /opt/ai-relay
sudo python3 scripts/vps-add-openlux-videos.py /opt/ai-relay/data/new-api/one-api.db
# 若 DB 在 docker 卷：
# sudo docker exec -i ai-relay-new-api python3 - <<'PY'
# 或把脚本挂进容器后执行
```

常见：

```bash
sudo python3 /opt/ai-relay/scripts/vps-add-openlux-videos.py /opt/ai-relay/data/new-api/one-api.db
```

成功应打印 `DONE_ADD_OPENLUX_VIDEOS`。

| 模型 | OpenLux | Keyo 售价 |
|------|---------|-----------|
| grok-1.5-video | $3.300016987 | **$8.25**/次 |
| veo_3_1-components | $0.768 | **$1.92**/次 |

端点：`POST /v1/videos`（异步，再 `GET /v1/videos/{id}`）。
