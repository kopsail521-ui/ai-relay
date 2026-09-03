@echo off
cd /d %~dp0pricing-admin
if not exist node_modules (
  call npm install
)
set ADMIN_PASSWORD=admin123
set PORT=3100
set DATA_DIR=%~dp0data\pricing
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
echo Pricing admin: http://localhost:3100
echo Default password: %ADMIN_PASSWORD%
call npm start
pause
