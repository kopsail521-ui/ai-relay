#!/bin/bash
# 解锁管理员登录：绕过 USER_SESSION_ACTIVE_LIMIT，让 rsfqq521 能再登录一次。
#
# 背景：new-api 默认每个账号最多 50 个活跃登录会话（USER_SESSION_ACTIVE_LIMIT，
# 会话 TTL 30 天）。反复用密码登录（含部署/配置脚本）会不断新建会话，
# 第 51 次起登录直接 409 AUTH_SESSION_LIMIT。
#
# 只用 docker + curl + coreutils（VPS 上没有 python3 / sqlite3）。
# 做法：从现有容器 inspect 出 image / network / restart / env / mounts
# （兼容命名卷与 bind mount）-> 临时加 USER_SESSION_ACTIVE_LIMIT=200
# 重建容器 -> 健康检查通过才原子替换。清会话由运维侧调用
# POST /api/user/sessions/revoke-others 完成，随后用 restore 还原默认上限。
#
#   bash vps-unlock-admin-login.sh raise     # 抬高上限 + 验证登录
#   bash vps-unlock-admin-login.sh restore   # 会话清完后还原默认上限 50
set -uo pipefail

MODE="${1:-raise}"
LIMIT_VALUE="${LIMIT_VALUE:-200}"
NAME=ai-relay-new-api
NEXT="${NAME}-next"
NEWENV="USER_SESSION_ACTIVE_LIMIT=${LIMIT_VALUE}"

IMG=$(sudo docker inspect "$NAME" --format '{{.Config.Image}}' 2>/dev/null)
NET=$(sudo docker inspect "$NAME" --format '{{.HostConfig.NetworkMode}}')
RST=$(sudo docker inspect "$NAME" --format '{{.HostConfig.RestartPolicy.Name}}')
if [ -z "$IMG" ]; then echo "ABORT: 取不到镜像名"; exit 1; fi
echo "MODE=$MODE IMG=$IMG NET=$NET RESTART=$RST"

# 环境变量：原样搬运，丢弃旧的 USER_SESSION_ACTIVE_LIMIT
ENV_ARGS=""; ENV_N=0
while IFS= read -r e; do
  [ -z "$e" ] && continue
  case "$e" in *=*) ;; *) continue ;; esac
  case "$e" in USER_SESSION_ACTIVE_LIMIT=*) continue ;; esac
  ENV_ARGS="$ENV_ARGS -e $(printf %q "$e")"; ENV_N=$((ENV_N+1))
done < <(sudo docker inspect "$NAME" --format '{{range .Config.Env}}{{println .}}{{end}}')
echo "ENV_COUNT=$ENV_N"

# 挂载：命名卷 -> -v name:/dest；bind -> -v /host:/dest[:ro]
MOUNT_ARGS=""; MOUNT_N=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  MOUNT_ARGS="$MOUNT_ARGS $line"; MOUNT_N=$((MOUNT_N+1))
done < <(sudo docker inspect "$NAME" --format '{{range .HostConfig.Mounts}}{{if eq .Type "volume"}}-v {{.Name}}:{{.Destination}}{{else}}-v {{.Source}}:{{.Destination}}{{if not .RW}}:ro{{end}}{{end}}{{println}}{{end}}')
if [ "$MOUNT_N" -lt 1 ]; then
  echo "ABORT: 没取到任何挂载，拒绝继续"
  sudo docker inspect "$NAME" --format '{{json .HostConfig.Mounts}}' 2>/dev/null || true
  exit 1
fi
echo "MOUNT_COUNT=$MOUNT_N"

NET_ARGS=""
if [ "$NET" = "host" ]; then
  NET_ARGS="--network host"
else
  while IFS=' ' read -r c h; do
    [ -n "${h:-}" ] && NET_ARGS="$NET_ARGS -p ${h}:$(printf '%s' "$c" | cut -d/ -f1)"
  done < <(sudo docker inspect "$NAME" --format '{{range $p, $c := .HostConfig.PortBindings}}{{range $c}}{{$p}} {{.HostPort}}{{"\n"}}{{end}}{{end}}')
fi

CMD_ARGS=$(sudo docker inspect "$NAME" --format '{{range .Config.Cmd}}{{printf " %s" .}}{{end}}')
RUN_ARGS="$NET_ARGS $ENV_ARGS$MOUNT_ARGS"
[ -n "$RST" ] && [ "$RST" != "no" ] && RUN_ARGS="$RUN_ARGS --restart $RST"
[ "$MODE" = "raise" ] && RUN_ARGS="$RUN_ARGS -e $(printf %q "$NEWENV")"
RUN_CMD="sudo docker run -d --name $NEXT $RUN_ARGS $IMG$CMD_ARGS"
echo "RUN: $RUN_CMD"

restore_old() {
  echo "回滚：恢复旧容器"
  sudo docker rm -f "$NEXT" >/dev/null 2>&1 || true
  sudo docker start "$NAME" >/dev/null
  sudo docker update --restart="${RST:-always}" "$NAME" >/dev/null 2>&1 || true
  exit 1
}

sudo docker update --restart=no "$NAME" >/dev/null 2>&1 || true
sudo docker stop "$NAME" >/dev/null
sudo docker rm -f "$NEXT" >/dev/null 2>&1 || true

eval "$RUN_CMD" >/dev/null || { echo "ABORT: 新容器启动失败"; restore_old; }

sleep 3
if ! curl -sSf http://127.0.0.1:3000/api/status -o /dev/null; then
  echo "ABORT: 健康检查失败 (/api/status)"
  sudo docker logs --tail 20 "$NEXT" 2>&1 || true
  restore_old
fi

sudo docker rm -f "$NAME" >/dev/null
sudo docker rename "$NEXT" "$NAME"
echo "OK_RECREATED"

echo "--- 验证登录 ---"
curl -sS -o /tmp/keyo_login.json -w "login_http=%{http_code}\n" \
  -X POST http://127.0.0.1:3000/api/user/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"rsfqq521","password":"rsfqq521"}' || true
head -c 300 /tmp/keyo_login.json; echo

echo "DONE_UNLOCK_MODE=$MODE"
if [ "$MODE" = "raise" ]; then
  echo "login_http=200 且 success:true 即已放行；运维侧随后清会话，最后用 restore 还原上限。"
else
  echo "上限已还原为默认 50。"
fi
