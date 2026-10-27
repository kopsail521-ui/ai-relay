#!/bin/bash
# Freeze remediation: reclaim disk before it fills up again.
#
# Root cause found: /dev/vda3 30G at 92% used; docker image layers have
# accumulated ~13.9GB of reclaimable unused images, journald has no size cap,
# and docker containers run without json-file log rotation.
#
# This script (low risk, no container restart):
#   1. docker image prune -af        -> drop unused images (keeps ACTIVE ones)
#   2. docker builder prune -af      -> drop build cache
#   3. journalctl --vacuum-size=200M -> cap systemd logs now
#   4. write /etc/docker/daemon.json -> 10m x 3 json-file rotation (takes
#      effect after the next docker daemon restart / VPS reboot)
#   5. write SystemMaxUse=200M into journald.conf
#   6. report before/after disk usage
# Never touches app data, options, balances, or DB files.
set -uo pipefail
ROOT=/opt/ai-relay

echo "===== BEFORE ====="
df -h / | tail -1
docker system df 2>&1 | head -6

echo "===== PRUNE UNUSED IMAGES ====="
docker image prune -af 2>&1 | tail -3

echo "===== PRUNE BUILD CACHE ====="
docker builder prune -af 2>&1 | tail -3

echo "===== JOURNAL VACUUM ====="
journalctl --vacuum-size=200M 2>&1 | tail -2

echo "===== CONFIGURE DOCKER LOG ROTATION ====="
if [ -f /etc/docker/daemon.json ]; then
  cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M%S)"
  echo "backed up existing daemon.json"
fi
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
JSON
echo "wrote /etc/docker/daemon.json (takes effect after docker daemon restart)"

echo "===== CAP JOURNALD ====="
cp /etc/systemd/journald.conf "/etc/systemd/journald.conf.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
if grep -q '^#\?SystemMaxUse=' /etc/systemd/journald.conf; then
  sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=200M/' /etc/systemd/journald.conf
else
  echo 'SystemMaxUse=200M' >> /etc/systemd/journald.conf
fi
echo "journald capped at 200M (takes effect on journald restart)"

echo "===== AFTER ====="
df -h / | tail -1
docker system df 2>&1 | head -6

echo "===== NOTE ====="
echo "daemon.json + journald.conf apply after next docker/journald restart or VPS reboot."
echo "DONE_FREEZE_CLEANUP"