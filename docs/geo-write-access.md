# GEO 工具写入说明（KeyoAPI）

## 线上真实可写目录（静态站）

服务器：阿里云 ECS（www.keyoapi.xyz）

| 用途 | 服务器路径 | 对应 URL |
|------|------------|----------|
| 品牌/博客静态页 | `/opt/ai-relay/static/brand/` | `https://www.keyoapi.xyz/brand/...` |
| 博客文章 | `/opt/ai-relay/static/brand/blog/` | `https://www.keyoapi.xyz/brand/blog/...` |
| robots / sitemap | `/opt/ai-relay/static/seo/` | `https://www.keyoapi.xyz/robots.txt` · `/sitemap.xml` |

文章发布约定：
- 索引：`/opt/ai-relay/static/brand/blog/index.html`
- 单篇：`/opt/ai-relay/static/brand/blog/{slug}.html`
- 例：`openai-compatible-api-python.html` → `https://www.keyoapi.xyz/brand/blog/openai-compatible-api-python.html`
- 每发一篇，同步更新 `/opt/ai-relay/static/seo/sitemap.xml`（只列真实存在的 URL）

## 不要写入 Sitemap 的路径（当前不存在）

- `/blog`
- `/docs`
- `/models`
- `/integrations/*`
- `/use-cases/*`
- `/status`

公开模型目录请用：`https://www.keyoapi.xyz/pricing`

## 写入方式（任选）

### 1）推荐：本机工作区 + Workbench 上传
把生成的 HTML 放到本仓库：
`static/brand/blog/`
把 sitemap 放到：
`new-api/web/public/sitemap.xml`
然后由运维在阿里云 Workbench 执行同步命令上线。

### 2）SSH 直写（若你提供密钥给 GEO）
主机：`47.79.232.233`（以 DNS 解析为准）
目录：见上表
用户：服务器 `admin` / `root`（以你账号为准）

### 3）若使用 F:\99GEO
把下列目录镜像到 `F:\99GEO`：
```
F:\99GEO\brand\          ← 对应 /opt/ai-relay/static/brand/
F:\99GEO\brand\blog\     ← 文章
F:\99GEO\seo\            ← robots.txt + sitemap.xml
```
生成后仍需上传到服务器同名路径。

## 主站 `/` 标题仍是 New API 的原因

`/` 由 New API React SPA 壳层返回，静态 SEO 在 `/brand/keyo-home.html`。
修复主站 title 需要 Caddy 改写或自定义前端镜像，与博客静态发布分开处理。
