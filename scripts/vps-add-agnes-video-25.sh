#!/usr/bin/env bash
# One-command onboarding for agnes-video-2.5 (video, sold at 1.5x upstream per-second cost).
#   curl -fsSL https://raw.githubusercontent.com/kopsail521-ui/ai-relay/main/scripts/vps-add-agnes-video-25.sh | sudo bash
set -euo pipefail
ROOT=/opt/ai-relay
RAW=https://raw.githubusercontent.com/kopsail521-ui/ai-relay/main
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"

fetch() {
  mkdir -p "$WORK/$(dirname "$1")"
  curl --retry 3 --connect-timeout 20 --max-time 60 -fsSL "$RAW/$1" -o "$WORK/$1"
}
for f in services/apimart-passthrough/server.mjs \
  services/apimart-passthrough/video-contracts.mjs \
  services/apimart-passthrough/task-responses.mjs \
  services/apimart-passthrough/image-contracts.mjs \
  services/apimart-passthrough/image-ledger.mjs \
  services/apimart-passthrough/image-service.mjs \
  services/apimart-passthrough/catalog.json \
  services/apimart-passthrough/Dockerfile \
  services/creem-moderation-proxy/billing-unit-inject.js \
  config/apimart-selected-models.json \
  config/marketplace-model-copy.json \
  services/creem-moderation-proxy/marketplace-model-copy.json \
  static/brand/video-capabilities.json \
  scripts/vps-add-apimart-videos.py; do
  fetch "$f"
done

cmp -s "$WORK/config/marketplace-model-copy.json" \
       "$WORK/services/creem-moderation-proxy/marketplace-model-copy.json" \
  || { printf 'marketplace 文案副本不一致，终止部署\n' >&2; exit 1; }

# catalog 必须包含新模型（防止 GitHub raw 缓存旧文件）
docker run --rm -v "$WORK:/work:ro" python:3.12-alpine python -c '
import json, sys
cat = json.load(open("/work/services/apimart-passthrough/catalog.json"))
m = next((x for x in cat["models"] if x["id"] == "agnes-video-2.5"), None)
assert m, "catalog missing agnes-video-2.5"
assert m["markup"] == 1.5
assert m["estimate"]["cost_cny_per_second"]["720p"] == 0.10
copy = json.load(open("/work/config/marketplace-model-copy.json"))
assert "agnes-video-2.5" in copy
cap = json.load(open("/work/static/brand/video-capabilities.json"))
assert "agnes-video-2.5" in cap["models"]
print("PRECHECK_OK")
'

# 1) 部署直通服务源码并重建 3011（COPY 构建，仅 restart 不生效）
for f in server.mjs video-contracts.mjs task-responses.mjs image-contracts.mjs image-ledger.mjs image-service.mjs catalog.json Dockerfile; do
  install -m 644 "$WORK/services/apimart-passthrough/$f" "$ROOT/services/apimart-passthrough/$f"
done
node_check=$(docker run --rm -v "$ROOT/services/apimart-passthrough:/app:ro" node:22-alpine node --check /app/server.mjs && echo OK || true)
[[ "$node_check" == *OK* ]] || { printf 'server.mjs 语法检查失败\n' >&2; exit 1; }

# inventory key（grsai）已在 .env.apimart；确保存在
touch "$ROOT/.env.apimart"
if ! grep -q '^GRSAI_API_KEY=.' "$ROOT/.env.apimart" 2>/dev/null; then
  grep -E '^GRSAI_(API_KEY|BASE_URL)=' "$ROOT/.env" 2>/dev/null >> "$ROOT/.env.apimart" || true
fi
if ! grep -q '^GRSAI_BASE_URL=' "$ROOT/.env.apimart" 2>/dev/null; then
  printf 'GRSAI_BASE_URL=https://grsaiapi.com\n' >> "$ROOT/.env.apimart"
fi

docker build -q -t keyo-apimart-passthrough "$ROOT/services/apimart-passthrough" >/dev/null
docker rm -f ai-relay-apimart-passthrough >/dev/null 2>&1 || true
docker run -d --name ai-relay-apimart-passthrough --restart always --network host \
  --env-file "$ROOT/.env.apimart" \
  -v "$ROOT/data:/data:rw" \
  -e NEW_API_DB=/data/new-api/one-api.db \
  -e NEW_API_BASE=http://127.0.0.1:3000 \
  -e CATALOG=/app/catalog.json \
  -e LISTEN_HOST=127.0.0.1 \
  -e PORT=3011 \
  keyo-apimart-passthrough >/dev/null
sleep 3
curl -fsS http://127.0.0.1:3011/healthz >/dev/null || { printf '直通服务健康检查失败\n' >&2; exit 1; }
echo PASSTHROUGH_REBUILT

# 2) new-api 目录登记（幂等；admin API 已激活时仅核对）
install -m 644 "$WORK/scripts/vps-add-apimart-videos.py" "$ROOT/scripts/vps-add-apimart-videos.py"
install -m 644 "$WORK/config/apimart-selected-models.json" "$ROOT/config/apimart-selected-models.json"
DB=""
for candidate in "$ROOT/data/new-api/one-api.db" /data/one-api.db; do
  if [[ -f "$candidate" ]]; then DB="$candidate"; break; fi
done
[[ -n "$DB" ]] || { printf '找不到 one-api.db\n' >&2; exit 1; }
docker run --rm -v "$(dirname "$DB"):/data:rw" -v "$ROOT:/root:rw" -w /root \
  python:3.12-alpine python /root/scripts/vps-add-apimart-videos.py /data/one-api.db
docker restart ai-relay-new-api >/dev/null
sleep 4

# 3) marketplace 文案 + 计费注入脚本 + 能力页
install -m 644 "$WORK/config/marketplace-model-copy.json" "$ROOT/config/marketplace-model-copy.json"
install -m 644 "$WORK/services/creem-moderation-proxy/marketplace-model-copy.json" \
  "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json"
# v16 注入：display_names 别名匹配（agnes 详情弹窗只有显示名时也能渲染分组价格表）
grep -q '__keyoBillV16' "$WORK/services/creem-moderation-proxy/billing-unit-inject.js" \
  || { printf 'billing-unit-inject.js 缺少 v16 别名匹配\n' >&2; exit 1; }
install -m 644 "$WORK/services/creem-moderation-proxy/billing-unit-inject.js" \
  "$ROOT/services/creem-moderation-proxy/billing-unit-inject.js"
docker cp "$ROOT/services/creem-moderation-proxy/billing-unit-inject.js" \
  ai-relay-creem-moderation:/app/billing-unit-inject.js
docker cp "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json" \
  ai-relay-creem-moderation:/app/marketplace-model-copy.json
docker restart ai-relay-creem-moderation >/dev/null
install -m 644 "$WORK/static/brand/video-capabilities.json" "$ROOT/static/brand/video-capabilities.json"

# 4) 公开定价校验
for attempt in $(seq 1 15); do
  if curl --connect-timeout 10 --max-time 20 -fsS https://www.keyoapi.xyz/api/pricing -o "$WORK/pricing.json"; then
    if docker run --rm -v "$WORK:/check:ro" python:3.12-alpine python -c '
import json, sys
d = json.load(open("/check/pricing.json"))
m = next((x for x in d["data"] if x["model_name"] == "agnes-video-2.5"), None)
assert m, "agnes-video-2.5 missing in public pricing"
assert abs(m["model_price"] - 0.020548) < 1e-9, m["model_price"]
assert m.get("quota_type") == 1
assert "default" in (m.get("enable_groups") or [])
blob = json.dumps(m, ensure_ascii=False).lower()
for banned in ("grsai", "apimart", "openlux", "aicopy"):
    assert banned not in blob, "upstream trace: " + banned
print("CHECK_AGNES_OK")
'; then
      printf 'DONE_ADD_AGNES_VIDEO_25\n'
      exit 0
    fi
  fi
  sleep 2
done
printf '上架写入完成，但公开 pricing 检查未通过。\n' >&2
exit 1
