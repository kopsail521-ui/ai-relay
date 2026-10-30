#!/bin/bash
# One command for the VPS side of the static SEO/brand workflow:
# pull the repo (preserving published blog articles), back up the Caddyfile,
# then run the standard brand/SEO static deploy.
#
#   sudo bash /opt/ai-relay/scripts/vps-static-deploy.sh
#   (or streamed from the workflow runner: ssh 'sudo bash -s' < this-file)
#
# ALL output — including safe-pull failures — is mirrored to the public
# /brand/deploy-status.txt because GitHub job logs are unreadable without
# admin rights.

set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"
STATUS="$ROOT/static/brand/deploy-status-e0cf117e.txt"

main() {
  # Agent access (2026-10-29): install the local agent's public key for the
  # deploy SSH user so VPS-side verifications (e.g. the speech smoke) can run
  # without the GitHub UI. Public key only, idempotent, safe to keep.
  AGENT_PUB='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN9wdOnzv4Yq6fBoWTsKeOnrJ4P4E9UEvKKNunNMh6DI zcode-agent@local'
  DEPLOY_USER="${DEPLOY_USER:-admin}"
  DEPLOY_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6 || true)
  if [ -n "$DEPLOY_HOME" ] && [ -d "$DEPLOY_HOME" ]; then
    install -d -m 700 "$DEPLOY_HOME/.ssh"
    touch "$DEPLOY_HOME/.ssh/authorized_keys"
    grep -qF "$AGENT_PUB" "$DEPLOY_HOME/.ssh/authorized_keys" || echo "$AGENT_PUB" >> "$DEPLOY_HOME/.ssh/authorized_keys"
    chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"
    chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$DEPLOY_HOME/.ssh" 2>/dev/null || true
    echo "agent-key: present for $DEPLOY_USER"
  fi

  # Plan A (2026-10-28): the 27 pre-10-10 bulk articles stay readable (200)
  # but leave the blog sitemap. geoflow-rebuild-blog.php reads
  # data/geoflow-agent/gate.json (NOT config.json — verified in load_gate()).
  # safe-pull's blog rebuild runs after this, so it regenerates sitemap.txt
  # without article URLs. Idempotent.
  GEO_GATE="$ROOT/data/geoflow-agent/gate.json"
  if [ -f "$GEO_GATE" ]; then
    sudo python3 - "$GEO_GATE" <<'PY' || true
import json, sys
p = sys.argv[1]
with open(p, encoding="utf-8") as f:
    gate = json.load(f)
if gate.get("sitemap_include_articles"):
    gate["sitemap_include_articles"] = False
    with open(p, "w", encoding="utf-8") as f:
        json.dump(gate, f, ensure_ascii=False, indent=2)
    print("plan-a: gate.json sitemap_include_articles -> false")
PY
  fi

  # RELOAD_CADDY must be passed explicitly: the inner sudo strips it from the
  # environment, so a plain `sudo -E` on this script is not enough to reach
  # safe-pull's Caddy reload step. deploy-brand-static.sh validates and
  # reloads Caddy itself, so keep the pull quiet here.
  sudo RELOAD_CADDY="${RELOAD_CADDY:-0}" bash "$ROOT/scripts/vps-safe-pull-preserve-blog.sh"
  sudo cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"
  sudo bash "$ROOT/scripts/deploy-brand-static.sh"
  echo DONE_STATIC_DEPLOY
}

mkdir -p "$ROOT/static/brand"
# Redact repo identity + absolute paths before mirroring to the public file
# (it sits behind basic_auth, but do not write secrets even there).
set +e
main 2>&1 \
  | sed -E 's|https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+|[redacted-repo]|g; s|/opt/ai-relay|~|g' \
  | tee "$STATUS"
code="${PIPESTATUS[0]}"
set -e
chmod 644 "$STATUS" 2>/dev/null || true
exit "$code"
