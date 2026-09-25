#!/bin/bash
# Safe VPS pull: never wipe GEO-published blog files.
# Usage on VPS:
#   bash scripts/vps-safe-pull-preserve-blog.sh
# Optional: also reinstall durable Caddy (includes @geo_blog):
#   RELOAD_CADDY=1 bash scripts/vps-safe-pull-preserve-blog.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
BLOG="$ROOT/static/brand/blog"
STASH="/tmp/keyo-geo-blog-preserve-$(date +%s)"

cd "$ROOT"

mkdir -p "$BLOG/article"
if [[ -d "$BLOG" ]]; then
  mkdir -p "$STASH"
  cp -a "$BLOG/." "$STASH/"
  echo "==> preserved blog -> $STASH ($(find "$STASH" -type f | wc -l) files)"
fi

git stash push -u -m "wb-preserve-$(date +%s)" 2>/dev/null || true
git fetch origin
git reset --hard origin/main

mkdir -p "$BLOG/article"
if [[ -d "$STASH" ]]; then
  # Restore GEO files without deleting repo-tracked guides.
  cp -a "$STASH/." "$BLOG/"
  echo "==> restored blog from $STASH"
fi

# Ensure GEO can keep writing after chown/reset cycles.
chmod -R u+rwX,go+rX "$BLOG" 2>/dev/null || true
chown -R "$(stat -c '%U:%G' "$ROOT" 2>/dev/null || echo admin:admin)" "$BLOG" 2>/dev/null || true

echo "HEAD=$(git rev-parse --short HEAD)"
echo "blog_files=$(find "$BLOG" -type f | wc -l)"

if [[ "${RELOAD_CADDY:-0}" == "1" ]]; then
  sudo bash "$ROOT/scripts/deploy-brand-static.sh"
fi

echo "DONE_SAFE_PULL_PRESERVE_BLOG"
