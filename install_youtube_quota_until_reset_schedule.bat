@echo off
setlocal

set "TASK_NAME=ElInmortal2_YTQuotaMonitor"
set "TASK_TIME=00:05"
set "SCRIPT_PATH=C:\Users\AlexSerrano\Dropbox\skills_agent_rules\el-inmortal-2-webapp\check_youtube_quota_until_reset.bat"

echo Installing quota monitor task "%TASK_NAME%" every 5 minutes...
schtasks /Create /SC MINUTE /MO 5 /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /ST %TASK_TIME% /RU SYSTEM /RL HIGHEST /F

if %ERRORLEVEL% NEQ 0 (
  echo SYSTEM task creation failed, retrying with current user context...
  schtasks /Create /SC MINUTE /MO 5 /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /ST %TASK_TIME% /F
)

if %ERRORLEVEL% NEQ 0 (
  echo Failed to install "%TASK_NAME%".
  exit /b %ERRORLEVEL%
)

echo Scheduled quota monitor installed.
echo It auto-disables itself after first quota recovery detection.
exit /b 0
