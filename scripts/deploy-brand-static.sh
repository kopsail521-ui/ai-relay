#!/bin/bash
# Deploy brand + SEO static files and install durable Caddyfile (SEO before SPA).
# On VPS:
#   sudo bash scripts/deploy-brand-static.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
BRAND_DIR="${ROOT}/static/brand"
SEO_DIR="${ROOT}/static/seo"
DOMAIN="${DOMAIN:-www.keyoapi.xyz}"
GEOFLOW_DATA="${ROOT}/data/geoflow-agent"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_BRAND="$REPO_ROOT/static/brand"
REPO_SEO="$REPO_ROOT/static/seo"
PHP_FPM_SOCK=""
for s in /run/php/php8.3-fpm.sock /run/php/php8.2-fpm.sock /run/php/php8.1-fpm.sock /run/php/php-fpm.sock; do
  if [[ -S "$s" ]]; then
    PHP_FPM_SOCK="$s"
    break
  fi
done

mkdir -p "$BRAND_DIR" "$SEO_DIR" "$BRAND_DIR/blog" "$BRAND_DIR/blog/article" "$GEOFLOW_DATA"
# GEO auto-publish writes here; keep world-readable, owner-writable across deploys.
chmod u+rwX,go+rX "$BRAND_DIR/blog" "$BRAND_DIR/blog/article" 2>/dev/null || true
# Seed GEOFlow agent config once (never overwrite secrets).
if [[ ! -f "$GEOFLOW_DATA/config.json" ]]; then
  if [[ -f "$REPO_ROOT/config/geoflow-agent.example.json" ]]; then
    cp -a "$REPO_ROOT/config/geoflow-agent.example.json" "$GEOFLOW_DATA/config.json"
  fi
  echo "==> seeded $GEOFLOW_DATA/config.json — set key_id + secret before GEOFlow sync"
fi
chmod 750 "$GEOFLOW_DATA" 2>/dev/null || true
chmod 640 "$GEOFLOW_DATA/config.json" 2>/dev/null || true
# php-fpm (www-data) must write articles + catalog
if id www-data >/dev/null 2>&1; then
  chgrp -R www-data "$BRAND_DIR/blog" "$GEOFLOW_DATA" 2>/dev/null || true
  chmod -R g+rwX "$BRAND_DIR/blog" "$GEOFLOW_DATA" 2>/dev/null || true
  chmod 640 "$GEOFLOW_DATA/config.json" 2>/dev/null || true
fi

if [[ -z "$PHP_FPM_SOCK" ]]; then
  echo "WARN: no php-fpm sock found yet (needed before Caddy rewrite)" >&2
fi

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
LANDING_FRAGMENT="${REPO_ROOT}/scripts/caddy-landing-handles.caddyfragment"
if [[ ! -f "$LANDING_FRAGMENT" ]]; then
  echo "ERROR: missing $LANDING_FRAGMENT — run: node scripts/gen-seo-pages.mjs" >&2
  exit 1
fi
LANDING_HANDLES="$(sed "s|__AI_RELAY_ROOT__|${ROOT}|g" "$LANDING_FRAGMENT")"
if [[ -z "${LANDING_HANDLES//[[:space:]]/}" ]]; then
  echo "ERROR: landing handles fragment is empty" >&2
  exit 1
fi
echo "==> Pricing landing handles: $(grep -c 'handle /' <<<"$LANDING_HANDLES" || true)"

if [[ -z "$PHP_FPM_SOCK" ]]; then
  echo "ERROR: php-fpm socket missing — install with: sudo apt-get install -y php8.3-fpm php8.3-cli && sudo systemctl enable --now php8.3-fpm" >&2
  exit 1
fi
echo "==> GEOFlow agent php_fastcgi sock=$PHP_FPM_SOCK"

GEOFLOW_AGENT_BLOCK=$(cat <<BLOCK
	# GEOFlow agent (MUST be ahead of @geo_blog static handle)
	@geo_blog_agent path /brand/blog/geoflow-agent /brand/blog/geoflow-agent/*
	handle @geo_blog_agent {
		root * ${ROOT}/static/brand/blog/geoflow-agent
		rewrite * /index.php
		php_fastcgi unix/${PHP_FPM_SOCK} {
			env GEOFLOW_CONFIG_PATH ${ROOT}/data/geoflow-agent/config.json
			env GEOFLOW_DATA_DIR ${ROOT}/data/geoflow-agent
			env GEOFLOW_BLOG_DIR ${ROOT}/static/brand/blog
		}
	}
BLOCK
)

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
${LANDING_HANDLES}
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
${GEOFLOW_AGENT_BLOCK}
	# GEO blog (durable — must survive every Caddyfile rewrite):
	#   /brand/blog/{slug}.html
	#   /brand/blog/article/{id}/  (+ index.html)
	#   /brand/blog/sitemap.txt
	@geo_blog path /brand/blog /brand/blog/*
	handle @geo_blog {
		root * ${ROOT}/static
		try_files {path} {path}.html {path}/index.html
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
	@gitee_special path /v1/images/object-detection* /v1/images/segmentation* /v1/images/pose-detection* /v1/images/upscaling* /v1/images/unwarping* /v1/images/mattings* /v1/async/* /v1/task/* /v1/systemone*
	handle @gitee_special {
		reverse_proxy 127.0.0.1:3010 {
			header_up Accept-Encoding identity
		}
	}
	# APIMart video lane (must stay ahead of catch-all → :3001)
	@apimart_video path /v1/videos/generations* /v1/tasks*
	handle @apimart_video {
		reverse_proxy 127.0.0.1:3011 {
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
	# Auth: native SPA via :3001 (same as /login). Avoid spa-shell→DOMParser boot failures.
	@spa_auth path /sign-in /sign-in/* /sign-up /sign-up/*
	handle @spa_auth {
		header X-Robots-Tag "noindex, nofollow"
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
	@spa_noindex path /console /console/* /rankings /rankings/* /dashboard /dashboard/* /admin /admin/* /setup /setup/*
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
echo -n "landing_tts_title="
curl -s "https://${DOMAIN}/tts-api" | grep -oE '<title>[^<]+' | head -n 1 || echo FAIL_TTS
echo -n "landing_tts_bytes="
curl -s "https://${DOMAIN}/tts-api" | wc -c
echo -n "landing_gemini_XNewApi="
curl -sI "https://${DOMAIN}/gemini-api-pricing" | grep -ci 'x-new-api-version' || true
echo "DONE_BRAND_SEO_DEPLOY"
