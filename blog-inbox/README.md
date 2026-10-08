# blog-inbox — 文章收件箱

把要发布的文章放进这个目录（git 提交推送 + VPS 跑 `scripts/vps-blog-sync.sh` 即上线）。

## 文件格式

文件名 = 网址 slug（`my-post.html` → `/brand/blog/article/my-post/`）。
首行必须是标题注释，摘要可选，其余是 HTML 正文片段：

```html
<!-- TITLE: 你的文章标题 -->
<!-- EXCERPT: 首页卡片上的一行摘要（可选） -->
<h2>小标题</h2>
<p>正文……支持 h2/h3、p、ul/li、pre/code、a、strong 等常见标签。</p>
```

规则：
- 不用写 `<html>/<head>/<body>`，外壳（导航/样式/SEO 标签）自动套用全站模板
- 正文至少 200 字节，标题 8–100 字符
- 重复发布同名文件 = 原地更新，幂等
- 下线：VPS 上 `php scripts/blog-self-publish.php --unpublish --slug=文件名`

## 流程

1. 文章（任何格式：纯文本 / Markdown / Word 里复制出来的）发给维护者整理
2. 整理好的片段提交到本目录并推送
3. VPS 上跑 `sudo bash /opt/ai-relay/scripts/vps-blog-sync.sh`（拉取 + 发布收件箱）
4. 发布成功后文件会被移入 `archive/`（仅作留档，不再重复发布）
