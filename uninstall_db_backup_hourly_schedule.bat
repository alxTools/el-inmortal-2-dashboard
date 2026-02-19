@echo off
setlocal

set "TASK_NAME=ArtistaViral_DBBackupHourly"

echo Removing scheduled task "%TASK_NAME%"...
schtasks /Delete /TN "%TASK_NAME%" /F

if %ERRORLEVEL% NEQ 0 (
  echo Task "%TASK_NAME%" could not be removed (may not exist).
  exit /b %ERRORLEVEL%
)

echo Scheduled task removed.
exit /b 0
