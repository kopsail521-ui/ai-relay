#!/usr/bin/env bash
set -euo pipefail
ROOT=/opt/ai-relay
RAW=https://raw.githubusercontent.com/kopsail521-ui/ai-relay/main
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$ROOT/scripts" "$ROOT/config" "$ROOT/services/creem-moderation-proxy" "$ROOT/static/seo/model"
chmod 700 "$WORK"
curl --retry 3 --connect-timeout 20 -fsSL https://api.github.com/repos/kopsail521-ui/ai-relay/commits/main -o "$WORK/revision.json"
REV=$(docker run --rm -v "$WORK:/check:ro" python:3.12-alpine python -c 'import json; print(json.load(open("/check/revision.json"))["sha"])')
[[ "$REV" =~ ^[0-9a-f]{40}$ ]] || { printf '无法确认部署版本\n' >&2; exit 1; }
RAW="https://raw.githubusercontent.com/kopsail521-ui/ai-relay/$REV"
curl --retry 3 --connect-timeout 20 -fsSL "https://api.github.com/repos/kopsail521-ui/ai-relay/commits?sha=$REV&path=new-api&per_page=1" -o "$WORK/console-revision.json"
CONSOLE_REV=$(docker run --rm -v "$WORK:/check:ro" python:3.12-alpine python -c 'import json; print(json.load(open("/check/console-revision.json"))[0]["sha"])')
[[ "$CONSOLE_REV" =~ ^[0-9a-f]{40}$ ]] || { printf '无法确认控制台版本\n' >&2; exit 1; }
IMAGE="ghcr.io/kopsail521-ui/keyo-new-api:sha-${CONSOLE_REV:0:7}"
docker pull "$IMAGE" || { printf '此版本控制台镜像尚未就绪，请等待 GitHub 构建完成后重试。\n' >&2; exit 1; }

fetch() {
  curl --retry 3 --connect-timeout 20 -fsSL "$RAW/$1" -o "$WORK/download"
  install -m 644 "$WORK/download" "$ROOT/$1"
}
for file in scripts/vps-add-openrouter-eleven.py scripts/vps-check-openrouter-eleven.py scripts/vps-deploy-console.sh; do
  fetch "$file"
done
for file in config/marketplace-model-copy.json services/creem-moderation-proxy/marketplace-model-copy.json; do
  if [[ ! -f "$ROOT/$file" ]]; then fetch "$file"; fi
done

if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  KEY_ARGS=(-e OPENROUTER_API_KEY)
elif [[ -f "$ROOT/.env" ]] && grep -qE '^OPENROUTER_API_KEY=.+$' "$ROOT/.env"; then
  KEY_ARGS=()
else
  printf '请输入接入密钥（输入隐藏）：' >/dev/tty
  IFS= read -rs OPENROUTER_API_KEY </dev/tty
  printf '\n' >/dev/tty
  [[ "$OPENROUTER_API_KEY" == sk-* ]] || { printf '密钥格式错误\n' >&2; exit 1; }
  export OPENROUTER_API_KEY
  KEY_ARGS=(-e OPENROUTER_API_KEY)
fi

DB=""
for candidate in "$ROOT/data/new-api/one-api.db" /data/one-api.db; do
  if [[ -f "$candidate" ]]; then DB="$candidate"; break; fi
done
[[ -n "$DB" ]] || { printf '找不到 one-api.db\n' >&2; exit 1; }
DB_DIR=$(dirname "$DB")
docker inspect ai-relay-new-api >/dev/null
docker inspect ai-relay-creem-moderation >/dev/null
COUNT_TOKEN=$(docker exec ai-relay-new-api printenv CountToken || true)
case "$COUNT_TOKEN" in
  false|False|FALSE|0|f|F) printf 'CountToken 已关闭，请先启用字符计数。\n' >&2; exit 1 ;;
esac

docker run --rm "${KEY_ARGS[@]}" \
  -v "$ROOT:$ROOT:rw" -v "$DB_DIR:/data:rw" -w "$ROOT" \
  python:3.12-alpine python scripts/vps-add-openrouter-eleven.py /data/one-api.db "$ROOT"
unset OPENROUTER_API_KEY

IMAGE="$IMAGE" bash "$ROOT/scripts/vps-deploy-console.sh"
# Patch the installed proxy so unrelated VPS changes are preserved.
PROXY="$ROOT/services/creem-moderation-proxy/server.mjs"
if [[ ! -f "$PROXY" ]]; then
  docker cp ai-relay-creem-moderation:/app/server.mjs "$PROXY"
fi
cp -p "$PROXY" "$PROXY.eleven-$(date +%s).bak"
docker run --rm -v "$ROOT:$ROOT:rw" python:3.12-alpine python -c '
from pathlib import Path
p = Path("/opt/ai-relay/services/creem-moderation-proxy/server.mjs")
s = p.read_text(encoding="utf-8")
needle = "UnoRouter|unorouter|Gitee"
replacement = "UnoRouter|unorouter|OpenRouter|openrouter|Gitee"
lines = s.splitlines(keepends=True)
matches = [i for i, line in enumerate(lines) if needle in line or replacement in line]
if len(matches) != 2:
    raise SystemExit("Proxy scrub patterns differ; refusing an unverified patch")
for i in matches:
    if "OpenRouter|openrouter" not in lines[i]:
        lines[i] = lines[i].replace(needle, replacement)
p.write_text("".join(lines), encoding="utf-8")
'
docker cp "$PROXY" ai-relay-creem-moderation:/app/server.eleven-check.mjs
docker exec ai-relay-creem-moderation node --check /app/server.eleven-check.mjs
docker cp "$PROXY" ai-relay-creem-moderation:/app/server.mjs
INJECT="$ROOT/services/creem-moderation-proxy/billing-unit-inject.js"
if [[ ! -f "$INJECT" ]]; then
  docker cp ai-relay-creem-moderation:/app/billing-unit-inject.js "$INJECT"
fi
docker cp "$INJECT" ai-relay-creem-moderation:/app/billing-unit-inject.js
docker cp "$ROOT/services/creem-moderation-proxy/marketplace-model-copy.json" ai-relay-creem-moderation:/app/marketplace-model-copy.json
docker restart ai-relay-creem-moderation >/dev/null

for file in static/seo/model/keyo-eleven-v4.html static/seo/model/keyo-eleven-v4-turbo.html \
  static/seo/models.html static/seo/pricing.html static/seo/tts-api.html static/seo/index.html \
  static/seo/sitemap.xml; do
  [[ ! -f "$ROOT/$file" ]] || cp -p "$ROOT/$file" "$ROOT/$file.eleven-$(date +%s).bak"
  fetch "$file"
done

for attempt in $(seq 1 15); do
  if curl --connect-timeout 10 --max-time 20 -fsS https://www.keyoapi.xyz/api/pricing -o "$WORK/pricing.json"; then
    if docker run --rm -v "$ROOT:$ROOT:ro" -v "$WORK:/check:ro" \
      python:3.12-alpine python "$ROOT/scripts/vps-check-openrouter-eleven.py" /check/pricing.json; then
      printf 'DONE_ADD_OPENROUTER_ELEVEN\n'
      exit 0
    fi
  fi
  sleep 2
done
printf '上架写入完成，但公开 pricing 检查未通过。\n' >&2
exit 1
