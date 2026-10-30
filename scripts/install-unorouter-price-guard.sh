#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/ai-relay
CONFIG="$ROOT/config/unorouter-price-guard.json"
if [[ ! -f "$CONFIG" ]]; then
  echo "missing $CONFIG; copy config/unorouter-price-guard.example.json and set your caps" >&2
  exit 2
fi
install -m 0644 "$ROOT/scripts/unorouter-price-guard.service" /etc/systemd/system/keyo-unorouter-price-guard.service
install -m 0644 "$ROOT/scripts/unorouter-price-guard.timer" /etc/systemd/system/keyo-unorouter-price-guard.timer
systemctl daemon-reload
systemctl enable --now keyo-unorouter-price-guard.timer
systemctl start keyo-unorouter-price-guard.service
systemctl --no-pager --full status keyo-unorouter-price-guard.timer
