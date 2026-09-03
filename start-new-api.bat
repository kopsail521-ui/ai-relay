@echo off
cd /d %~dp0
if not exist bin\new-api.exe (
  echo Downloading New API Windows binary via mirror...
  mkdir bin 2>nul
  curl.exe -L --retry 5 --retry-delay 2 -o bin\new-api.exe "https://ghfast.top/https://github.com/QuantumNous/new-api/releases/download/v1.0.0-rc.26/new-api-v1.0.0-rc.26.exe"
  if errorlevel 1 (
    echo Download failed. Try manual download:
    echo https://github.com/QuantumNous/new-api/releases
    pause
    exit /b 1
  )
)
mkdir data\new-api 2>nul
mkdir data\logs 2>nul
cd /d %~dp0data\new-api
set PORT=3000
echo Starting New API on http://localhost:3000 ...
"%~dp0bin\new-api.exe" --port 3000 --log-dir "%~dp0data\logs"
pause
