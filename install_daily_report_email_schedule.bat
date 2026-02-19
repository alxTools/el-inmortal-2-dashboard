@echo off
setlocal

set "TASK_NAME=ElInmortal2_DailyReportEmail"
set "TASK_TIME=23:10"
set "SCRIPT_PATH=C:\Users\AlexSerrano\Dropbox\skills_agent_rules\el-inmortal-2-webapp\send_daily_report_email.bat"

echo Installing scheduled task "%TASK_NAME%" at %TASK_TIME%...
schtasks /Create /SC DAILY /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /ST %TASK_TIME% /F

if %ERRORLEVEL% NEQ 0 (
  echo Failed to install "%TASK_NAME%".
  exit /b %ERRORLEVEL%
)

echo Scheduled task installed successfully.
echo Use check_daily_report_email_schedule.bat to verify details.
exit /b 0
