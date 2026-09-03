#!/bin/bash
# 在新加坡 VPS 上：域名 + HTTPS 反代到 New API(:3000)
# 用法（先把域名解析好）：
#   sudo DOMAIN=api.你的域名.com bash scripts/setup-https-caddy.sh

set -euo pipefail

DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "请设置域名，例如："
  echo "  sudo DOMAIN=api.example.com bash scripts/setup-https-caddy.sh"
  exit 1
fi

echo "==> 安装 Caddy"
apt-get update -y
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> 写 Caddyfile（自动申请 Let's Encrypt 证书 + /brand 静态页）"
mkdir -p /opt/ai-relay/static/brand
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

echo "==> 放行 80/443"
ufw allow 80/tcp || true
ufw allow 443/tcp || true

systemctl enable --now caddy
systemctl reload caddy

echo ""
echo "========================================"
echo " 完成。客户 Base URL："
echo "   https://${DOMAIN}/v1"
echo " 控制台："
echo "   https://${DOMAIN}"
echo "========================================"
echo "若打不开：检查域名 A 记录是否指向本机公网 IP，等待解析生效后再执行："
echo "  sudo systemctl reload caddy"
