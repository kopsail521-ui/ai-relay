#!/usr/bin/env bash
# Publish static/seo/spa-shell.html (noindex) for Caddy auth/console routes.
set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC_CANDIDATES=(
  "${REPO_ROOT}/static/seo/spa-shell.html"
  "${REPO_ROOT}/static/spa-shell/index.html"
  "${ROOT}/static/seo/spa-shell.html"
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
cp -f "$SRC" "${ROOT}/static/seo/spa-shell.html"
cp -f "$SRC" "${ROOT}/static/spa-shell/index.html"
chmod a+r "${ROOT}/static/seo/spa-shell.html" || true

if ! grep -q 'noindex' "${ROOT}/static/seo/spa-shell.html"; then
  echo "FAIL_SPA_SHELL_NO_NOINDEX" >&2
  exit 1
fi

echo "OK_SPA_SHELL_NOINDEX src=$SRC bytes=$(wc -c < "${ROOT}/static/seo/spa-shell.html")"
grep -o 'noindex' "${ROOT}/static/seo/spa-shell.html" | head -n 1
