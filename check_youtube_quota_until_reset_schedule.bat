@echo off
setlocal

set "TASK_NAME=ElInmortal2_YTQuotaMonitor"

echo Checking scheduled task "%TASK_NAME%"...
schtasks /Query /TN "%TASK_NAME%" /V /FO LIST
