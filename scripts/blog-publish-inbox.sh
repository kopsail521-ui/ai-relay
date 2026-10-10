#!/bin/bash
# Publish every article waiting in blog-inbox/ (git-tracked drop zone).
#
# The workflow: the assistant formats an article as an HTML fragment whose
# first lines carry the metadata, commits it to blog-inbox/, pushes. On the
# VPS this script feeds each file to blog-self-publish.php (same shell as
# every other article, catalog entry, index + sitemap rebuild). Re-running
# is idempotent: the same slug simply overwrites the same article.
#
#   sudo bash /opt/ai-relay/scripts/blog-publish-inbox.sh

set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"
INBOX="$ROOT/blog-inbox"

[ -d "$INBOX" ] || { echo "no blog-inbox/ directory: $INBOX"; exit 0; }

shopt -s nullglob
files=("$INBOX"/*.html)
if [ ${#files[@]} -eq 0 ]; then
  echo "inbox empty — nothing to publish"
  exit 0
fi

for f in "${files[@]}"; do
  base=$(basename "$f" .html)
  title=$(sed -n 's/^<!--[[:space:]]*TITLE:[[:space:]]*\(.*\)[[:space:]]*-->$/\1/p' "$f" | head -1)
  excerpt=$(sed -n 's/^<!--[[:space:]]*EXCERPT:[[:space:]]*\(.*\)[[:space:]]*-->$/\1/p' "$f" | head -1)
  desc=$(sed -n 's/^<!--[[:space:]]*DESC:[[:space:]]*\(.*\)[[:space:]]*-->$/\1/p' "$f" | head -1)
  if [ -z "$title" ]; then
    echo "SKIP $base: first line must be <!-- TITLE: ... -->"
    continue
  fi
  args=(--slug="$base" --title="$title" --file="$f")
  [ -n "$excerpt" ] && args+=(--excerpt="$excerpt")
  [ -n "$desc" ] && args+=(--desc="$desc")
  echo "==> publishing $base"
  php "$ROOT/scripts/blog-self-publish.php" "${args[@]}" || { echo "FAILED $base"; exit 1; }
done

echo DONE_PUBLISH_INBOX
