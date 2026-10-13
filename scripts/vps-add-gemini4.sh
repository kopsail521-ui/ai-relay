#!/usr/bin/env bash
# One-command onboarding for gemini-4-argon / gemini-4-barium (chat, sold at 5x cost).
#   curl -fsSL https://raw.githubusercontent.com/kopsail521-ui/ai-relay/main/scripts/vps-add-gemini4.sh | sudo bash
set -euo pipefail
ROOT=/opt/ai-relay
RAW=https://raw.githubusercontent.com/kopsail521-ui/ai-relay/main
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
docker inspect ai-relay-new-api >/dev/null
docker inspect ai-relay-creem-moderation >/dev/null

fetch() {
  mkdir -p "$WORK/$(dirname "$1")"
  curl --retry 3 --connect-timeout 20 --max-time 60 -fsSL "$RAW/$1" -o "$WORK/$1"
}
for f in scripts/vps-add-gemini4.py scripts/vps-check-gemini4.py \
  config/marketplace-model-copy.json services/creem-moderation-proxy/marketplace-model-copy.json \
  static/seo/model/gemini-4-argon.html static/seo/model/gemini-4-barium.html \
  static/seo/models.html static/seo/pricing.html static/seo/gemini-api-pricing.html \
  static/seo/index.html static/seo/compare.html static/seo/sitemap.xml; do
  fetch "$f"
done

cmp -s "$WORK/config/marketplace-model-copy.json" \
       "$WORK/services/creem-moderation-proxy/marketplace-model-copy.json" \
  || { printf 'marketplace 文案副本不一致，终止部署\n' >&2; exit 1; }

DB=""
for candidate in "$ROOT/data/new-api/one-api.db" /data/one-api.db; do
  if [[ -f "$candidate" ]]; then DB="$candidate"; break; fi
done
[[ -n "$DB" ]] || { printf '找不到 one-api.db\n' >&2; exit 1; }
DB_DIR=$(dirname "$DB")

# 1) 数据库：渠道模型 + 定价 + 元数据 + abilities
docker run --rm -v "$DB_DIR:/data:rw" -v "$WORK:/work:ro" python:3.12-alpine python /work/scripts/vps-add-gemini4.py /data/one-api.db
docker restart ai-relay-new-api >/dev/null
sleep 4

# 2) marketplace 文案（config 与 services 逐字节一致）
install -m 644 "$WORK/config/marketplace-model-copy.json" "$ROOT/config/marketplace-model-copy.json"
install -m 644 "$WORK/services/creem-moderation-proxy/marketplace-model-copy.json" \
  "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json"
docker cp "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json" \
  ai-relay-creem-moderation:/app/marketplace-model-copy.json
docker restart ai-relay-creem-moderation >/dev/null

# 3) SEO 静态页
for f in model/gemini-4-argon.html model/gemini-4-barium.html models.html pricing.html \
  gemini-api-pricing.html index.html compare.html sitemap.xml; do
  install -m 644 "$WORK/static/seo/$f" "$ROOT/static/seo/$f"
done

# 4) 公开定价校验
for attempt in $(seq 1 15); do
  if curl --connect-timeout 10 --max-time 20 -fsS https://www.keyoapi.xyz/api/pricing -o "$WORK/pricing.json"; then
    if docker run --rm -v "$WORK:/check:ro" python:3.12-alpine python /check/scripts/vps-check-gemini4.py /check/pricing.json; then
      printf 'DONE_ADD_GEMINI4\n'
      exit 0
    fi
  fi
  sleep 2
done
printf '上架写入完成，但公开 pricing 检查未通过。\n' >&2
exit 1
