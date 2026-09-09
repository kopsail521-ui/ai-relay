#!/usr/bin/env bash
# Publish SPA noindex shell next to other crawlable static SEO files
# (same directory Caddy already serves successfully for /about, /models, etc.).
set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC_CANDIDATES=(
  "${REPO_ROOT}/static/seo/_spa_shell.html"
  "${REPO_ROOT}/static/spa-shell/index.html"
  "${ROOT}/static/seo/_spa_shell.html"
  "${ROOT}/static/spa-shell/index.html"
)

SRC=""
for f in "${SRC_CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then
    SRC="$f"
    break
  fi
done

if [[ -z "$SRC" ]]; then
  echo "FAIL_SPA_SHELL_TEMPLATE_MISSING" >&2
  exit 1
fi

mkdir -p "${ROOT}/static/seo" "${ROOT}/static/spa-shell"
cp -f "$SRC" "${ROOT}/static/seo/_spa_shell.html"
cp -f "$SRC" "${ROOT}/static/spa-shell/index.html"
chmod a+r "${ROOT}/static/seo/_spa_shell.html" "${ROOT}/static/spa-shell/index.html" || true

for out in "${ROOT}/static/seo/_spa_shell.html" "${ROOT}/static/spa-shell/index.html"; do
  if ! grep -q 'noindex' "$out"; then
    echo "FAIL_SPA_SHELL_NO_NOINDEX $out" >&2
    exit 1
  fi
done

echo "OK_SPA_SHELL_NOINDEX src=$SRC bytes=$(wc -c < "${ROOT}/static/seo/_spa_shell.html")"
grep -o 'noindex' "${ROOT}/static/seo/_spa_shell.html" | head -n 1
