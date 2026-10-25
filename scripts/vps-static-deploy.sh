#!/bin/bash
# One command for the VPS side of the static SEO/brand workflow:
# pull the repo (preserving published blog articles), back up the Caddyfile,
# then run the standard brand/SEO static deploy.
#
#   sudo bash /opt/ai-relay/scripts/vps-static-deploy.sh
#   (or streamed from the workflow runner: ssh 'sudo bash -s' < this-file)
#
# ALL output — including safe-pull failures — is mirrored to the public
# /brand/deploy-status.txt because GitHub job logs are unreadable without
# admin rights.

set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"
STATUS="$ROOT/static/brand/deploy-status.txt"

main() {
  # RELOAD_CADDY must be passed explicitly: the inner sudo strips it from the
  # environment, so a plain `sudo -E` on this script is not enough to reach
  # safe-pull's Caddy reload step. deploy-brand-static.sh validates and
  # reloads Caddy itself, so keep the pull quiet here.
  sudo RELOAD_CADDY="${RELOAD_CADDY:-0}" bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"
  sudo cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"
  sudo bash "$ROOT/scripts/deploy-brand-static.sh"
  echo DONE_STATIC_DEPLOY
}

mkdir -p "$ROOT/static/brand"
# Redact repo identity + absolute paths before mirroring to the public file
# (it sits behind basic_auth, but do not write secrets even there).
set +e
main 2>&1 \
  | sed -E 's|https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+|[redacted-repo]|g; s|/opt/ai-relay|~|g' \
  | tee "$STATUS"
code="${PIPESTATUS[0]}"
set -e
chmod 644 "$STATUS" 2>/dev/null || true
exit "$code"
