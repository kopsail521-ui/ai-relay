#!/bin/bash
# Safe VPS pull: preserve GEO published articles; never overwrite geoflow-agent PHP from stash.
# Usage:
#   bash scripts/vps-safe-pull-preserve-blog.sh
#   RELOAD_CADDY=1 bash scripts/vps-safe-pull-preserve-blog.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
BLOG="$ROOT/static/brand/blog"
STASH="/tmp/keyo-geo-blog-preserve-$(date +%s)"

cd "$ROOT"

sudo mkdir -p "$BLOG/article" "$STASH/article"
if [[ -d "$BLOG/article" ]]; then
  sudo cp -a "$BLOG/article/." "$STASH/article/" 2>/dev/null || true
fi
[[ -f "$BLOG/index.html" ]] && sudo cp -a "$BLOG/index.html" "$STASH/index.html" || true
[[ -f "$BLOG/sitemap.txt" ]] && sudo cp -a "$BLOG/sitemap.txt" "$STASH/sitemap.txt" || true
sudo chown -R "$(whoami):$(whoami)" "$STASH" 2>/dev/null || true
echo "==> preserved article/ + index/sitemap -> $STASH"

sudo chown -R "$(whoami):$(whoami)" "$ROOT" 2>/dev/null || true
# Stash tracked changes (index/sitemap) as a backup for this run; it is
# dropped again at the end once the /tmp restore has succeeded, so repeated
# pulls do not pile up stash entries.
stash_before=$(git stash list 2>/dev/null | wc -l)
git stash push -u -m "wb-preserve-$(date +%s)" 2>/dev/null || true
git fetch origin
git reset --hard origin/main

sudo mkdir -p "$BLOG/article"
if [[ -d "$STASH/article" ]]; then
  sudo cp -a "$STASH/article/." "$BLOG/article/"
fi
[[ -f "$STASH/index.html" ]] && sudo cp -a "$STASH/index.html" "$BLOG/index.html" || true
[[ -f "$STASH/sitemap.txt" ]] && sudo cp -a "$STASH/sitemap.txt" "$BLOG/sitemap.txt" || true
echo "==> restored GEO article content (geoflow-agent PHP kept from git)"

sudo chmod -R u+rwX,go+rX "$BLOG" 2>/dev/null || true
if id www-data >/dev/null 2>&1; then
  sudo chgrp -R www-data "$BLOG" "$ROOT/data/geoflow-agent" 2>/dev/null || true
  sudo chmod -R g+rwX "$BLOG" "$ROOT/data/geoflow-agent" 2>/dev/null || true
fi
sudo chown -R "$(whoami):$(whoami)" "$BLOG" 2>/dev/null || true
# keep group writable for php-fpm
sudo chmod -R g+rwX "$BLOG" 2>/dev/null || true

echo "HEAD=$(git rev-parse --short HEAD)"
echo "blog_files=$(find "$BLOG" -type f | wc -l)"

# Restore succeeded — this run's stash is no longer needed. Keep it if the
# script never got here (it is the recovery path for a failed restore).
stash_after=$(git stash list 2>/dev/null | wc -l)
if [ "$stash_after" -gt "$stash_before" ]; then
  git stash drop 'stash@{0}' 2>/dev/null || true
fi

if [[ "${RELOAD_CADDY:-0}" == "1" ]]; then
  sudo bash "$ROOT/scripts/deploy-brand-static.sh"
fi

echo "DONE_SAFE_PULL_PRESERVE_BLOG"
