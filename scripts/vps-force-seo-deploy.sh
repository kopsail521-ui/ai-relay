#!/usr/bin/env bash
# One-shot VPS sync: drop local spa-shell conflicts, hard-reset to origin/main, deploy.
set -euo pipefail
cd /opt/ai-relay
rm -rf static/spa-shell
rm -f static/seo/_spa_shell.html static/seo/spa-shell.html
git fetch origin
git reset --hard origin/main
sudo bash scripts/deploy-brand-static.sh
echo "==> Final verify"
curl -sI https://www.keyoapi.xyz/sign-in | head -n 5
curl -s https://www.keyoapi.xyz/spa-shell.html | grep -o noindex | head -n 1
curl -s https://www.keyoapi.xyz/sign-in | grep -o noindex | head -n 1
curl -s https://www.keyoapi.xyz/sign-in | wc -c
