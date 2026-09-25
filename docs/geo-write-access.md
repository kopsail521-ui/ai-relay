# GEO 工具写入说明（KeyoAPI）

## 结论（给 GEO / 运维）

- **文章落盘目录是** `/opt/ai-relay/static/brand/blog/`（不是 SPA `/blog`）。
- **公开 URL**：`https://www.keyoapi.xyz/brand/blog/...`
- **Caddy 永久源**：`scripts/deploy-brand-static.sh` 里的 `@geo_blog` 块。  
  每次 SEO/品牌发版都会 **整文件重写** `/etc/caddy/Caddyfile`，但只要跑这个脚本，blog 路由会一起写回去。  
  **不要**只在 `/etc/caddy/Caddyfile` 上手改——会被下次发版盖掉。
- **发版拉代码必须保 blog**：用 `scripts/vps-safe-pull-preserve-blog.sh`，不要裸 `git reset --hard`（会覆盖 GEO 改过的 `index.html` / `sitemap.txt`）。

## 线上真实可写目录（静态站）

服务器：阿里云 ECS（www.keyoapi.xyz）

| 用途 | 服务器路径 | 对应 URL |
|------|------------|----------|
| 品牌/博客静态页 | `/opt/ai-relay/static/brand/` | `https://www.keyoapi.xyz/brand/...` |
| 博客文章（slug） | `/opt/ai-relay/static/brand/blog/{slug}.html` | `/brand/blog/{slug}.html` |
| 博客文章（CMS id） | `/opt/ai-relay/static/brand/blog/article/{id}/index.html` | `/brand/blog/article/{id}/` |
| 博客索引 | `/opt/ai-relay/static/brand/blog/index.html` | `/brand/blog/` |
| 博客 sitemap | `/opt/ai-relay/static/brand/blog/sitemap.txt` | `/brand/blog/sitemap.txt` |
| robots / 主 sitemap | `/opt/ai-relay/static/seo/` | `/robots.txt` · `/sitemap.xml` |

文章发布约定：
- 索引：更新 `index.html`（列出真实存在的文章）
- 单篇：写 `{slug}.html` **或** `article/{id}/index.html`
- 每发一篇：更新 `sitemap.txt`（只列真实 200 的 URL）
- `article/` 已进 `.gitignore`，不会被 git 跟踪/冲掉

## 不要写入 Sitemap 的路径（当前不当作 GEO 目标）

- `/blog`（New API SPA 壳，**不是**静态博客）
- `/docs`
- `/integrations/*`（除非你们明确改路由）

公开模型目录请用：`https://www.keyoapi.xyz/pricing-list` 或 Model Square `/pricing`（noindex）。

## Caddy 里定死的路由（源：deploy-brand-static.sh）

```caddy
@geo_blog path /brand/blog /brand/blog/*
handle @geo_blog {
  root * /opt/ai-relay/static
  try_files {path} {path}.html {path}/index.html
  file_server
}
```

恢复/重装路由（Workbench）：

```bash
cd /opt/ai-relay && sudo bash scripts/vps-safe-pull-preserve-blog.sh
# 若只重装 Caddy、不拉代码：
# RELOAD_CADDY=1 可在 safe-pull 末尾触发；或：
sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh
```

## 写入方式

### 1）SSH / SFTP 直写（GEO 自动发文推荐）

目录见上表。用户需对 `/opt/ai-relay/static/brand/blog` 可写。

### 2）本机仓库 + Workbench

把 HTML 放到本仓 `static/brand/blog/`，再用 `vps-safe-pull-preserve-blog.sh` 上线（会先备份再还原 blog）。

## 发版时为什么会「突然 404」

常见不是「Caddy 坏了」，而是：

1. 有人跑了裸 `git reset --hard` → GEO 刚写的 `index.html` / `sitemap.txt` / 未忽略文件被盖回仓库版；
2. 有人跑了会重写 Caddyfile、但**不是**当前 `deploy-brand-static.sh` 的旧脚本 → `@geo_blog` 丢失；
3. 权限：blog 目录被 root 写死后，GEO 用户写不进去。

对策：永远用 `vps-safe-pull-preserve-blog.sh`；改 Caddy 只改 `deploy-brand-static.sh` 再部署。
