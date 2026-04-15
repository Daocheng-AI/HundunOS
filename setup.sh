#!/bin/bash
# HundunOS v5 - 快速配置脚本
# 用于自动安装依赖和生成安全密钥

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║       HundunOS v5 - 快速配置向导                       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# 检查 Node.js 版本
echo "🔍 检查 Node.js 版本..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ 错误：Node.js 版本需要 >= 18.0.0"
    echo "   当前版本：$(node -v)"
    exit 1
fi
echo "✅ Node.js 版本：$(node -v)"

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo ""
    echo "📝 创建 .env 配置文件..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件"
else
    echo "✅ .env 文件已存在"
fi

# 生成安全密钥
echo ""
echo "🔐 生成安全密钥..."

# 生成 JWT_SECRET
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "✅ 已生成 JWT_SECRET"

# 生成 HUNDUNOS_ENCRYPTION_KEY
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "✅ 已生成 HUNDUNOS_ENCRYPTION_KEY"

# 更新 .env 文件
echo ""
echo "⚙️  更新 .env 配置文件..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    sed -i '' "s/^HUNDUNOS_ENCRYPTION_KEY=.*/HUNDUNOS_ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
else
    # Linux
    sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    sed -i "s/^HUNDUNOS_ENCRYPTION_KEY=.*/HUNDUNOS_ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
fi
echo "✅ 已更新安全密钥配置"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install

echo ""
echo "✅ 依赖安装完成"

# 验证安装
echo ""
echo "🔍 验证安装..."
npm ls --depth=0 > /dev/null 2>&1 && echo "✅ 依赖验证通过" || echo "⚠️  依赖验证失败"

# 显示配置摘要
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║              配置完成摘要                              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "📁 配置文件：.env"
echo "🔐 JWT_SECRET: 已生成 (32 字节)"
echo "🔐 HUNDUNOS_ENCRYPTION_KEY: 已生成 (32 字节)"
echo "📦 依赖包：已安装"
echo ""
echo "⚠️  重要提示:"
echo "   1. 请检查 .env 文件并填写其他必要的配置"
echo "   2. 数据库密码需要手动设置"
echo "   3. AI API 密钥需要根据实际情况配置"
echo ""
echo "🚀 下一步:"
echo "   - 运行 'npm start' 启动应用"
echo "   - 运行 'npm test' 运行测试"
echo "   - 运行 'npm run benchmark' 运行基准测试"
echo ""
echo "✅ 配置完成！"
