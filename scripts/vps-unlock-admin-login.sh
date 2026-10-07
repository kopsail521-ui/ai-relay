#!/bin/bash
# 会话上限应急解锁（仅在网页登录被 AUTH_SESSION_LIMIT 挡住时使用）。
#
# 背景：new-api 默认每账号最多 50 个活跃登录会话（USER_SESSION_ACTIVE_LIMIT，
# 会话 TTL 30 天）。部署/配置脚本每次都调用 /api/user/login，
# 每次新建一个会话，累计 50 次后登录直接 409 AUTH_SESSION_LIMIT。
#
# 优先方案（不用重启服务）：由运维侧用已有会话调
#   POST /api/user/sessions/revoke-others
# 清掉旧会话。本脚本是网页完全进不去时的兜底。
#
# VPS 现状：无 python3 / sqlite3；Workbench 多行粘贴易断连。
# 因此本脚本只用 docker + curl，且所有参数从现有容器 inspect 读取（不硬编码），
# 挂载同时兼容 bind mount 与命名卷。
#
#   bash scripts/vps-unlock-admin-login.sh status    # 只看状态，不改任何东西
#   bash scripts/vps-unlock-admin-login.sh raise     # 临时抬高上限并重建容器
#   bash scripts/vps-unlock-admin-login.sh restore   # 回滚到原容器
set -uo pipefail

MODE="${1:-status}"
LIMIT_VALUE="${LIMIT_VALUE:-200}"
NAME="${NAME:-ai-relay-new-api}"
OLD="${NAME}-old"
BAKED="${BAKED:-keyo-baked}"

say() { echo "[unlock] $*"; }

container_env() { sudo docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null; }
container_mounts() { sudo docker inspect "$1" --format '{{range .HostConfig.Mounts}}{{if eq .Type "volume"}}{{.Name}}:{{.Destination}}{{else}}{{.Source}}:{{.Destination}}{{if not .RW}}:ro{{end}}{{end}}{{println}}{{end}}' 2>/dev/null; }

show_limit() {
  local env
  env=$(container_env "$1")
  if printf '%s\n' "$env" | grep -q '^USER_SESSION_ACTIVE_LIMIT='; then
    printf '%s\n' "$env" | grep '^USER_SESSION_ACTIVE_LIMIT='
  else
    echo "USER_SESSION_ACTIVE_LIMIT=(未设置，走默认 50)"
  fi
}

probe_login() {
  curl -sS -m 15 -w '  http=%{http_code}\n' \
    -X POST http://127.0.0.1:3000/api/user/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"rsfqq521","password":"rsfqq521"}' 2>&1 | head -c 240
}

case "$MODE" in
  status)
    say "运行中的容器："
    sudo docker ps --filter "name=$NAME" --filter "name=$OLD" \
      --format '  {{.Names}}  {{.Image}}  {{.Status}}'
    say "会话上限："
    show_limit "$NAME" | sed 's/^/  /'
    say "挂载："
    container_mounts "$NAME" | sed 's/^/  /'
    say "网络模式：$(sudo docker inspect "$NAME" --format '{{.HostConfig.NetworkMode}}' 2>/dev/null)"
    say "登录接口："
    probe_login
    ;;

  raise)
    sudo docker inspect "$NAME" >/dev/null 2>&1 || { say "ABORT: 找不到容器 $NAME"; exit 1; }
    if sudo docker inspect "$OLD" >/dev/null 2>&1; then
      say "ABORT: $OLD 已存在（上次 raise 未收尾）。先跑：bash $0 restore"
      exit 1
    fi

    # 从现有容器读取参数：镜像 / 网络 / 重启策略 / 环境变量 / 挂载 / 启动命令
    IMG=$(sudo docker inspect "$NAME" --format '{{.Config.Image}}')
    NET=$(sudo docker inspect "$NAME" --format '{{.HostConfig.NetworkMode}}')
    RST=$(sudo docker inspect "$NAME" --format '{{.HostConfig.RestartPolicy.Name}}')
    CMD=$(sudo docker inspect "$NAME" --format '{{range .Config.Cmd}}{{printf " %s" .}}{{end}}')

    ARGS=()
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
      case "$e" in USER_SESSION_ACTIVE_LIMIT=*) continue ;; esac
      ARGS+=(-e "$e")
    done < <(container_env "$NAME")

    n_mount=0
    while IFS= read -r m; do
      [ -z "$m" ] && continue
      ARGS+=(-v "$m"); n_mount=$((n_mount + 1))
    done < <(container_mounts "$NAME")
    if [ "$n_mount" -lt 1 ]; then
      say "ABORT: 未读到任何挂载，拒绝重建（避免新容器挂到空卷上）"
      sudo docker inspect "$NAME" --format '{{json .HostConfig.Mounts}}' || true
      exit 1
    fi

    [ -n "$RST" ] && [ "$RST" != "no" ] && ARGS+=(--restart "$RST")
    ARGS+=(-e "USER_SESSION_ACTIVE_LIMIT=$LIMIT_VALUE")

    say "IMG=$IMG NET=$NET RESTART=$RST MOUNTS=$n_mount ENV=$(container_env "$NAME" | grep -c .)"
    say "即将执行：docker run -d --name $NAME ${ARGS[*]} $IMG$CMD"

    sudo docker tag "$NAME" "$BAKED" || exit 1
    sudo docker rename "$NAME" "$OLD" || exit 1

    rollback() {
      say "回滚到原容器 $OLD"
      sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
      sudo docker rename "$OLD" "$NAME" >/dev/null 2>&1 || true
      sudo docker start "$NAME" >/dev/null 2>&1 || true
      exit 1
    }

    # shellcheck disable=SC2086
    sudo docker run -d --name "$NAME" "${ARGS[@]}" "$IMG" $CMD >/dev/null || { say "启动失败"; rollback; }
    sleep 4
    curl -sSf -m 15 http://127.0.0.1:3000/api/status -o /dev/null || {
      say "健康检查失败，容器日志："
      sudo docker logs --tail 20 "$NAME" 2>&1 || true
      rollback
    }
    say "OK_RAISE  上限已临时设为 $LIMIT_VALUE"
    probe_login
    echo
    say "登录 http=200 即可用浏览器进入；进去后立刻清理会话，再跑：bash $0 restore"
    ;;

  restore)
    if sudo docker inspect "$OLD" >/dev/null 2>&1; then
      say "移除临时容器，恢复 $OLD -> $NAME"
      sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
      sudo docker rename "$OLD" "$NAME" || exit 1
      sudo docker start "$NAME" >/dev/null 2>&1 || true
      sudo docker update --restart=always "$NAME" >/dev/null 2>&1 || true
      sleep 3
      curl -sSf -m 15 http://127.0.0.1:3000/api/status -o /dev/null \
        && say "健康检查通过" || say "WARN: /api/status 未通过，检查 docker logs $NAME"
      show_limit "$NAME" | sed 's/^/  /'
      say "DONE_RESTORE"
    else
      say "没有 $OLD，无需回滚。当前："
      sudo docker ps --filter "name=$NAME" --format '  {{.Names}}  {{.Image}}  {{.Status}}'
    fi
    ;;

  *)
    echo "用法: bash $0 {status|raise|restore}"
    exit 2
    ;;
esac
