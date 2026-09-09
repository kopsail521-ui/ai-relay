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
DST_SEO="${ROOT}/static/seo/spa-shell.html"
DST_IDX="${ROOT}/static/spa-shell/index.html"

copy_if_different() {
  local src="$1" dst="$2"
  if [[ -f "$dst" ]] && [[ "$(realpath "$src")" == "$(realpath "$dst")" ]]; then
    return 0
  fi
  cp -f "$src" "$dst"
}

copy_if_different "$SRC" "$DST_SEO"
copy_if_different "$DST_SEO" "$DST_IDX"
chmod a+r "$DST_SEO" "$DST_IDX" 2>/dev/null || true

if ! grep -q 'noindex' "$DST_SEO"; then
  echo "FAIL_SPA_SHELL_NO_NOINDEX" >&2
  exit 1
fi

echo "OK_SPA_SHELL_NOINDEX src=$SRC bytes=$(wc -c < "$DST_SEO")"
grep -o 'noindex' "$DST_SEO" | head -n 1
