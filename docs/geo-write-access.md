# GEO / GEOFlow 写入说明（KeyoAPI）

## 结论（给 GEOFlow / 运维）

- **自动发文接口（契约）**：`POST https://www.keyoapi.xyz/brand/blog/geoflow-agent/v1/articles`  
  验签路径字符串固定为：`/geoflow-agent/v1/articles`（不含 `/brand/blog` 前缀）。
- **落盘**：`/opt/ai-relay/static/brand/blog/article/{slug}/index.html`，并更新 `index.html` + `sitemap.txt`。
- **Caddy 永久源**：`scripts/deploy-brand-static.sh` 内 `@geo_blog_agent`（php_fastcgi）+ `@geo_blog`（静态）。  
  **不要**只改 `/etc/caddy/Caddyfile`。
- **密钥**：`/opt/ai-relay/data/geoflow-agent/config.json`（`key_id` + `secret`，须与 GEOFlow 一致）。示例：`config/geoflow-agent.example.json`。
- **发版**：`scripts/vps-safe-pull-preserve-blog.sh`（只保 `article/` + index/sitemap，不盖掉 `geoflow-agent` PHP）。

对外副本：`../geo-write-access.md`。

## 接口契约摘要

| 项 | 值 |
|---|---|
| URL | `POST /brand/blog/geoflow-agent/v1/articles` |
| 鉴权头 | `X-GEOFlow-Key-Id` / `Timestamp` / `Nonce` / `Idempotency-Key` / `Body-SHA256` / `Signature` / `Event` |
| 签名原文 | `POST\n/geoflow-agent/v1/articles\n{timestamp}\n{nonce}\n{body_hash}` |
| 成功 | HTTP 200 + `{"ok":true,"remote_id":"geoflow-{slug}","remote_url":"https://www.keyoapi.xyz/brand/blog/article/{slug}/"}` |
| 幂等 | 相同 `Idempotency-Key` 返回原 `remote_id` / `remote_url` |

实现文件：`static/brand/blog/geoflow-agent/index.php`  
本地/VPS 冒烟：`python3 scripts/geoflow-agent-smoke.py`

## 静态目录

| 用途 | 服务器路径 | URL |
|------|------------|-----|
| Agent | `.../blog/geoflow-agent/index.php` | `/brand/blog/geoflow-agent/v1/articles` |
| CMS 文 | `.../blog/article/{slug}/index.html` | `/brand/blog/article/{slug}/` |
| 索引 / sitemap | `.../blog/index.html` · `sitemap.txt` | `/brand/blog/` · `sitemap.txt` |

## Caddy（源：deploy-brand-static.sh）

```caddy
@geo_blog_agent path /brand/blog/geoflow-agent /brand/blog/geoflow-agent/*
handle @geo_blog_agent {
  root * /opt/ai-relay/static/brand/blog/geoflow-agent
  rewrite * /index.php
  php_fastcgi unix//run/php/php8.3-fpm.sock { ... }
}
@geo_blog path /brand/blog /brand/blog/*
handle @geo_blog {
  root * /opt/ai-relay/static
  try_files {path} {path}.html {path}/index.html
  file_server
}
```

`@geo_blog_agent` **必须在** `@geo_blog` 前面。

## Workbench 上线（装 php-fpm + 路由 + 配密钥）

```bash
cd /opt/ai-relay
sudo apt-get update -y
sudo apt-get install -y php8.3-fpm php8.3-cli || sudo apt-get install -y php-fpm php-cli
sudo systemctl enable --now php8.3-fpm 2>/dev/null || sudo systemctl enable --now php-fpm
RELOAD_CADDY=1 bash scripts/vps-safe-pull-preserve-blog.sh
# 把 GEOFlow 的 key_id / secret 写入（勿提交 git）：
sudo nano /opt/ai-relay/data/geoflow-agent/config.json
sudo chgrp www-data /opt/ai-relay/data/geoflow-agent/config.json
sudo chmod 640 /opt/ai-relay/data/geoflow-agent/config.json
python3 scripts/geoflow-agent-smoke.py
```

期望 smoke：`200 {"ok":true,...}`，然后通知 GEOFlow **重试那 5 篇**。

## 发版为何会 404

1. 裸 `git reset --hard` 盖掉 GEO 的 index/sitemap  
2. 旧脚本重写 Caddy 丢掉 `@geo_blog_agent`  
3. php-fpm 未装 / sock 不对 / `www-data` 无写权限  
4. `config.json` 仍是 `REPLACE_ME` → `agent_not_configured`

对策：永远用 `vps-safe-pull-preserve-blog.sh`；改 Caddy 只改 `deploy-brand-static.sh`。
