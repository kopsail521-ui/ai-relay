@echo off
cd /d %~dp0
cd /d %~dp0..\..
set PORT=3020
echo Starting unofree-pool on http://127.0.0.1:%PORT% ...
node "%~dp0server.mjs"
pause
