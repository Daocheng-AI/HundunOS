@echo off
:: HundunOS v3.0 Client Launcher
cd /d "%~dp0"
echo.
echo  ====================================
echo   HundunOS v3.0 Standalone Client
echo  ====================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+ first.
    pause
    exit /b 1
)

curl -s --max-time 2 http://127.0.0.1:38081/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Daemon already running
    goto :gui
)

if not exist "node_modules" (
    echo [SETUP] Installing dependencies...
    call npm install
)

echo [START] Starting HundunOS daemon...
start "HundunOS Daemon" /min cmd /c "node bin\hundunos-daemon.js"
echo [WAIT] Waiting for daemon...
timeout /t 5 /nobreak >nul

:gui
echo [START] Starting GUI...
start "HundunOS" cmd /k "npm run gui"
exit
