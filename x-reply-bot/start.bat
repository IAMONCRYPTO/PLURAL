@echo off
title X.com Reply Assistant - Plural
echo =======================================================
echo            X.COM REPLY ASSISTANT FOR PLURAL
echo =======================================================
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist node_modules (
    echo [INFO] First time setup: Installing dependencies (Puppeteer)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Make sure Node.js is installed on your PC.
        pause
        exit /b 1
    )
    echo [SUCCESS] Setup completed!
    echo.
)

echo [INFO] Starting Reply Assistant...
echo.
node bot.js

echo.
echo =======================================================
echo             Job completed! Press any key to exit.
echo =======================================================
pause
