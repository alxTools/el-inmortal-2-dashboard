@echo off
setlocal

set "TASK_NAME=ArtistaViral_DBBackupHourly"

echo Checking scheduled task "%TASK_NAME%"...
schtasks /Query /TN "%TASK_NAME%" /V /FO LIST
