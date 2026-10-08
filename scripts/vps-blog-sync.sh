#!/bin/bash
# One command for the VPS side of the blog workflow:
# pull the repo (preserving published articles) and publish everything
# waiting in blog-inbox/.
#
#   sudo bash /opt/ai-relay/scripts/vps-blog-sync.sh

set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"

sudo bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"
sudo bash "$ROOT/scripts/blog-publish-inbox.sh"
echo DONE_BLOG_SYNC
