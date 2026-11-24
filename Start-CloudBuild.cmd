@echo off
setlocal
node "%~dp0scripts\start-cloud-build.js" --pick
if errorlevel 1 (
    echo.
    echo Cloud Build could not start. See the message above.
    pause
    exit /b 1
)
