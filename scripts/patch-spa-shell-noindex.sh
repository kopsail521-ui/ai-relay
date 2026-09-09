#!/usr/bin/env bash
# Build a crawlable SPA shell with <meta name="robots" content="noindex">.
# Upstream image embeds web/dist into the Go binary — there is no on-disk
# index.html to sed. We fetch the live shell from new-api (:3000) instead.
set -euo pipefail

ROOT="${ROOT:-/opt/ai-relay}"
OUT_DIR="${ROOT}/static/spa-shell"
OUT_FILE="${OUT_DIR}/index.html"
UPSTREAM="${SPA_UPSTREAM:-http://127.0.0.1:3000/}"

mkdir -p "$OUT_DIR"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

if ! curl -fsS -m 15 "$UPSTREAM" -o "$tmp"; then
  echo "FAIL_SPA_SHELL_FETCH upstream=$UPSTREAM" >&2
  exit 1
fi

# Refuse accidental SEO homepage (must be the SPA shell with #root).
if ! grep -q 'id="root"' "$tmp"; then
  echo "FAIL_SPA_SHELL_NOT_SPA (missing #root) — refuse to publish" >&2
  head -c 200 "$tmp" >&2 || true
  exit 1
fi

# Idempotent inject before </head>
if grep -qi 'name=["'\'']robots["'\'']' "$tmp"; then
  # Normalize to noindex if some other robots meta exists
  python3 - "$tmp" <<'PY'
import re, sys
path = sys.argv[1]
html = open(path, encoding="utf-8", errors="replace").read()
html2, n = re.subn(
    r'<meta\s+name=["\']robots["\']\s+content=["\'][^"\']*["\']\s*/?>',
    '<meta name="robots" content="noindex, nofollow" />',
    html,
    count=1,
    flags=re.I,
)
if n == 0:
    html2 = re.sub(
        r"</head>",
        '  <meta name="robots" content="noindex, nofollow" />\n  </head>',
        html,
        count=1,
        flags=re.I,
    )
open(path, "w", encoding="utf-8").write(html2)
PY
else
  python3 - "$tmp" <<'PY'
import re, sys
path = sys.argv[1]
html = open(path, encoding="utf-8", errors="replace").read()
html2, n = re.subn(
    r"</head>",
    '  <meta name="robots" content="noindex, nofollow" />\n  </head>',
    html,
    count=1,
    flags=re.I,
)
if n != 1:
    raise SystemExit("FAIL_SPA_SHELL_NO_HEAD")
open(path, "w", encoding="utf-8").write(html2)
PY
fi

cp -f "$tmp" "$OUT_FILE"
echo "OK_SPA_SHELL_NOINDEX bytes=$(wc -c < "$OUT_FILE") path=$OUT_FILE"
grep -o 'noindex' "$OUT_FILE" | head -n 1
