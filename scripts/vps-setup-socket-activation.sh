# KeyoAPI Socket Activation 配置
# 让 systemd 管理端口监听，重启时连接不断

# 步骤 1: 创建 socket 文件
sudo tee /etc/systemd/system/new-api.socket > /dev/null <<'EOF'
[Unit]
Description=KeyoAPI Socket
PartOf=new-api.service

[Socket]
# 监听 3000 端口
ListenStream=3000
# 不要为每个连接创建新进程
Accept=no
# Socket 权限
SocketMode=0660
SocketUser=root
SocketGroup=root

[Install]
WantedBy=sockets.target
EOF

# 步骤 2: 修改现有的 service 文件
# 找到你的 /etc/systemd/system/new-api.service
# 在 [Service] 部分添加这些行：

# 需要添加到 new-api.service 的内容：
# [Unit]
# Requires=new-api.socket
# After=new-api.socket
#
# [Service]
# # 不要在 service 里监听端口，由 socket 传递
# # ExecStart 里的端口参数可以去掉，或者保持不变（systemd 会覆盖）

# 步骤 3: 启用并启动
sudo systemctl daemon-reload
sudo systemctl enable new-api.socket
sudo systemctl start new-api.socket
sudo systemctl restart new-api.service

# 步骤 4: 验证
sudo systemctl status new-api.socket
sudo systemctl status new-api.service

# 测试：
# 1. 重启服务：sudo systemctl restart new-api
# 2. 在另一个终端运行：curl http://localhost:3000/api/status
# 3. 你会发现即使在重启，curl 也只是等待一下而不是直接失败

echo "✓ Socket activation 配置完成"
echo ""
echo "下次发版时："
echo "  sudo systemctl restart new-api"
echo "  # 客人会等几秒，但不会被断开连接"
