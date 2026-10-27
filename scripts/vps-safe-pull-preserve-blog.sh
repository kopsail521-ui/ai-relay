#!/bin/bash
# Safe VPS pull: preserve GEO published articles; never overwrite geoflow-agent PHP from stash.
# Usage:
#   bash scripts/vps-safe-pull-preserve-blog.sh
#   RELOAD_CADDY=1 bash scripts/vps-safe-pull-preserve-blog.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
BLOG="$ROOT/static/brand/blog"
STASH=$(mktemp -d "${TMPDIR:-/tmp}/keyo-geo-blog-preserve.XXXXXX")

cd "$ROOT"

sudo mkdir -p "$BLOG/article" "$STASH/article"
if [[ -d "$BLOG/article" ]]; then
  sudo cp -a "$BLOG/article/." "$STASH/article/"
fi
if [[ -f "$BLOG/index.html" ]]; then sudo cp -a "$BLOG/index.html" "$STASH/index.html"; fi
if [[ -f "$BLOG/sitemap.txt" ]]; then sudo cp -a "$BLOG/sitemap.txt" "$STASH/sitemap.txt"; fi
sudo chown -R "$(whoami):$(whoami)" "$STASH" 2>/dev/null || true
echo "==> preserved article/ + index/sitemap -> $STASH"

# Keep both sides of the tracked-file boundary. A tracked article changed in
# Git must win over an older VPS copy; an intentionally deleted tracked file
# must not be resurrected either. The entire article directory is gitignored,
# so `git ls-files --others --exclude-standard` would miss live CMS articles.
declare -A tracked_before=()
while IFS= read -r -d '' path; do
  tracked_before["$path"]=1
done < <(git ls-files -z -- static/brand/blog/article)

unmanaged=0
while IFS= read -r -d '' article; do
  path="static/brand/blog/article/${article#"$STASH/article/"}"
  if [[ -z "${tracked_before[$path]+tracked}" ]]; then
    unmanaged=$((unmanaged + 1))
  fi
done < <(find "$STASH/article" -type f -print0)

# The catalog rebuild keeps newly published CMS pages discoverable. Refuse
# before resetting anything if we cannot rebuild their index, rather than
# restoring an obsolete tracked index over a newly fixed template.
if [[ "$unmanaged" -gt 0 && -f "$ROOT/scripts/geoflow-rebuild-blog.php" ]] && ! command -v php >/dev/null 2>&1; then
  echo "ABORT: php-cli is required to rebuild the index of preserved CMS articles; backup: $STASH" >&2
  exit 1
fi

sudo chown -R "$(whoami):$(whoami)" "$ROOT" 2>/dev/null || true
# Stash tracked changes (index/sitemap) as a backup for this run; it is
# dropped again at the end once the /tmp restore has succeeded, so repeated
# pulls do not pile up stash entries.
stash_before=$(git stash list 2>/dev/null | wc -l)
git stash push -u -m "wb-preserve-$(date +%s)"
git fetch origin
git reset --hard origin/main

sudo mkdir -p "$BLOG/article"
restored=0
while IFS= read -r -d '' article; do
  path="static/brand/blog/article/${article#"$STASH/article/"}"
  if [[ -n "${tracked_before[$path]+tracked}" ]] || git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    continue
  fi
  sudo mkdir -p "$(dirname "$ROOT/$path")"
  sudo cp -a "$article" "$ROOT/$path"
  restored=$((restored + 1))
done < <(find "$STASH/article" -type f -print0)
echo "==> restored $restored unmanaged article files; Git owns tracked article content and templates"
if [[ -f "$ROOT/scripts/geoflow-rebuild-blog.php" ]] && command -v php >/dev/null 2>&1; then
  sudo php "$ROOT/scripts/geoflow-rebuild-blog.php"
  echo "==> refreshed blog index using latest template"
fi

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

# This run's verified restore is complete; remove only its own mktemp backup.
# Failed runs retain the backup for recovery.
case "$STASH" in "${TMPDIR:-/tmp}"/keyo-geo-blog-preserve.*) sudo rm -rf -- "$STASH" ;; *) exit 1 ;; esac
echo "DONE_SAFE_PULL_PRESERVE_BLOG"
