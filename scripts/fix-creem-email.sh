#!/bin/bash
# 在新加坡 VPS Workbench 执行：给用户补邮箱，解决 Creem「拉起支付失败」
# 用法：bash fix-creem-email.sh
# 可选：EMAIL=你的邮箱 bash fix-creem-email.sh

set -euo pipefail
EMAIL="${EMAIL:-admin@keyoapi.xyz}"
CONTAINER="${CONTAINER:-ai-relay-new-api}"

echo "==> 容器: $CONTAINER"
echo "==> 写入邮箱: $EMAIL"

# 常见库路径
DB=""
for p in /data/one-api.db /data/new-api.db /app/one-api.db /data/data.db; do
  if docker exec "$CONTAINER" test -f "$p" 2>/dev/null; then
    DB="$p"
    break
  fi
done

if [[ -z "$DB" ]]; then
  echo "未找到 sqlite，列出 /data："
  docker exec "$CONTAINER" ls -la /data || true
  exit 1
fi

echo "==> 数据库: $DB"

# 尝试用 python 改（镜像里通常有）
docker exec "$CONTAINER" python3 - <<PY || docker exec "$CONTAINER" python - <<PY
import sqlite3
db="$DB"
email="$EMAIL"
conn=sqlite3.connect(db)
cur=conn.cursor()
cur.execute("UPDATE users SET email=? WHERE id=1", (email,))
conn.commit()
print("updated rows", cur.rowcount)
cur.execute("SELECT id,username,email FROM users WHERE id=1")
print(cur.fetchone())
conn.close()
PY

echo "==> 完成。请重新登录 https://www.keyoapi.xyz 后再点 Creem 确认付款"
echo "    或用 Google 登录（会自动带邮箱）"
