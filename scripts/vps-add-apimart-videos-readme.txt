# APIMart 视频上线（KeyoAPI）

模型（售价 = APIMart 实付 `cost` × **1.2**）：

| model id | 路径 |
|----------|------|
| gemini-omni-1.1-flash | POST `/v1/videos/generations` |
| gemini-omni-1.1-flash-ext | 同上 |
| seedance-2.5 | 同上 |
| seedance-2.0 | 同上 |
| flux-3-video | 同上 |
| MiniMax-H3 | 同上 |
| wan3.0-video | 同上 |

轮询：`GET /v1/tasks/{task_id}`（也兼容 `GET /v1/videos/generations/{id}`）

## 服务器步骤（推荐 Git）

```bash
cd /opt/ai-relay && git pull

# 1) Key（只放服务器，勿提交 Git）
sudo tee /opt/ai-relay/.env.apimart >/dev/null <<'EOF'
APIMART_BASE_URL=https://api.apimart.ai
APIMART_API_KEY=sk-你的Key
NEW_API_BASE=http://127.0.0.1:3000
NEW_API_DB=/opt/ai-relay/data/new-api/one-api.db
MARKUP=1.2
PORT=3011
LISTEN_HOST=127.0.0.1
EOF

# 2) 透传容器
sudo docker build -t keyo-apimart-passthrough ./services/apimart-passthrough
sudo docker rm -f ai-relay-apimart-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-apimart-passthrough --restart always --network host \
  --env-file /opt/ai-relay/.env.apimart \
  -v /opt/ai-relay/data:/opt/ai-relay/data \
  -e NEW_API_DB=/opt/ai-relay/data/new-api/one-api.db \
  -e CATALOG=/app/catalog.json \
  keyo-apimart-passthrough

# 3) 模型广场 + 默认展示价
sudo python3 scripts/vps-add-apimart-videos.py /opt/ai-relay/data/new-api/one-api.db

# 4) Caddy 增加（与 Gitee 3010 并列）：
#   @apimart_video path /v1/videos/generations* /v1/tasks*
#   handle @apimart_video {
#     reverse_proxy 127.0.0.1:3011
#   }
sudo systemctl reload caddy

curl -sS http://127.0.0.1:3011/healthz
```

成功标志：`DONE_ADD_APIMART_VIDEOS` + healthz `"ok":true`。

## 安全

API Key 只写 `/opt/ai-relay/.env.apimart`，不要提交到 Git。若 Key 曾在聊天里出现过，建议在 APIMart 控制台轮换。
