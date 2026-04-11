@echo off
chcp 65001 >nul
title HundunOS v3.0

echo.
echo  HundunOS v3.0 - Portable Edition
echo.

cd /d "%~dp0"

node --version >nul 2>&1
if errorlevel 1 (
    echo [Error] Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)

if not exist "data" mkdir data
if not exist "data\config" mkdir data\config

if not exist "data\config\system.json" (
    copy /y "config\system.json" "data\config\system.json" >nul
)

REM S-05: Generate encryption key if not set
if not defined HUNDUNOS_ENCRYPTION_KEY (
    for /f "delims=" %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set HUNDUNOS_ENCRYPTION_KEY=%%i
)

REM Create tools directory
if not exist "scripts\tools" mkdir scripts\tools

echo.
echo Select mode:
echo   [1] GUI (default)
echo   [2] CLI
echo   [3] API Server
set /p choice="Choice (1-3): "
if "%choice%"=="" set choice=1

echo.
if "%choice%"=="1" (
    echo Starting GUI...
    start "" "http://localhost:38081/shell/gui/index.html"
    node kernel/core.js
)

if "%choice%"=="2" (
    node kernel/core.js
)

if "%choice%"=="3" (
    echo API: http://localhost:38080
    node kernel/core.js --server
)

pause
