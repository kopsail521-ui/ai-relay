#!/bin/bash
# 安全发版脚本 - 单核服务器专用
# 运行: cd /opt/ai-relay && sudo bash scripts/vps-deploy-safe.sh

set -e

echo "=========================================="
echo "  KeyoAPI 安全发版"
echo "=========================================="
echo ""

cd /opt/ai-relay

# 1. 拉取最新代码
echo "[1/6] 📥 拉取最新代码..."
git fetch origin
git pull origin main

# 2. 构建前端
echo ""
echo "[2/6] 🔨 构建前端 (大约需要 2 分钟)..."
cd new-api/web
pnpm build

# 3. 发版前健康检查
echo ""
echo "[3/6] 🏥 发版前健康检查..."
if curl -sf http://localhost:3000/api/status > /dev/null; then
    echo "✓ 当前服务运行正常"
else
    echo "⚠ 当前服务已停止（这是正常的如果是首次部署）"
fi

# 4. 重启服务
echo ""
echo "[4/6] 🔄 重启服务..."
echo "⏰ 预计停机时间: 5-10 秒"
sudo systemctl restart new-api

# 5. 等待服务启动 (最多等 60 秒)
echo ""
echo "[5/6] ⏳ 等待服务启动..."
SERVICE_OK=0
for i in {1..60}; do
    if curl -sf http://localhost:3000/api/status > /dev/null; then
        echo "✓ 服务在 ${i} 秒后恢复"
        SERVICE_OK=1
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

if [ $SERVICE_OK -eq 0 ]; then
    echo "❌ 服务启动失败！"
    echo "查看日志: sudo journalctl -u new-api -n 50"
    exit 1
fi

# 6. 功能测试
echo ""
echo "[6/6] 🧪 功能测试..."

# 测试 API 状态
if curl -sf http://localhost:3000/api/status | grep -q '"success":true'; then
    echo "✓ API 响应正常"
else
    echo "❌ API 响应异常"
    exit 1
fi

# 测试静态文件
if curl -sf http://localhost:3000/ | grep -q "html"; then
    echo "✓ 静态文件正常"
else
    echo "❌ 静态文件异常"
    exit 1
fi

# 测试登录页面
if curl -sf http://localhost:3000/login | grep -q "html"; then
    echo "✓ 登录页面正常"
else
    echo "❌ 登录页面异常"
    exit 1
fi

echo ""
echo "=========================================="
echo "  ✅ 发版成功！"
echo "=========================================="
echo ""
echo "建议手动测试："
echo "  1. 打开 https://keyoapi.xyz"
echo "  2. 尝试登录"
echo "  3. 测试一个 API 调用"
echo ""
