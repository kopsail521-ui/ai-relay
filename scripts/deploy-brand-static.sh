#!/bin/bash
# Deploy brand + SEO static files and install durable Caddyfile (SEO before SPA).
# On VPS:
#   sudo bash scripts/deploy-brand-static.sh
# Prefer SEO deploy for SEO-only updates:
#   node scripts/print-vps-seo-caddy.mjs  → paste one-liner on Workbench

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
fi

if [[ ! -f "$BRAND_DIR/keyo-home.html" || ! -f "$BRAND_DIR/keyo-docs.html" ]]; then
  echo "Missing $BRAND_DIR/keyo-home.html or keyo-docs.html"
  exit 1
fi

echo "==> Update Caddyfile for $DOMAIN (keeps SEO handles + apex→www redirect)"
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
	handle /pricing {
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
	@spa_noindex path /sign-in /sign-in/* /sign-up /sign-up/* /console /console/* /rankings /rankings/* /dashboard /dashboard/* /admin /admin/* /setup /setup/*
	handle @spa_noindex {
		header X-Robots-Tag "noindex, nofollow"
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
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

echo "==> Patch SPA shell noindex inside running new-api container (if present)"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx ai-relay-new-api; then
  docker exec ai-relay-new-api sh -c '
    f=/app/web/dist/index.html
    if [ ! -f "$f" ]; then echo "no_dist_index"; exit 0; fi
    if grep -q "name=\"robots\"" "$f"; then echo "robots_meta_present"; exit 0; fi
    sed -i "s#</head>#  <meta name=\"robots\" content=\"noindex, nofollow\" />\n  </head>#" "$f"
    echo "robots_meta_patched"
  ' || echo "spa_patch_skipped"
else
  echo "container_not_running_skip_spa_patch"
fi

echo "==> Check"
curl -sI "https://${DOMAIN}/robots.txt" | head -n 5
curl -sI "https://${DOMAIN}/" | head -n 5
curl -sI "https://${DOMAIN}/about" | head -n 5
curl -sI "https://${DOMAIN}/sign-in" | head -n 8
curl -sI "https://${DOMAIN}/brand/keyo-docs.html" | head -n 5
curl -sI "https://${APEX_DOMAIN}/sitemap.xml" | head -n 8 || true

echo "DONE_BRAND_SEO_DEPLOY"
