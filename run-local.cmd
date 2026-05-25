@echo off
setlocal
cd /d "%~dp0"

echo.
echo RoomSense AI Private - local launcher
echo =====================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20+ and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist .env.local (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$key=-join (1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }); Set-Content -Path '.env.local' -Value @('PORT=3000','HTTPS_PORT=3443','ROOMSENSE_HTTPS=true',('ROOMSENSE_ACCESS_KEY=' + $key),'AI_API_BASE_URL=','AI_API_KEY=','AI_MODEL=','AI_PROVIDER_LABEL=OpenAI-compatible')"
)

findstr /B /C:"ROOMSENSE_ACCESS_KEY=" .env.local >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$key=-join (1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }); Add-Content -Path '.env.local' -Value ('ROOMSENSE_ACCESS_KEY=' + $key)"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$content=Get-Content '.env.local'; $line=$content | Where-Object { $_ -like 'ROOMSENSE_ACCESS_KEY=*' } | Select-Object -First 1; if (-not $line -or $line -eq 'ROOMSENSE_ACCESS_KEY=') { $key=-join (1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }); $content -replace '^ROOMSENSE_ACCESS_KEY=.*$',('ROOMSENSE_ACCESS_KEY=' + $key) | Set-Content '.env.local' }"

for /f "tokens=2 delims==" %%K in ('findstr /B /C:"ROOMSENSE_ACCESS_KEY=" .env.local') do set ROOMSENSE_ACCESS_KEY=%%K

echo Building production bundle...
call npm.cmd run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Desktop URL:
echo   http://localhost:3000/?access_key=%ROOMSENSE_ACCESS_KEY%
echo.
echo Phone camera/microphone URL candidates on your Wi-Fi:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
  for /f "tokens=* delims= " %%B in ("%%A") do echo   https://%%B:3443/?access_key=%ROOMSENSE_ACCESS_KEY%
)
echo.
echo Android may show a certificate warning once. Continue only if the address is your PC IP.
echo Keep this window open while testing. Press Ctrl+C to stop.
echo.

set NODE_ENV=production
set ROOMSENSE_HTTPS=true
call npm.cmd start

endlocal
