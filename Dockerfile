# HundunOS v4.3 - Docker 镜像优化版
# 多阶段构建，减小镜像体积

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .
RUN npm run build

# 生产镜像
FROM node:20-alpine AS production

WORKDIR /app

# 安装 Python（用于工具执行）
RUN apk add --no-cache python3 py3-pip

# 复制依赖和构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/kernel ./kernel
COPY --from=builder /app/stable-modules ./stable-modules
COPY --from=builder /app/mcp ./mcp
COPY --from=builder /package*.json ./

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs && \
    mkdir -p .hundunos && \
    chown -R nodejs:nodejs /app/.hundunos

USER nodejs

EXPOSE 38080 9090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:38080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npm", "start"]
