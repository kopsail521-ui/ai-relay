#!/bin/bash
# Pull the console image built by GitHub Actions and recreate the container.
# Does not compile. Safe on a 1GB VPS.
#   sudo bash /opt/ai-relay/scripts/vps-pull-keyo-console.sh

set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
IMAGE="${IMAGE:-ghcr.io/kopsail521-ui/keyo-new-api:main}"

cd "$ROOT"
sudo git pull --ff-only origin main
sudo docker pull "$IMAGE"
sudo IMAGE="$IMAGE" bash "$ROOT/scripts/vps-recreate-new-api-container.sh"
echo DONE_PULL_KEYO_CONSOLE
