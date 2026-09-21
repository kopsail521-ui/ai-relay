#!/bin/bash
# Do NOT build the console image on this VPS (1GB RAM; docker build freezes the machine).
# GitHub Actions builds and publishes ghcr.io/kopsail521-ui/keyo-new-api:main
# Update the running container with:
#   sudo bash /opt/ai-relay/scripts/vps-pull-keyo-console.sh

set -euo pipefail

echo "REFUSED: do not compile new-api on this server."
echo "The image is built by GitHub Actions."
echo "Pull it with: sudo bash /opt/ai-relay/scripts/vps-pull-keyo-console.sh"
exit 1
