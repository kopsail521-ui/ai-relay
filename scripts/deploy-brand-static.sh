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

echo "==> Publish spa-shell.html (noindex HTML for auth/console routes)"
bash "${REPO_ROOT}/scripts/patch-spa-shell-noindex.sh"
SPA_SHELL="${ROOT}/static/seo/spa-shell.html"
test -f "$SPA_SHELL"
grep -q noindex "$SPA_SHELL"
chmod a+r "$SPA_SHELL" || true
# Make sure Caddy can traverse parents (common 403 cause)
chmod a+x "${ROOT}" "${ROOT}/static" "${ROOT}/static/seo" 2>/dev/null || true
echo "==> spa-shell on disk OK ($(wc -c < "$SPA_SHELL") bytes)"

echo "==> Update Caddyfile for $DOMAIN"
APEX_DOMAIN="${DOMAIN#www.}"
cat >/etc/caddy/Caddyfile <<EOF
${APEX_DOMAIN} {
	redir https://${DOMAIN}{uri} permanent
}

${DOMAIN} {
	encode gzip

	handle /robots.txt {
		root * ${ROOT}/static/seo
		header Content-Type text/plain
		file_server
	}
	@sitemaps path /sitemap.xml /sitemap-live.xml
	handle @sitemaps {
		root * ${ROOT}/static/seo
		file_server
	}
	handle / {
		root * ${ROOT}/static/seo
		rewrite * /index.html
		file_server
	}
	handle /models {
		root * ${ROOT}/static/seo
		rewrite * /models.html
		file_server
	}
	handle /compare {
		root * ${ROOT}/static/seo
		rewrite * /compare.html
		file_server
	}
	handle /pricing-list {
		root * ${ROOT}/static/seo
		rewrite * /pricing.html
		file_server
	}
	handle /free-models {
		root * ${ROOT}/static/seo
		rewrite * /free-models.html
		file_server
	}
	handle /gemini-api-pricing {
		root * ${ROOT}/static/seo
		rewrite * /gemini-api-pricing.html
		file_server
	}
	handle /deepseek-api-pricing {
		root * ${ROOT}/static/seo
		rewrite * /deepseek-api-pricing.html
		file_server
	}
	handle /about {
		root * ${ROOT}/static/seo
		rewrite * /about.html
		file_server
	}
	# Direct URL also works for debugging (has noindex in HTML).
	handle /spa-shell.html {
		header X-Robots-Tag "noindex, nofollow"
		root * ${ROOT}/static/seo
		file_server
	}
	redir /free /free-models permanent
	redir /free/ /free-models permanent
	@seo_model path /model /model/*
	handle @seo_model {
		root * ${ROOT}/static/seo
		try_files {path}.html {path}/index.html {path}
		file_server
	}
	handle_path /brand/* {
		root * ${ROOT}/static/brand
		file_server
	}
	handle /static/* {
		reverse_proxy 127.0.0.1:3000 {
			header_up Accept-Encoding identity
		}
	}
	@gitee_special path /v1/images/object-detection* /v1/images/segmentation* /v1/images/pose-detection* /v1/images/upscaling* /v1/images/unwarping* /v1/images/mattings* /v1/async/* /v1/task/*
	handle @gitee_special {
		reverse_proxy 127.0.0.1:3010 {
			header_up Accept-Encoding identity
		}
	}
	# Exact /pricing = Model Square SPA via moderation proxy (vendor order + icon injects).
	# Must NOT use spa-shell→:3000 or keyo-model-icons / pricing-sort injects are skipped.
	handle /pricing {
		header X-Robots-Tag "noindex, nofollow"
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
	# Fetch raw SPA HTML through :3001 so injected scripts (icons/sort) still apply.
	handle /__spa_raw {
		header X-Robots-Tag "noindex, nofollow"
		rewrite * /
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
	@spa_noindex path /sign-in /sign-in/* /sign-up /sign-up/* /console /console/* /rankings /rankings/* /dashboard /dashboard/* /admin /admin/* /setup /setup/*
	handle @spa_noindex {
		header X-Robots-Tag "noindex, nofollow"
		header Content-Type "text/html; charset=utf-8"
		root * ${ROOT}/static/seo
		rewrite * /spa-shell.html
		file_server {
			hide .git .gitignore
		}
	}
	handle {
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> Check"
echo -n "direct_spa_shell_bytes="
curl -s "https://${DOMAIN}/spa-shell.html" | wc -c
echo -n "direct_spa_shell_noindex="
curl -s "https://${DOMAIN}/spa-shell.html" | grep -o noindex | head -n 1 || echo FAIL
curl -sI "https://${DOMAIN}/sign-in" | head -n 8
echo -n "sign-in_body_noindex="
curl -s "https://${DOMAIN}/sign-in" | grep -o noindex | head -n 1 || echo "FAIL_SIGNIN_NOINDEX_BODY"
echo -n "sign-in_bytes="
curl -s "https://${DOMAIN}/sign-in" | wc -c
echo -n "rankings_body_noindex="
curl -s "https://${DOMAIN}/rankings" | grep -o noindex | head -n 1 || echo "FAIL_RANKINGS_NOINDEX_BODY"
echo -n "home_noindex_count="
curl -s "https://${DOMAIN}/" | grep -c noindex || true

echo "DONE_BRAND_SEO_DEPLOY"
