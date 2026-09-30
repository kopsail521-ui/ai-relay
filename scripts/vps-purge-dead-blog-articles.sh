#!/usr/bin/env bash
# Purge known-dead GEOFlow article dirs (GSC residual 404s) and refresh blog listing.
set -euo pipefail
ROOT="${ROOT:-/opt/ai-relay}"
ART="$ROOT/static/brand/blog/article"
DEAD=(g645lb91 036gln6r zxeywzwx 3nipcm2l 40gq1m6q)
mkdir -p "$ART"
for id in "${DEAD[@]}"; do
  if [[ -e "$ART/$id" ]]; then
    sudo rm -rf "$ART/$id"
    echo "removed $id"
  else
    echo "absent $id"
  fi
done
# Rewrite sitemap to living guides only (never list /article/ orphans).
sudo tee "$ROOT/static/brand/blog/sitemap.txt" >/dev/null <<'EOF'
https://www.keyoapi.xyz/brand/blog/
https://www.keyoapi.xyz/brand/blog/openai-compatible-api-python.html
https://www.keyoapi.xyz/brand/blog/openai-compatible-api-nodejs.html
https://www.keyoapi.xyz/brand/blog/openai-compatible-api-cursor.html
EOF
echo "--- remaining article dirs ---"
ls -la "$ART" || true
for id in "${DEAD[@]}"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "https://www.keyoapi.xyz/brand/blog/article/${id}/" || echo err)
  echo "curl $id -> $code"
done
echo DONE_PURGE_DEAD_BLOG_ARTICLES
