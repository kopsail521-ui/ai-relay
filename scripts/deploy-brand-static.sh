#!/bin/bash
# Deploy brand + SEO static files and install durable Caddyfile (SEO before SPA).
# On VPS:
#   sudo bash scripts/deploy-brand-static.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
BRAND_DIR="${ROOT}/static/brand"
SEO_DIR="${ROOT}/static/seo"
DOMAIN="${DOMAIN:-www.keyoapi.xyz}"

mkdir -p "$BRAND_DIR" "$SEO_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_BRAND="$REPO_ROOT/static/brand"
REPO_SEO="$REPO_ROOT/static/seo"

if [[ -d "$REPO_BRAND" && "$(realpath "$REPO_BRAND")" != "$(realpath "$BRAND_DIR")" ]]; then
  cp -a "$REPO_BRAND/." "$BRAND_DIR/"
  echo "==> Copied brand pages to $BRAND_DIR"
elif [[ -d "$BRAND_DIR" ]]; then
  echo "==> Brand already in place at $BRAND_DIR (skip copy)"
fi
if [[ -d "$REPO_SEO" && -f "$REPO_SEO/index.html" && "$(realpath "$REPO_SEO")" != "$(realpath "$SEO_DIR")" ]]; then
  cp -a "$REPO_SEO/." "$SEO_DIR/"
  echo "==> Copied SEO pages to $SEO_DIR"
elif [[ -f "$SEO_DIR/index.html" ]]; then
  echo "==> SEO already in place at $SEO_DIR (skip copy)"
else
  echo "WARN: missing SEO pages at $SEO_DIR" >&2
fi

echo "==> Build SPA shell with HTML noindex BEFORE Caddy reload"
bash "${REPO_ROOT}/scripts/patch-spa-shell-noindex.sh"
SPA_SHELL="${ROOT}/static/seo/spa-shell.html"
grep -q noindex "$SPA_SHELL"
echo "==> spa-shell on disk OK ($(wc -c < "$SPA_SHELL") bytes -> $SPA_SHELL)"

echo "==> Update Caddyfile for $DOMAIN (keeps SEO handles + apex→www redirect)"
APEX_DOMAIN="${DOMAIN#www.}"

# Generate Caddyfile with respond-bodied SPA shell (avoids file_server 403 on hidden paths).
python3 - "$ROOT" "$DOMAIN" "$APEX_DOMAIN" "$SPA_SHELL" <<'PY'
import sys
from pathlib import Path

root, domain, apex, spa_path = sys.argv[1:5]
html = Path(spa_path).read_text(encoding="utf-8")
if "noindex" not in html:
    raise SystemExit("spa shell missing noindex")
if "SPAEOF" in html:
    raise SystemExit("spa shell unexpectedly contains SPAEOF delimiter")

cfg = f"""{apex} {{
	redir https://{domain}{{uri}} permanent
}}

{domain} {{
	encode gzip

	handle /robots.txt {{
		root * {root}/static/seo
		header Content-Type text/plain
		file_server
	}}
	@sitemaps path /sitemap.xml /sitemap-live.xml
	handle @sitemaps {{
		root * {root}/static/seo
		file_server
	}}
	handle / {{
		root * {root}/static/seo
		rewrite * /index.html
		file_server
	}}
	handle /models {{
		root * {root}/static/seo
		rewrite * /models.html
		file_server
	}}
	handle /compare {{
		root * {root}/static/seo
		rewrite * /compare.html
		file_server
	}}
	handle /pricing {{
		root * {root}/static/seo
		rewrite * /pricing.html
		file_server
	}}
	handle /free-models {{
		root * {root}/static/seo
		rewrite * /free-models.html
		file_server
	}}
	handle /gemini-api-pricing {{
		root * {root}/static/seo
		rewrite * /gemini-api-pricing.html
		file_server
	}}
	handle /deepseek-api-pricing {{
		root * {root}/static/seo
		rewrite * /deepseek-api-pricing.html
		file_server
	}}
	handle /about {{
		root * {root}/static/seo
		rewrite * /about.html
		file_server
	}}
	redir /free /free-models permanent
	redir /free/ /free-models permanent
	@seo_model path /model /model/*
	handle @seo_model {{
		root * {root}/static/seo
		try_files {{path}}.html {{path}}/index.html {{path}}
		file_server
	}}
	handle_path /brand/* {{
		root * {root}/static/brand
		file_server
	}}
	handle /static/* {{
		reverse_proxy 127.0.0.1:3000 {{
			header_up Accept-Encoding identity
		}}
	}}
	@gitee_special path /v1/images/object-detection* /v1/images/segmentation* /v1/images/pose-detection* /v1/images/upscaling* /v1/images/unwarping* /v1/images/mattings* /v1/async/* /v1/task/*
	handle @gitee_special {{
		reverse_proxy 127.0.0.1:3010 {{
			header_up Accept-Encoding identity
		}}
	}}
	handle /__spa_raw {{
		header X-Robots-Tag "noindex, nofollow"
		rewrite * /
		reverse_proxy 127.0.0.1:3000 {{
			header_up Accept-Encoding identity
		}}
	}}
	@spa_noindex path /sign-in /sign-in/* /sign-up /sign-up/* /console /console/* /rankings /rankings/* /dashboard /dashboard/* /admin /admin/* /setup /setup/*
	handle @spa_noindex {{
		header X-Robots-Tag "noindex, nofollow"
		header Content-Type "text/html; charset=utf-8"
		respond <<'SPAEOF'
{html.rstrip()}
SPAEOF 200
	}}
	handle {{
		reverse_proxy 127.0.0.1:3001 {{
			header_up Accept-Encoding identity
		}}
	}}
}}
"""
Path("/etc/caddy/Caddyfile").write_text(cfg, encoding="utf-8")
print("OK_CADDYFILE_WRITTEN", Path("/etc/caddy/Caddyfile").stat().st_size)
PY

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> Check"
curl -sI "https://${DOMAIN}/robots.txt" | head -n 5
curl -sI "https://${DOMAIN}/" | head -n 5
curl -sI "https://${DOMAIN}/about" | head -n 5
curl -sI "https://${DOMAIN}/sign-in" | head -n 8
echo -n "sign-in_body_noindex="
curl -s "https://${DOMAIN}/sign-in" | grep -o noindex | head -n 1 || echo "FAIL_SIGNIN_NOINDEX_BODY"
echo -n "sign-in_bytes="
curl -s "https://${DOMAIN}/sign-in" | wc -c
echo -n "rankings_body_noindex="
curl -s "https://${DOMAIN}/rankings" | grep -o noindex | head -n 1 || echo "FAIL_RANKINGS_NOINDEX_BODY"
echo -n "home_noindex_count="
curl -s "https://${DOMAIN}/" | grep -c noindex || true
curl -sI "https://${DOMAIN}/brand/keyo-docs.html" | head -n 5
curl -sI "https://${APEX_DOMAIN}/sitemap.xml" | head -n 8 || true

echo "DONE_BRAND_SEO_DEPLOY"
