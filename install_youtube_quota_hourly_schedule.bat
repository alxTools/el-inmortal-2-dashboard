@echo off
setlocal

set "TASK_NAME=ElInmortal2_YTQuotaHourly"
set "TASK_TIME=00:05"
set "SCRIPT_PATH=C:\Users\AlexSerrano\Dropbox\skills_agent_rules\el-inmortal-2-webapp\check_youtube_quota_hourly.bat"

echo Installing scheduled task "%TASK_NAME%" (hourly)...
schtasks /Create /SC HOURLY /MO 1 /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /ST %TASK_TIME% /RU SYSTEM /RL HIGHEST /F

if %ERRORLEVEL% NEQ 0 (
  echo SYSTEM task creation failed, retrying with current user context...
  schtasks /Create /SC HOURLY /MO 1 /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /ST %TASK_TIME% /F
)

if %ERRORLEVEL% NEQ 0 (
  echo Failed to install "%TASK_NAME%".
  exit /b %ERRORLEVEL%
)

echo Scheduled task installed successfully.
echo Use check_youtube_quota_hourly_schedule.bat to verify.
exit /b 0
