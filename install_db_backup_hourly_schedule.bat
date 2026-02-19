@echo off
setlocal

set "TASK_NAME=ArtistaViral_DBBackupHourly"
set "TASK_TIME=00:15"
set "SCRIPT_PATH=C:\Users\AlexSerrano\Dropbox\skills_agent_rules\el-inmortal-2-webapp\backup_db_artistaviral_hourly.bat"

echo Installing scheduled task "%TASK_NAME%" every hour...
schtasks /Create /SC HOURLY /MO 1 /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /ST %TASK_TIME% /RU SYSTEM /RL HIGHEST /F

if %ERRORLEVEL% NEQ 0 (
  echo SYSTEM task creation failed, retrying with current user context...
  schtasks /Create /SC HOURLY /MO 1 /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /ST %TASK_TIME% /F
)

if %ERRORLEVEL% NEQ 0 (
  echo Failed to install "%TASK_NAME%".
  exit /b %ERRORLEVEL%
)

echo Scheduled backup task installed.
echo Use check_db_backup_hourly_schedule.bat to verify details.
exit /b 0
