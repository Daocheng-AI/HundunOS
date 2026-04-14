# HundunOS v5 - Docker镜像

# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 生产阶段
FROM node:20-alpine

# 安装必要的系统依赖
RUN apk add --no-cache \
    dumb-init \
    ca-certificates

# 创建非root用户
RUN addgroup -g 1001 -S hundunos && \
    adduser -S hundunos -u 1001

WORKDIR /app

# 从构建阶段复制文件
COPY --from=builder --chown=hundunos:hundunos /app/node_modules ./node_modules
COPY --from=builder --chown=hundunos:hundunos /app/kernel ./kernel
COPY --from=builder --chown=hundunos:hundunos /app/config ./config
COPY --from=builder --chown=hundunos:hundunos /app/package.json ./

# 创建数据目录
RUN mkdir -p /app/data && chown -R hundunos:hundunos /app/data

# 切换到非root用户
USER hundunos

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# 使用dumb-init处理信号
ENTRYPOINT ["dumb-init", "--"]

# 启动命令
CMD ["node", "--experimental-vm-modules", "kernel/v5/index.js"]
