# HundunOS v5 - 快速配置脚本 (PowerShell)
# 用于自动安装依赖和生成安全密钥

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       HundunOS v5 - 快速配置向导                       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js 版本
Write-Host "🔍 检查 Node.js 版本..." -ForegroundColor Yellow
$nodeVersion = (node -v) -replace 'v', '' -split '\.' | Select-Object -First 1
if ([int]$nodeVersion -lt 18) {
    Write-Host "❌ 错误：Node.js 版本需要 >= 18.0.0" -ForegroundColor Red
    Write-Host "   当前版本：$(node -v)" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js 版本：$(node -v)" -ForegroundColor Green

# 检查 .env 文件
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "📝 创建 .env 配置文件..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ 已创建 .env 文件" -ForegroundColor Green
} else {
    Write-Host "✅ .env 文件已存在" -ForegroundColor Green
}

# 生成安全密钥
Write-Host ""
Write-Host "🔐 生成安全密钥..." -ForegroundColor Yellow

# 生成 JWT_SECRET
$jwtSecret = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
Write-Host "✅ 已生成 JWT_SECRET" -ForegroundColor Green

# 生成 HUNDUNOS_ENCRYPTION_KEY
$encryptionKey = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
Write-Host "✅ 已生成 HUNDUNOS_ENCRYPTION_KEY" -ForegroundColor Green

# 更新 .env 文件
Write-Host ""
Write-Host "⚙️  更新 .env 配置文件..." -ForegroundColor Yellow

$envContent = Get-Content ".env" -Raw
$envContent = $envContent -replace '^JWT_SECRET=.*', "JWT_SECRET=$jwtSecret"
$envContent = $envContent -replace '^HUNDUNOS_ENCRYPTION_KEY=.*', "HUNDUNOS_ENCRYPTION_KEY=$encryptionKey"
$envContent | Set-Content ".env"

Write-Host "✅ 已更新安全密钥配置" -ForegroundColor Green

# 安装依赖
Write-Host ""
Write-Host "📦 安装依赖..." -ForegroundColor Yellow
npm install

Write-Host ""
Write-Host "✅ 依赖安装完成" -ForegroundColor Green

# 验证安装
Write-Host ""
Write-Host "🔍 验证安装..." -ForegroundColor Yellow
try {
    npm ls --depth=0 | Out-Null
    Write-Host "✅ 依赖验证通过" -ForegroundColor Green
} catch {
    Write-Host "⚠️  依赖验证失败" -ForegroundColor Yellow
}

# 显示配置摘要
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              配置完成摘要                              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 配置文件：.env" -ForegroundColor White
Write-Host "🔐 JWT_SECRET: 已生成 (32 字节)" -ForegroundColor White
Write-Host "🔐 HUNDUNOS_ENCRYPTION_KEY: 已生成 (32 字节)" -ForegroundColor White
Write-Host "📦 依赖包：已安装" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  重要提示:" -ForegroundColor Yellow
Write-Host "   1. 请检查 .env 文件并填写其他必要的配置" -ForegroundColor Yellow
Write-Host "   2. 数据库密码需要手动设置" -ForegroundColor Yellow
Write-Host "   3. AI API 密钥需要根据实际情况配置" -ForegroundColor Yellow
Write-Host ""
Write-Host "🚀 下一步:" -ForegroundColor Green
Write-Host "   - 运行 'npm start' 启动应用" -ForegroundColor White
Write-Host "   - 运行 'npm test' 运行测试" -ForegroundColor White
Write-Host "   - 运行 'npm run benchmark' 运行基准测试" -ForegroundColor White
Write-Host ""
Write-Host "✅ 配置完成！" -ForegroundColor Green
