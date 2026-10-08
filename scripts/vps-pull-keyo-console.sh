#!/bin/bash
# Pull the console image built by GitHub Actions and recreate the container.
# Does not compile. Safe on a 1GB VPS.
#   sudo bash /opt/ai-relay/scripts/vps-pull-keyo-console.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
IMAGE="${IMAGE:-ghcr.io/kopsail521-ui/keyo-new-api:main}"

cd "$ROOT"
# Never bare `git pull` here: it resets blog index.html/sitemap.txt to the
# committed 3-card/4-line versions and orphans every published article.
sudo bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"
sudo php "$ROOT/scripts/geoflow-rebuild-blog.php" \
  || echo "WARN: blog rebuild skipped (php-cli missing?)"
sudo docker pull "$IMAGE"
sudo IMAGE="$IMAGE" bash "$ROOT/scripts/vps-recreate-new-api-container.sh"
echo DONE_PULL_KEYO_CONSOLE
