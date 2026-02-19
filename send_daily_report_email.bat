@echo off
setlocal

set "APP_DIR=C:\Users\AlexSerrano\Dropbox\skills_agent_rules\el-inmortal-2-webapp"
set "LOG_DIR=%APP_DIR%\logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%I"
set "LOG_FILE=%LOG_DIR%\daily-report-email-%TODAY%.log"

echo [%date% %time%] Starting daily report email >> "%LOG_FILE%"

cd /d "%APP_DIR%"
call npm run youtube:audit -- daily-report-email --to info@galantealx.com --by scheduler >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

echo [%date% %time%] Finished daily report email, exit=%EXIT_CODE% >> "%LOG_FILE%"
exit /b %EXIT_CODE%
