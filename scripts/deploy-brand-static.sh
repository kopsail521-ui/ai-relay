#!/bin/bash
# 把多语言品牌页部署到 VPS，并让 Caddy 提供 /brand/*
# 在服务器上执行：
#   sudo bash scripts/deploy-brand-static.sh
# 或本机：
#   scp -r static/brand root@YOUR_VPS:/opt/ai-relay/static/
#   ssh root@YOUR_VPS 'bash -s' < scripts/deploy-brand-static.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
BRAND_DIR="${ROOT}/static/brand"
DOMAIN="${DOMAIN:-www.keyoapi.xyz}"

mkdir -p "$BRAND_DIR"

# If script is run from repo, copy local files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_BRAND="$(cd "$SCRIPT_DIR/.." && pwd)/static/brand"
if [[ -d "$REPO_BRAND" ]]; then
  cp -a "$REPO_BRAND/." "$BRAND_DIR/"
  echo "==> Copied brand pages to $BRAND_DIR"
fi

if [[ ! -f "$BRAND_DIR/keyo-home.html" || ! -f "$BRAND_DIR/keyo-docs.html" ]]; then
  echo "Missing $BRAND_DIR/keyo-home.html or keyo-docs.html"
  echo "Copy static/brand/* there first."
  exit 1
fi

echo "==> Update Caddyfile for $DOMAIN"
cat >/etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	encode gzip

	handle_path /brand/* {
		root * ${ROOT}/static/brand
		file_server
	}

	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> Check"
curl -sI "https://${DOMAIN}/brand/keyo-home.html" | head -n 5
curl -sI "https://${DOMAIN}/brand/keyo-docs.html" | head -n 5
curl -sI "https://${DOMAIN}/brand/aup.html" | head -n 5
curl -sI "https://${DOMAIN}/privacy-policy" | head -n 5
curl -sI "https://${DOMAIN}/user-agreement" | head -n 5

echo ""
echo "Next: from your PC run"
echo "  node scripts/apply-creem-compliance.mjs"
echo "  node scripts/apply-site-branding.mjs"
