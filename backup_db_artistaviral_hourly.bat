@echo off
setlocal

set "APP_DIR=C:\Users\AlexSerrano\Dropbox\skills_agent_rules\el-inmortal-2-webapp"
set "LOG_DIR=%APP_DIR%\logs"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if not exist "%NODE_EXE%" set "NODE_EXE=node"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%I"
set "LOG_FILE=%LOG_DIR%\db-backup-hourly-%TODAY%.log"

echo [%date% %time%] Starting DB backup >> "%LOG_FILE%"

cd /d "%APP_DIR%"
call "%NODE_EXE%" "%APP_DIR%\scripts\backup-artistaviral-db.js" >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

echo [%date% %time%] Finished DB backup, exit=%EXIT_CODE% >> "%LOG_FILE%"
exit /b %EXIT_CODE%
