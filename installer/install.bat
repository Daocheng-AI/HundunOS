@echo off
chcp 65001 >nul
title HundunOS v3.0 Installer

:: ============================================
:: HundunOS v3.0 Windows Installer
:: ============================================

set "INSTALL_DIR=%ProgramFiles%\HundunOS"
set "DATA_DIR=%ProgramData%\HundunOS"
set "USER_DIR=%USERPROFILE%\.hundunos"
set "SHORTCUT_DIR=%ProgramData%\Microsoft\Windows\Start Menu\Programs\HundunOS"

echo.
echo  ╔════════════════════════════════════════════════╗
echo  ║                                                ║
echo  ║   HundunOS v3.0 - 混沌 AI 控制系统              ║
echo  ║                                                ║
echo  ╚════════════════════════════════════════════════╝
echo.

:: Check admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 请以管理员身份运行此安装程序
    echo 右键点击 install.bat，选择"以管理员身份运行"
    pause
    exit /b 1
)

:: Check Node.js
echo [检查] Node.js 环境...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=1" %%a in ('node --version') do set "NODE_VER=%%a"
echo [检查] Node.js 版本: %NODE_VER%

:: Create directories
echo [安装] 创建安装目录...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%"
mkdir "%DATA_DIR%"
mkdir "%DATA_DIR%\updates"
mkdir "%USER_DIR%"
mkdir "%SHORTCUT_DIR%"

:: Copy files
echo [安装] 复制程序文件...
xcopy /e /i /y /q "%~dp0app\*" "%INSTALL_DIR%\" >nul

:: Install dependencies
echo [安装] 安装依赖...
cd /d "%INSTALL_DIR%"
call npm install --production --silent >nul 2>&1
if %errorLevel% neq 0 (
    echo [警告] npm install 失败，尝试使用本地 node_modules
)

:: Create default config
echo [安装] 创建默认配置...
if not exist "%USER_DIR%\config" mkdir "%USER_DIR%\config"
copy /y "%~dp0default-config.json" "%USER_DIR%\config\system.json" >nul 2>&1

:: Create startup script
echo [安装] 创建启动脚本...
(
echo @echo off
echo chcp 65001 ^>nul
echo cd /d "%INSTALL_DIR%"
echo node kernel/core.js %%*
) > "%INSTALL_DIR%\hundunos.bat"

:: Create GUI launcher
echo [安装] 创建 GUI 启动器...
(
echo @echo off
echo chcp 65001 ^>nul
echo start "" "%INSTALL_DIR%\shell\gui\index.html"
) > "%INSTALL_DIR%\gui.bat"

:: Register to PATH
echo [安装] 添加到系统 PATH...
setx /M PATH "%PATH%;%INSTALL_DIR%" >nul 2>&1

:: Create shortcuts
echo [安装] 创建快捷方式...
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_DIR%\HundunOS Console.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\hundunos.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = '%INSTALL_DIR%\assets\icon.ico'; $Shortcut.Save()" >nul 2>&1

powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_DIR%\HundunOS GUI.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\gui.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = '%INSTALL_DIR%\assets\icon.ico'; $Shortcut.Save()" >nul 2>&1

powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\HundunOS.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\gui.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = '%INSTALL_DIR%\assets\icon.ico'; $Shortcut.Save()" >nul 2>&1

:: Create uninstaller
echo [安装] 创建卸载程序...
(
echo @echo off
echo chcp 65001 ^>nul
echo echo 正在卸载 HundunOS...
echo rmdir /s /q "%INSTALL_DIR%"
echo rmdir /s /q "%SHORTCUT_DIR%"
echo reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HundunOS" /f ^>nul 2^>^&1
echo echo 卸载完成
echo pause
) > "%INSTALL_DIR%\uninstall.bat"

:: Register in Windows Programs
echo [安装] 注册到系统程序列表...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HundunOS" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HundunOS" /v "DisplayName" /t REG_SZ /d "HundunOS v3.0" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HundunOS" /v "DisplayVersion" /t REG_SZ /d "3.0.0" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HundunOS" /v "Publisher" /t REG_SZ /d "HundunOS Team" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HundunOS" /v "InstallLocation" /t REG_SZ /d "%INSTALL_DIR%" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HundunOS" /v "UninstallString" /t REG_SZ /d "%INSTALL_DIR%\uninstall.bat" /f >nul 2>&1

:: Installation complete
echo.
echo  ╔════════════════════════════════════════════════╗
echo  ║           安装完成！                           ║
echo  ╚════════════════════════════════════════════════╝
echo.
echo  安装目录: %INSTALL_DIR%
echo  数据目录: %USER_DIR%
echo.
echo  启动方式:
echo   1. 命令行: hundunos "你的消息"
echo   2. GUI: 双击桌面 HundunOS 图标
echo   3. 开始菜单: HundunOS Console / GUI
echo.
echo  REST API: http://localhost:38080
echo.
pause
