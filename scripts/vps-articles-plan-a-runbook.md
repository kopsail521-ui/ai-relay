# Plan A — 27 篇存量博客文章的处置（预置 runbook，11-07 之后执行）

> **执行记录：已于 2026-10-28 提前执行（提交 496e414 + f7ad817）。**
> 实测：博客 sitemap 31 → 4 条（0 个 /article/ URL）；文章页 200 + `X-Robots-Tag: noindex, nofollow`；
> 博客首页 200 且无 noindex；主 sitemap 87 条不变。
> 下方步骤保留作为回滚/复核依据。注意：flag 在 `data/geoflow-agent/gate.json`（PHP 的 `load_gate()` 读这里），
> 不是 `config.json`。

## 射程边界（写死，勿扩大）

**方案 A 只对 `/brand/blog/article/` 下的 27 篇生效。以下一律不碰：**

- 三篇入门指南：`/brand/blog/openai-compatible-api-python.html`、`…-nodejs.html`、`…-cursor.html`
- 全部 capability / 枢纽 / 对比页（`/ai-agent-api`、`/ai-story-api`、`/study-ai-api`、`/gemini-4-api`、`/compare`、`/models`、`/pricing-list`、`/free-models`、品牌枢纽 ×7、视频/语音枢纽 ×7 等）
- 55 个未逐页审过的 model 页

依据：审计对照样本显示，指南页与 capability 页结构清晰、有可跑代码、有真实价格表、零 hedge，
是全站唯一能用外部流量验证的资产；把它们扫进 noindex 是自伤。**只撤 article/，其余保留。**

计数口径：`/brand/blog/sitemap.txt` = 博客首页 1 + 指南 3 + article **27** = 31 条。

## 为什么预置

- 停发日 10-10，静置期到 11-07。
- 10-27 中期读数：已收录 7（持平）、已抓取未收录 20→21（恶化）、已发现未收录 30（持平）。
- 结论：静置排除了「我们自己的改动导致」这一假设，但没有改变 Google 的收录判断。
  27 篇（10-10 之前批量生成、模板感重）继续挂在 sitemap 里只会持续稀释站点质量信号。
  页内证据：15 篇同一分钟发布（2026-10-10T10:44:03/04）、14 篇 description 为「Learn how to…」模板、
  4 篇公开否认站点已有能力、模板拼接残骸遍布。

## 铁律

**两处必须同一次改完**，否则自相矛盾：

1. 从 blog sitemap 移除（`sitemap_include_articles = false`）
2. 文章页加 `noindex`（Caddy `X-Robots-Tag`）

只做 1 → sitemap 干净了但页面仍可被抓、被判「已发现未收录」；
只做 2 → sitemap 主动提交 + noindex 主动排除，GSC 会新开「已被 noindex 排除」分类。

## 执行步骤（在 VPS 上，需 sudo）

### 1) 备份

```bash
TS=$(date -u +%Y%m%d-%H%M%S)
sudo cp -a /opt/ai-relay/static/brand/blog/sitemap.txt "/root/blog-sitemap.$TS.txt"
sudo cp -a /opt/ai-relay/data/geoflow-agent/config.json "/root/geoflow-config.$TS.json" 2>/dev/null || true
sudo cp -a /etc/caddy/Caddyfile "/root/Caddyfile.$TS"
```

### 2) sitemap 移除（配置开关，零代码改动）

`config/geoflow-agent.example.json` 里该字段默认就是 `false`；VPS 上的实际配置被改成了 `true`。

```bash
sudo python3 - <<'PY'
import json, pathlib
p = pathlib.Path('/opt/ai-relay/data/geoflow-agent/config.json')
cfg = json.loads(p.read_text(encoding='utf-8'))
cfg['sitemap_include_articles'] = False
p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding='utf-8')
print('sitemap_include_articles ->', cfg['sitemap_include_articles'])
PY
sudo php /opt/ai-relay/scripts/geoflow-rebuild-blog.php
# 期望：DONE_GEOFLOW_REBUILD ... sitemap_include_articles=0
```

### 3) 文章页 noindex（Caddy 模板，随下次部署生效）

在 `scripts/deploy-brand-static.sh` 的 Caddyfile 模板里，`@geo_blog` 之前插入：

```caddy
	# Plan A: 27 pre-10-10 bulk articles stay readable but leave the index.
	@geo_blog_article path /brand/blog/article/*
	handle @geo_blog_article {
		header X-Robots-Tag "noindex, nofollow"
		root * ${ROOT}/static
		try_files {path} {path}.html {path}/index.html
		file_server
	}
```

（必须放在 `@geo_blog` 之前——Caddy 按声明顺序匹配。）

然后正常部署：`git push` → static-deploy 流水线自动跑 safe-pull + 部署 + 自检。

### 4) 验收（五条，缺一不可）

```bash
curl -s https://www.keyoapi.xyz/brand/blog/sitemap.txt | wc -l          # 期望 4（索引+3指南），原 31
curl -sI https://www.keyoapi.xyz/brand/blog/article/ooy10bjn/ | grep -i x-robots-tag   # 期望 noindex
curl -s -o /dev/null -w '%{http_code}\n' https://www.keyoapi.xyz/brand/blog/article/ooy10bjn/  # 期望 200（不 404）
curl -s -o /dev/null -w '%{http_code}\n' https://www.keyoapi.xyz/brand/blog/            # 期望 200（索引页保留）
curl -s -o /dev/null -w '%{http_code}\n' https://www.keyoapi.xyz/sitemap.xml            # 期望 200 text/xml
```

### 5) 回滚（任一条不符）

```bash
sudo cp -a /root/blog-sitemap.<TS>.txt /opt/ai-relay/static/brand/blog/sitemap.txt
sudo cp -a /root/geoflow-config.<TS>.json /opt/ai-relay/data/geoflow-agent/config.json
sudo cp -a /root/Caddyfile.<TS> /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## 之后

- 再观察 2–3 周：已收录 7 是否回升、27 篇是否从「已发现未收录」消失、www 主机的「过去有问题」标记是否清除。
- 若回升 → 保持；若仍不动 → 下一步才是文章内容重写（那是大工程，另立项目）。

## 附：sitemap lastmod 说明（勿改 rebuild 逻辑）

lastmod 是**内容哈希驱动**（`stableLastmod`：内容哈希不变则保留旧日期），2026-10-28 实测分布
80 页 10-28 / 6 页 10-27 / 1 页 10-25，与 `config/seo/sitemap-lastmod.json` 缓存逐条吻合，
属于正常形状——**不要"修"rebuild 写日期的逻辑**。

B2-f 只做一件事：27 篇 article 的 sitemap 条目按真实发布日（09-25 / 09-28 / 10-10 三批）
在生成时拉开 lastmod，与方案 A 同一次提交；不碰生成器逻辑。
