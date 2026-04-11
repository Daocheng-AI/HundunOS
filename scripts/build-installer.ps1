# HundunOS v3.0 Windows 安装包构建脚本
# 用法: 以管理员身份运行 PowerShell，执行此脚本

param(
    [string]$OutputDir = ".\dist",
    [string]$Version = "3.0.0"
)

$ErrorActionPreference = "Stop"

Write-Host "╔════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   HundunOS v3.0 Windows Installer Builder      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 检查环境
Write-Host "[检查] Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Error "Node.js 未安装"
    exit 1
}
Write-Host "       Node.js 版本: $nodeVersion" -ForegroundColor Green

# 创建输出目录
$DistDir = Resolve-Path $OutputDir -ErrorAction SilentlyContinue
if (-not $DistDir) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    $DistDir = Resolve-Path $OutputDir
}

$BuildDir = "$DistDir\HundunOS-$Version"
$AppDir = "$BuildDir\app"

Write-Host "[准备] 创建构建目录: $BuildDir" -ForegroundColor Yellow
if (Test-Path $BuildDir) {
    Remove-Item -Recurse -Force $BuildDir
}
New-Item -ItemType Directory -Path $AppDir | Out-Null

# 复制源文件
Write-Host "[复制] 程序文件..." -ForegroundColor Yellow
$SourceDir = Resolve-Path "."

# 需要复制的目录
$Dirs = @(
    "kernel",
    "stable-modules", 
    "extension-modules",
    "infrastructure",
    "adapters",
    "search",
    "scripts",
    "shell",
    "config",
    "types",
    "docs"
)

foreach ($Dir in $Dirs) {
    $Src = "$SourceDir\$Dir"
    if (Test-Path $Src) {
        Write-Host "       - $Dir" -ForegroundColor Gray
        Copy-Item -Recurse -Force $Src "$AppDir\$Dir"
    }
}

# 复制根目录文件
$Files = @(
    "package.json",
    "package-lock.json",
    "README.md",
    "LICENSE"
)

foreach ($File in $Files) {
    $Src = "$SourceDir\$File"
    if (Test-Path $Src) {
        Copy-Item -Force $Src $AppDir
    }
}

# 安装生产依赖
Write-Host "[安装] 生产依赖..." -ForegroundColor Yellow
Push-Location $AppDir
try {
    npm install --production --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "npm install 失败，将使用已存在的 node_modules"
        if (Test-Path "$SourceDir\node_modules") {
            Copy-Item -Recurse -Force "$SourceDir\node_modules" "$AppDir\node_modules"
        }
    }
} finally {
    Pop-Location
}

# 复制安装程序
Write-Host "[复制] 安装程序..." -ForegroundColor Yellow
Copy-Item -Recurse -Force "$SourceDir\installer\*" $BuildDir

# 创建图标目录并放置默认图标
$AssetsDir = "$AppDir\assets"
New-Item -ItemType Directory -Path $AssetsDir -Force | Out-Null

# 创建简单的 ICO 文件（如果没有的话）
$IconPath = "$AssetsDir\icon.ico"
if (-not (Test-Path $IconPath)) {
    # 创建一个占位符，实际使用时替换为真实图标
    Write-Host "[提示] 未找到图标文件，将使用默认图标" -ForegroundColor Yellow
    # 可以从在线资源下载或使用系统默认图标
}

# 创建 README
Write-Host "[生成] 安装说明..." -ForegroundColor Yellow
@"
HundunOS v$Version Windows 安装包
================================

系统要求:
- Windows 10/11 64位
- Node.js 18+ (安装程序会自动检测)
- 约 200MB 磁盘空间

安装步骤:
1. 以管理员身份运行 install.bat
2. 等待安装完成
3. 从开始菜单或桌面启动 HundunOS

使用方式:
- GUI: 双击桌面图标或开始菜单 "HundunOS GUI"
- 命令行: hundunos "你的消息"
- API: http://localhost:38080

目录结构:
- 程序目录: C:\Program Files\HundunOS
- 数据目录: %USERPROFILE%\.hundunos
- 日志目录: %USERPROFILE%\.hundunos\logs

卸载:
运行 C:\Program Files\HundunOS\uninstall.bat
或在"添加或删除程序"中找到 HundunOS

问题反馈:
https://github.com/hundunos/hundunos/issues
"@ | Set-Content "$BuildDir\README.txt" -Encoding UTF8

# 打包为 ZIP
Write-Host "[打包] 创建安装包..." -ForegroundColor Yellow
$ZipFile = "$DistDir\HundunOS-v$Version-Windows.zip"
if (Test-Path $ZipFile) {
    Remove-Item -Force $ZipFile
}

Compress-Archive -Path "$BuildDir\*" -DestinationPath $ZipFile -CompressionLevel Optimal

# 计算文件大小
$ZipSize = (Get-Item $ZipFile).Length / 1MB
$ZipSizeFormatted = "{0:N2}" -f $ZipSize

Write-Host ""
Write-Host "╔════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           构建完成！                           ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "安装包: $ZipFile" -ForegroundColor Cyan
Write-Host "大小: $ZipSizeFormatted MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "分发方式:" -ForegroundColor Yellow
Write-Host "  1. 直接发送 $ZipFile 给用户" -ForegroundColor White
Write-Host "  2. 用户解压后运行 install.bat" -ForegroundColor White
Write-Host ""

# 可选：创建自解压 EXE (使用 7z 或 WinRAR)
$SfxPath = "$DistDir\HundunOS-v$Version-Windows-Setup.exe"
Write-Host "[提示] 如需创建自解压安装程序，请安装 7-Zip 并运行:" -ForegroundColor Yellow
Write-Host "  7z a -sfx7z.sfx -r '$SfxPath' '$BuildDir\*'" -ForegroundColor Gray
