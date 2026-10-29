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

# GEO P1: snapshot current state so post-deploy verification can auto-rollback.
rm -rf "$SEO_DIR.bak-deploy" "$BRAND_DIR.bak-deploy"
[[ -d "$SEO_DIR" ]] && cp -a "$SEO_DIR" "$SEO_DIR.bak-deploy" || true
[[ -d "$BRAND_DIR" ]] && cp -a "$BRAND_DIR" "$BRAND_DIR.bak-deploy" || true
[[ -f /etc/caddy/Caddyfile ]] && cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-deploy || true

if [[ -d "$REPO_BRAND" && "$(realpath "$REPO_BRAND")" != "$(realpath "$BRAND_DIR")" ]]; then
  cp -a "$REPO_BRAND/." "$BRAND_DIR/"
  echo "==> Copied brand pages to $BRAND_DIR"
elif [[ -d "$BRAND_DIR" ]]; then
  echo "==> Brand already in place at $BRAND_DIR (skip copy)"
fi
if [[ -d "$REPO_SEO" && -f "$REPO_SEO/index.html" && "$(realpath "$REPO_SEO")" != "$(realpath "$SEO_DIR")" ]]; then
  cp -a "$REPO_SEO/." "$SEO_DIR/"
  echo "==> Copied SEO pages to $SEO_DIR"
  # Atomic replace for files crawlers poll (sitemap/robots/index): never a
  # truncated/instant — cp truncates in place, install+mv renames atomically.
  for f in sitemap.xml robots.txt index.html; do
    if [[ -f "$REPO_SEO/$f" ]]; then
      install -m 644 "$REPO_SEO/$f" "$SEO_DIR/.deploy-$f.$$" \
        && mv -f "$SEO_DIR/.deploy-$f.$$" "$SEO_DIR/$f"
    fi
  done
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

# SPA deep-link whitelist (single source: scripts/caddy-spa-prefixes.txt,
# maintained against new-api/web/src/routes). Missing file = refuse to deploy
# with a wildcard shell (fail closed to 404s, never to the old catch-all).
SPA_PREFIX_FILE="${REPO_ROOT}/scripts/caddy-spa-prefixes.txt"
if [[ ! -s "$SPA_PREFIX_FILE" ]]; then
  echo "ERROR: missing/empty $SPA_PREFIX_FILE" >&2
  exit 1
fi
SPA_PATH_MATCHER="$(grep -vE '^\s*(#|$)' "$SPA_PREFIX_FILE" | tr '\n' ' ')"
if [[ -z "${SPA_PATH_MATCHER//[[:space:]]/}" ]]; then
  echo "ERROR: $SPA_PREFIX_FILE has no path entries" >&2
  exit 1
fi
echo "==> SPA deep-link prefixes: $(grep -vcE '^\s*(#|$)' "$SPA_PREFIX_FILE")"

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
	# llms.txt for AI crawlers (llmstxt.org convention). Without this handle
	# the SPA catch-all used to answer /llms.txt with a JS shell.
	handle /llms.txt {
		root * ${ROOT}/static/brand
		header Content-Type text/plain
		file_server
	}
	# Ops diagnostics (deploy/smoke status). NEVER public: they carry repo
	# state and operational detail. basic_auth + robots.txt disallow + rotated
	# unguessable paths (2026-10-25). Old paths stay matched until the files
	# age off disk — deploys copy but never delete, and an unmatched old file
	# would silently become public 200 again.
	@ops_diag path /brand/deploy-status-e0cf117e.txt /brand/smoke-status-e0cf117e.txt /brand/deploy-status.txt /brand/smoke-status.txt
	handle @ops_diag {
		basic_auth {
			keyo \$2b\$10\$t3yhsgFVbemrJ56tOLe6oeABhzuVne3dA7nw3J05IF9XgF/NmtlCu
		}
		root * ${ROOT}/static/brand
		uri strip_prefix /brand
		file_server
	}
	@sitemaps path /sitemap.xml /sitemap-live.xml
	handle @sitemaps {
		root * ${ROOT}/static/seo
		file_server
	}
	# Brand favicon: the console SPA (<link rel="icon" href="/logo.png"> and
	# /favicon.ico) must show the KeyoAPI mark, not the new-api stock icons.
	# Regenerate the assets with: py scripts/gen-brand-icons.py
	handle /logo.png {
		root * ${ROOT}/static/brand
		header Content-Type image/png
		file_server
	}
	handle /favicon.ico {
		root * ${ROOT}/static/brand
		header Content-Type image/vnd.microsoft.icon
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
	# Alias stub: real 301 so GSC files it under redirects instead of
	# crawled-not-indexed (the meta-refresh stub page stays as fallback).
	redir /model/deepseek-v4-pro /model/deepseek-v4-pro-0813 permanent
	@seo_model path /model /model/*
	handle @seo_model {
		root * ${ROOT}/static/seo
		try_files {path}.html {path}/index.html {path}
		file_server
	}
${GEOFLOW_AGENT_BLOCK}
	# Plan A (2026-10-28): the 27 pre-10-10 bulk articles stay readable (200)
	# but leave the index. The blog sitemap already excludes them (geoflow
	# flag set by vps-static-deploy.sh). Must sit BEFORE @geo_blog.
	@geo_blog_article path /brand/blog/article/*
	handle @geo_blog_article {
		header X-Robots-Tag "noindex, nofollow"
		root * ${ROOT}/static
		try_files {path} {path}.html {path}/index.html
		file_server
	}
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
		handle /v1/decisions {
			reverse_proxy 127.0.0.1:3010 {
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
	# SPA locale shells (i18n only — not crawlable translated landings)
	@locale_spa path /en /en/* /zh /zh/* /zh-CN /zh-CN/* /zh-TW /zh-TW/* /ja /ja/* /ko /ko/* /fr /fr/* /ru /ru/* /vi /vi/*
	handle @locale_spa {
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
	# ---- Fallback discipline (GEO P0, 2026-10-25) ------------------------------
	# The old bare catch-all proxied EVERYTHING unmatched to the SPA (:3001),
	# so any miss — /sitemap.txt, junk URLs, sitemap.xml during its replace
	# window — returned 200 + 448KB HTML shell. GSC logged the sitemap as
	# "type: unknown / couldn't fetch" and every mistyped URL became a
	# crawled-not-indexed duplicate. Replace with ordered rules:
	#   1) backend API + embedded assets always reach new-api
	#   2) file-looking paths (.xml/.txt/…) never get the shell — hard 404
	#   3) SPA deep links (real router prefixes from new-api/web/src/routes)
	#      keep the console working, noindexed
	#   4) everything else is a real 404
	@backend_api path /api /api/* /v1 /v1/* /v1beta /v1beta/* /assets /assets/* /mj /mj/* /pg /pg/* /suno /suno/* /authz /authz/* /custom-oauth-provider /custom-oauth-provider/* /perf-metrics* /performance*
	handle @backend_api {
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
	@looks_like_file path_regexp file_ext \.[A-Za-z0-9]{1,8}$
	handle @looks_like_file {
		respond 404
	}
	@spa_deep path ${SPA_PATH_MATCHER}
	handle @spa_deep {
		header X-Robots-Tag "noindex, nofollow"
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
	handle {
		respond 404
	}
}
EOF

caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

# ---- GEO P1: post-deploy invariants; any failure rolls the deploy back ----
echo "==> Post-deploy verification (sitemap / 404 discipline / SPA deep links)"
verify_failed=0
verify_check() {
  local desc="$1" url="$2" want_code="$3" want_type="${4:-}" want_body="${5:-}"
  local bodyf hdr code ctype head ok
  bodyf=$(mktemp)
  hdr=$(curl -sS -o "$bodyf" -D - --max-time 20 "https://${DOMAIN}${url}" 2>/dev/null || true)
  code=$(awk 'NR==1{print $2}' <<<"$hdr")
  ctype=$(grep -i '^content-type:' <<<"$hdr" | head -1 | tr -d '\r')
  head=$(head -c 4000 "$bodyf")
  ok=1
  [[ "$code" == "$want_code" ]] || ok=0
  if [[ -n "$want_type" && "$ctype" != *"$want_type"* ]]; then ok=0; fi
  if [[ -n "$want_body" && "$head" != *"$want_body"* ]]; then ok=0; fi
  if [[ "$ok" == 1 ]]; then
    echo "VERIFY_OK   $desc (code=$code type=$ctype)"
  else
    echo "VERIFY_FAIL $desc — want code=$want_code type=*$want_type* body~*$want_body*; got code=$code type=$ctype body=$(head -c 80 "$bodyf" | tr '\n' ' ')"
    verify_failed=1
  fi
  rm -f "$bodyf"
}
verify_check "root sitemap 200 xml"            "/sitemap.xml"  200 "text/xml"  "<?xml"
verify_check "blog sitemap 200 plain"          "/brand/blog/sitemap.txt" 200 "text/plain" "https://"
verify_check "junk file ext is 404"            "/sitemap.txt"  404
verify_check "junk path is 404"                "/this-path-does-not-exist-98765" 404
verify_check "SPA pricing deep link alive"     "/pricing/deepseek-v4.1-flash" 200 "text/html"
verify_check "home 200 html"                   "/"             200 "text/html"
verify_check "SPA sign-in alive"               "/sign-in"      200 "text/html"
verify_check "SPA wallet deep link alive"      "/wallet"       200 "text/html"
verify_check "SPA console alias alive"         "/console"      200 "text/html"
verify_check "SPA keys deep link alive"        "/keys"         200 "text/html"
verify_check "SPA topup deep link alive"       "/topup"        200 "text/html"
verify_check "robots declares sitemap"         "/robots.txt"   200 "text/plain" "Sitemap: https://www.keyoapi.xyz/sitemap.xml"
# Plan A invariants: articles readable but noindexed; blog sitemap has no article URLs.
ART_HEAD=$(curl -sSI --max-time 15 "https://${DOMAIN}/brand/blog/article/ooy10bjn/" 2>/dev/null | grep -i '^x-robots-tag' || true)
if [[ "$ART_HEAD" == *noindex* ]]; then
  echo "VERIFY_OK   blog article carries noindex"
else
  echo "VERIFY_FAIL blog article missing noindex (got: ${ART_HEAD:-none})"
  verify_failed=1
fi
BLOG_SM=$(curl -sS --max-time 15 "https://${DOMAIN}/brand/blog/sitemap.txt" 2>/dev/null || true)
if [[ "$BLOG_SM" == *"/article/"* ]]; then
  echo "VERIFY_FAIL blog sitemap still lists article URLs"
  verify_failed=1
else
  echo "VERIFY_OK   blog sitemap lists no article URLs ($(printf '%s' "$BLOG_SM" | wc -l) lines)"
fi

if [[ "$verify_failed" -ne 0 ]]; then
  echo "==> VERIFY_FAILED — rolling back static dirs + Caddyfile"
  if [[ -d "$SEO_DIR.bak-deploy" ]]; then
    rm -rf "${SEO_DIR}.restore"
    cp -a "$SEO_DIR.bak-deploy" "${SEO_DIR}.restore"
    rm -rf "$SEO_DIR"
    mv "${SEO_DIR}.restore" "$SEO_DIR"
  fi
  if [[ -d "$BRAND_DIR.bak-deploy" ]]; then
    rm -rf "${BRAND_DIR}.restore"
    cp -a "$BRAND_DIR.bak-deploy" "${BRAND_DIR}.restore"
    rm -rf "$BRAND_DIR"
    mv "${BRAND_DIR}.restore" "$BRAND_DIR"
  fi
  if [[ -f /etc/caddy/Caddyfile.bak-deploy ]]; then
    cp -a /etc/caddy/Caddyfile.bak-deploy /etc/caddy/Caddyfile
  fi
  caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
  echo "ROLLBACK_DONE"
  exit 1
fi
rm -rf "$SEO_DIR.bak-deploy" "$BRAND_DIR.bak-deploy" /etc/caddy/Caddyfile.bak-deploy

echo "==> Check"
# NB: write to temp files, never `curl | head -c N` — head closes the pipe,
# curl dies on SIGPIPE and `set -o pipefail` aborts the whole script.
TMP_LOGO=$(mktemp); TMP_FAV=$(mktemp); trap 'rm -f "$TMP_LOGO" "$TMP_FAV"' EXIT
curl -fsS "https://${DOMAIN}/logo.png" -o "$TMP_LOGO"
curl -fsS "https://${DOMAIN}/favicon.ico" -o "$TMP_FAV"
echo "brand_logo_png_magic=$(od -An -tx1 -N8 "$TMP_LOGO" | tr -d ' \n') expect=89504e470d0a1a0a bytes=$(wc -c < "$TMP_LOGO")"
echo "brand_favicon_ico_magic=$(od -An -tx1 -N4 "$TMP_FAV" | tr -d ' \n') expect=00000100 bytes=$(wc -c < "$TMP_FAV")"
cmp -s "$TMP_LOGO" "${ROOT}/static/brand/logo.png" && echo "brand_logo_png=match" || echo "brand_logo_png=MISMATCH"
cmp -s "$TMP_FAV" "${ROOT}/static/brand/favicon.ico" && echo "brand_favicon_ico=match" || echo "brand_favicon_ico=MISMATCH"
rm -f "$TMP_LOGO" "$TMP_FAV"; trap - EXIT
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
