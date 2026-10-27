#!/bin/bash
# 拉取最新控制台镜像并保参重建容器（纯 bash，不依赖 python3）。
#
# 背景：scripts/vps-recreate-new-api-container.sh 依赖 python3，这台 VPS 上
# 不可用，导致 GitHub Actions 的自动部署在服务器端失败。本脚本用
# docker inspect 读取现有容器的全部运行参数（网络/端口/环境变量/挂载/
# 重启策略/启动命令），换成新镜像重建，失败自动回滚。
#
#   bash scripts/vps-deploy-console.sh                          # 部署 :main
#   IMAGE=ghcr.io/kopsail521-ui/keyo-new-api:sha-abc123 \
#     bash scripts/vps-deploy-console.sh                        # 部署指定 tag
set -uo pipefail

NAME="${NAME:-ai-relay-new-api}"
IMAGE="${IMAGE:-ghcr.io/kopsail521-ui/keyo-new-api:main}"
OLD="${NAME}-old"

say() { echo "[deploy] $*"; }

sudo docker inspect "$NAME" >/dev/null 2>&1 || { say "ABORT: 容器 $NAME 不存在"; exit 1; }

NET=$(sudo docker inspect "$NAME" --format '{{.HostConfig.NetworkMode}}')
RST=$(sudo docker inspect "$NAME" --format '{{.HostConfig.RestartPolicy.Name}}')
CMD=$(sudo docker inspect "$NAME" --format '{{range .Config.Cmd}}{{printf " %s" .}}{{end}}')

ARGS=()
RUNTIME_ARGS_TEXT=$(sudo docker inspect "$NAME" | python3 /opt/ai-relay/scripts/vps-runtime-args.py)
mapfile -t RUNTIME_ARGS <<< "$RUNTIME_ARGS_TEXT"
ARGS+=("${RUNTIME_ARGS[@]}")
if [ "$NET" = "host" ]; then
  ARGS+=(--network host)
else
  ARGS+=(--network "$NET")
  while IFS=' ' read -r cport hostport; do
    [ -n "${hostport:-}" ] && ARGS+=(-p "${hostport}:${cport%%/*}")
  done < <(sudo docker inspect "$NAME" --format '{{range $p, $c := .HostConfig.PortBindings}}{{range $c}}{{$p}} {{.HostPort}}{{"\n"}}{{end}}{{end}}')
fi

while IFS= read -r e; do
  [ -z "$e" ] && continue
  case "$e" in *=*) ;; *) continue ;; esac
  ARGS+=(-e "$e")
done < <(sudo docker inspect "$NAME" --format '{{range .Config.Env}}{{println .}}{{end}}')

# 稳定登录态：无 SESSION_SECRET 时 new-api 每次启动随机生成新密钥，重建
# 容器即全站登出。密钥落在 gitignore 的 data 目录，一次生成永久复用
# （同 vps-recreate-new-api-container.sh；CRYPTO_SECRET 默认跟随它）。
SECRET_FILE=/opt/ai-relay/data/.newapi-session-secret
if ! printf '%s\n' "${ARGS[@]}" | grep -q '^SESSION_SECRET='; then
  SECRET=$(sudo cat "$SECRET_FILE" 2>/dev/null || true)
  if ! printf '%s' "$SECRET" | grep -Eq '^[A-Za-z0-9_-]{32,}$'; then
    SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    sudo sh -c "umask 077 && printf '%s\\n' '$SECRET' > '$SECRET_FILE'"
    say "SESSION_SECRET generated -> $SECRET_FILE"
  fi
  ARGS+=(-e "SESSION_SECRET=$SECRET")
  say "ENV_ADDED SESSION_SECRET (stable logins across recreates)"
fi
if ! printf '%s\n' "${ARGS[@]}" | grep -q '^TASK_PRICE_PATCH='; then
  ARGS+=(-e "TASK_PRICE_PATCH=gpt-image-2,gpt-image-2-2K,gpt-image-2-4K,gpt-image-2.5,gpt-image-2.5-flare,gpt-image-2.5-flare-vip,gpt-image-2.5-sunburst,gpt-image-2.5-sunburst-vip")
  say "ENV_ADDED TASK_PRICE_PATCH for per-call gpt-image task models"
fi

n_mount=0
while IFS= read -r m; do
  [ -z "$m" ] && continue
  ARGS+=(-v "$m"); n_mount=$((n_mount + 1))
done < <({
  # docker run -v 创建的容器挂载在 Binds（形如 /host:/dest[:rw]）；compose
  # 创建的才在 Mounts。先读 Binds，为空再读 Mounts。
  binds=$(sudo docker inspect "$NAME" --format '{{range .HostConfig.Binds}}{{println .}}{{end}}' 2>/dev/null)
  if [ -n "$binds" ]; then
    printf '%s\n' "$binds"
  else
    sudo docker inspect "$NAME" --format '{{range .HostConfig.Mounts}}{{if eq .Type "volume"}}{{.Name}}:{{.Destination}}{{else}}{{.Source}}:{{.Destination}}{{if not .RW}}:ro{{end}}{{end}}{{println}}{{end}}' 2>/dev/null
  fi
})
if [ "$n_mount" -lt 1 ]; then
  say "ABORT: 未读到任何挂载，拒绝重建"
  sudo docker inspect "$NAME" --format '{{json .HostConfig.Mounts}}' || true
  exit 1
fi
[ -n "$RST" ] && [ "$RST" != "no" ] && ARGS+=(--restart "$RST")

say "NET=$NET RESTART=$RST MOUNTS=$n_mount ENV=$(sudo docker inspect "$NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -c .) CMD=${CMD:-（无）}"

say "拉取镜像 $IMAGE"
sudo docker pull "$IMAGE" || { say "ABORT: 拉取失败"; exit 1; }

rollback() {
  say "回滚：恢复旧容器"
  sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
  sudo docker rename "$OLD" "$NAME" >/dev/null 2>&1 || true
  sudo docker start "$NAME" >/dev/null 2>&1 || true
  sudo docker update --restart="${RST:-always}" "$NAME" >/dev/null 2>&1 || true
  exit 1
}

sudo docker update --restart=no "$NAME" >/dev/null 2>&1 || true
sudo docker stop "$NAME" >/dev/null
sudo docker rm -f "$OLD" >/dev/null 2>&1 || true
sudo docker rename "$NAME" "$OLD"

# shellcheck disable=SC2086
sudo docker run -d --name "$NAME" "${ARGS[@]}" "$IMAGE" $CMD >/dev/null || rollback
sleep 4
if ! curl -sSf -m 15 http://127.0.0.1:3000/api/status -o /dev/null; then
  say "健康检查失败，容器日志："
  sudo docker logs --tail 20 "$NAME" 2>&1 || true
  rollback
fi

sudo docker rm -f "$OLD" >/dev/null
say "DONE_DEPLOY $IMAGE"
curl -sS -m 15 http://127.0.0.1:3000/api/status | head -c 120; echo
