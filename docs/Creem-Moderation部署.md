# Creem Moderation 代理部署（KeyoAPI）

文生图必须在出图前调用 Creem `POST /v1/moderation/prompt`。  
因线上用的是官方 `calciumion/new-api` 镜像，用前置代理拦截 `/v1/images/*`，不改 New API 源码。

## 架构

```
Caddy :443 → 127.0.0.1:3001 (moderation proxy) → 127.0.0.1:3000 (new-api)
```

仅 `POST /v1/images/generations|edits|variations` 会先审核；其它请求原样转发。

## Workbench 步骤

1. 把本仓库的 `services/creem-moderation-proxy` 上传到 `/opt/ai-relay/services/creem-moderation-proxy`

2. 在 `/opt/ai-relay` 写入环境（用你的 Creem Key；测通用 test，正式用 live）：

```bash
cd /opt/ai-relay
cat >> .env.moderation <<'EOF'
CREEM_API_KEY=creem_test_你的密钥
CREEM_TEST_MODE=true
EOF
```

正式收款时改成 live key，并设 `CREEM_TEST_MODE=false`。

3. 启动代理：

```bash
cd /opt/ai-relay
docker build -t keyo-creem-moderation ./services/creem-moderation-proxy
docker rm -f ai-relay-creem-moderation 2>/dev/null || true
docker run -d --name ai-relay-creem-moderation --restart always --network host \
  --env-file .env.moderation \
  -e UPSTREAM_URL=http://127.0.0.1:3000 \
  -e LISTEN_HOST=127.0.0.1 \
  -e PORT=3001 \
  keyo-creem-moderation
```

4. 改 Caddy，把反代从 `3000` 改成 `3001`：

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
www.keyoapi.xyz {
	encode gzip
	handle_path /brand/* {
		root * /opt/ai-relay/static/brand
		file_server
	}
	handle {
		reverse_proxy 127.0.0.1:3001
	}
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

5. 自测：

```bash
# 正常提示应 allow 后由上游处理（无 key 会 401，但不应出现 moderation_unavailable）
curl -sS https://www.keyoapi.xyz/v1/images/generations \
  -H "Authorization: Bearer sk-test" \
  -H "Content-Type: application/json" \
  -d '{"model":"nano-banana-2","prompt":"a watercolor lighthouse at sunset","size":"1024x1024"}' | head
```

## 行为

| Creem decision | 代理行为 |
|----------------|----------|
| allow | 转发 New API |
| deny / flag | 400，不生成 |
| API 超时/失败 | 503 fail-closed，不生成 |

## 注意

- 审核费用从 Creem 打款扣（约 $0.30 / 1000 units）。
- 正式审核要求生产环境用 **live** key 打过真实 Moderation 调用；仅 sandbox 不够。
