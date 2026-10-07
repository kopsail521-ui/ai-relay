#!/bin/bash
# 解锁管理员登录：绕过 USER_SESSION_ACTIVE_LIMIT，让 rsfqq521 能再登录一次。
#
# 背景：new-api 默认每账号最多 50 个活跃登录会话（USER_SESSION_ACTIVE_LIMIT，
# 会话 TTL 30 天）。反复用密码登录（含部署/配置脚本）会不断新建会话，
# 第 51 次起登录直接 409 AUTH_SESSION_LIMIT，网页登录进不去。
#
# 本机实测：VPS 上没有 python3 / sqlite3，且 Workbench 粘贴多行易断连。
# 因此采用「固化现有容器 -> 换名 -> 带新环境变量重启」的最小操作：
#   raise   : 用 keyo-baked 镜像起新容器，唯一改动 USER_SESSION_ACTIVE_LIMIT=200
#   restore : 回滚到 keyo-old（原容器），上限恢复默认 50
#   status  : 只查看当前容器状态与登录接口返回
#
# 用法（在 /opt/ai-relay 下）：
#   bash scripts/vps-unlock-admin-login.sh raise
#   bash scripts/vps-unlock-admin-login.sh status
#   bash scripts/vps-unlock-admin-login.sh restore
set -uo pipefail

MODE="${1:-status}"
LIMIT_VALUE="${LIMIT_VALUE:-200}"
NAME=ai-relay-new-api
OLD="${NAME}-old"
BAKED=keyo-baked
VOLUMES=(-v keyo-new-api_data:/data -v keyo-new-api_app_logs:/app/logs)

say() { echo "[unlock] $*"; }

probe_login() {
  curl -sS -m 15 -w ' http=%{http_code}\n' \
    -X POST http://127.0.0.1:3000/api/user/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"rsfqq521","password":"rsfqq521"}' 2>&1 | head -c 300
}

case "$MODE" in
  status)
    say "容器："
    sudo docker ps --filter "name=$NAME" --format '  {{.Names}}  {{.Image}}  {{.Status}}'
    sudo docker ps --filter "name=$OLD" --format '  {{.Names}}  {{.Image}}  {{.Status}}'
    say "本地镜像："
    sudo docker images --format '  {{.Repository}}  {{.ID}}' | grep -E "$BAKED|keyo-new-api" || true
    say "会话上限环境变量："
    sudo docker inspect "$NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
      | grep USER_SESSION_ACTIVE_LIMIT || echo "  (未设置，走默认 50)"
    say "登录接口："
    probe_login
    ;;

  raise)
    if ! sudo docker inspect "$NAME" >/dev/null 2>&1; then
      say "ABORT: 找不到容器 $NAME。先跑 status 看看当前状态。"
      exit 1
    fi
    if sudo docker inspect "$OLD" >/dev/null 2>&1; then
      say "检测到 $OLD 已存在（可能上次 raise 中断）。"
      say "先回滚再继续：bash $0 restore"
      exit 1
    fi
    say "1/4 固化当前容器为镜像 $BAKED（含全部现有环境变量与命令）"
    sudo docker tag "$NAME" "$BAKED" || exit 1
    say "2/4 原容器改名为 $OLD（不删除，便于回滚）"
    sudo docker rename "$NAME" "$OLD" || exit 1
    say "3/4 起新容器（唯一改动：USER_SESSION_ACTIVE_LIMIT=$LIMIT_VALUE）"
    if ! sudo docker run -d --name "$NAME" --network host --restart always \
        -e "USER_SESSION_ACTIVE_LIMIT=$LIMIT_VALUE" "${VOLUMES[@]}" "$BAKED"; then
      say "启动失败，自动回滚"
      sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
      sudo docker rename "$OLD" "$NAME"
      sudo docker start "$NAME" >/dev/null 2>&1 || true
      exit 1
    fi
    say "4/4 健康检查 + 登录验证"
    sleep 4
    if ! curl -sSf -m 15 http://127.0.0.1:3000/api/status -o /dev/null; then
      say "健康检查失败，自动回滚"
      sudo docker logs --tail 20 "$NAME" 2>&1 || true
      sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
      sudo docker rename "$OLD" "$NAME"
      sudo docker start "$NAME" >/dev/null 2>&1 || true
      exit 1
    fi
    probe_login
    echo
    say "DONE_RAISE"
    say "登录 http=200 且 success:true 即可用浏览器登录。"
    say "清完会话后跑：bash $0 restore"
    ;;

  restore)
    if sudo docker inspect "$OLD" >/dev/null 2>&1; then
      say "移除临时容器，恢复原容器 $OLD -> $NAME（上限回到默认 50）"
      sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
      sudo docker rename "$OLD" "$NAME" || exit 1
      sudo docker start "$NAME" >/dev/null 2>&1 || true
      sudo docker update --restart=always "$NAME" >/dev/null 2>&1 || true
      sleep 3
      curl -sSf -m 15 http://127.0.0.1:3000/api/status -o /dev/null \
        && say "健康检查通过" || say "WARN: /api/status 未通过，检查 docker logs $NAME"
      say "DONE_RESTORE"
    else
      say "没有 $OLD，无需回滚。当前容器："
      sudo docker ps --filter "name=$NAME" --format '  {{.Names}}  {{.Image}}  {{.Status}}'
    fi
    ;;

  *)
    echo "用法: bash $0 {raise|restore|status}"
    exit 2
    ;;
esac
