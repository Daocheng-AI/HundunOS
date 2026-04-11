# HundunOS v3.0 - Docker Image
# 基于 Node.js 22 的生产镜像

# 阶段 1: 构建阶段
FROM node:22-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    make \
    g++ \
    sqlite-dev

# 复制 package 文件
COPY package.json package-lock.json* ./

# 安装依赖
RUN npm ci --only=production && \
    npm cache clean --force

# 复制源代码
COPY . .

# 阶段 2: 生产阶段
FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 -S hundunos && \
    adduser -S -u 1001 -G hundunos hundunos

# 安装运行时依赖
RUN apk add --no-cache \
    python3 \
    py3-pip \
    sqlite-libs \
    curl

# 从构建阶段复制依赖
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/kernel ./kernel
COPY --from=builder /app/stable-modules ./stable-modules
COPY --from=builder /app/infrastructure ./infrastructure
COPY --from=builder /app/extension-modules ./extension-modules
COPY --from=builder /app/config ./config
COPY --from=builder /app/types ./types
COPY --from=builder /app/scripts ./scripts

# 创建必要的目录
RUN mkdir -p /app/data /app/logs /app/.hundunos && \
    chown -R hundunos:hundunos /app

# 切换到非 root 用户
USER hundunos

# 暴露端口
EXPOSE 38080

# 健康检查（P0 修复：改用 ESM 脚本，原先 require() 在 ESM 项目中恒定失败）
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node /app/scripts/health-check.js

# 设置环境变量
ENV NODE_ENV=production \
    HUNDUNOS_WS=/app/workspace \
    HUNDUNOS_DATA=/app/data \
    HUNDUNOS_LOGS=/app/logs

# 启动命令
CMD ["node", "kernel/core.js"]
