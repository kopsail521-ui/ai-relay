#!/bin/bash
# One command for the VPS side of the blog workflow:
# pull the repo (preserving published articles), publish everything waiting
# in blog-inbox/, then rebuild index/sitemap so the files always match the
# catalog even when the inbox was empty.
#
#   sudo bash /opt/ai-relay/scripts/vps-blog-sync.sh

set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"

sudo bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"
sudo bash "$ROOT/scripts/blog-publish-inbox.sh"
sudo php "$ROOT/scripts/geoflow-rebuild-blog.php"
echo DONE_BLOG_SYNC
