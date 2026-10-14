#!/bin/bash
# One command for the VPS side of the static SEO/brand workflow:
# pull the repo (preserving published blog articles), back up the Caddyfile,
# then run the standard brand/SEO static deploy.
#
#   sudo bash /opt/ai-relay/scripts/vps-static-deploy.sh

set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"

# RELOAD_CADDY must be passed explicitly: the inner sudo strips it from the
# environment, so a plain `sudo -E` on this script is not enough to reach
# safe-pull's Caddy reload step. deploy-brand-static.sh validates and reloads
# Caddy itself, so keep the pull quiet here.
sudo RELOAD_CADDY="${RELOAD_CADDY:-0}" bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"
sudo cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"
sudo bash "$ROOT/scripts/deploy-brand-static.sh"
echo DONE_STATIC_DEPLOY
