#!/usr/bin/env bash
# Ensure static/spa-shell/index.html exists (committed template already has noindex).
# Optionally refresh from repo copy after git pull.
set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
OUT_DIR="${ROOT}/static/spa-shell"
OUT_FILE="${OUT_DIR}/index.html"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="${REPO_ROOT}/static/spa-shell/index.html"

mkdir -p "$OUT_DIR"
if [[ ! -f "$SRC" ]]; then
  echo "FAIL_SPA_SHELL_TEMPLATE_MISSING $SRC" >&2
  exit 1
fi
cp -f "$SRC" "$OUT_FILE"

if ! grep -q 'name="robots"' "$OUT_FILE" || ! grep -q 'noindex' "$OUT_FILE"; then
  echo "FAIL_SPA_SHELL_TEMPLATE_NO_NOINDEX" >&2
  exit 1
fi
if ! grep -q 'id="root"' "$OUT_FILE"; then
  echo "FAIL_SPA_SHELL_TEMPLATE_NO_ROOT" >&2
  exit 1
fi

echo "OK_SPA_SHELL_NOINDEX bytes=$(wc -c < "$OUT_FILE") path=$OUT_FILE"
grep -o 'noindex' "$OUT_FILE" | head -n 1
