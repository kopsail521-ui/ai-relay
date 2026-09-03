#!/bin/bash
# 在阿里云 Workbench 粘贴执行（需 sudo / root）
# 把新文档页挂到 https://www.keyoapi.xyz/brand/keyo-docs.html
set -euo pipefail
DOMAIN="${DOMAIN:-www.keyoapi.xyz}"
DOCS_URL="${DOCS_URL:-https://paste.rs/tlCJa}"
HOME_URL="${HOME_URL:-https://paste.rs/vDWsV}"

mkdir -p /opt/ai-relay/static/brand
curl -fsSL "$DOCS_URL" -o /opt/ai-relay/static/brand/keyo-docs.html
curl -fsSL "$HOME_URL" -o /opt/ai-relay/static/brand/keyo-home.html

cat >/etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	encode gzip

	handle_path /brand/* {
		root * /opt/ai-relay/static/brand
		file_server
	}

	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> sizes"
wc -c /opt/ai-relay/static/brand/keyo-*.html || true
echo "==> probe"
curl -sI "https://${DOMAIN}/brand/keyo-docs.html" | head -n 15
echo DONE
