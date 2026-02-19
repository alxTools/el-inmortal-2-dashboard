@echo off
setlocal

set "APP_DIR=C:\Users\AlexSerrano\Dropbox\skills_agent_rules\el-inmortal-2-webapp"
set "LOG_DIR=%APP_DIR%\logs"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if not exist "%NODE_EXE%" set "NODE_EXE=node"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%I"
set "LOG_FILE=%LOG_DIR%\yt-quota-monitor-%TODAY%.log"

echo [%date% %time%] Starting quota monitor tick >> "%LOG_FILE%"

cd /d "%APP_DIR%"
call "%NODE_EXE%" "%APP_DIR%\scripts\youtube-quota-monitor-tick.js" --task-name ElInmortal2_YTQuotaMonitor --by scheduler >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

echo [%date% %time%] Finished quota monitor tick, exit=%EXIT_CODE% >> "%LOG_FILE%"
exit /b %EXIT_CODE%
