#!/bin/bash
# Restart systemd-journald only so the 200M cap applies now. Zero container
# impact (journald is the logging daemon; app containers are untouched).
set -uo pipefail
systemctl restart systemd-journald
sleep 2
echo "=== journald usage after restart ==="
journalctl --disk-usage 2>&1 | head -2
echo "DONE_ENABLE_JOURNALD_CAP"
