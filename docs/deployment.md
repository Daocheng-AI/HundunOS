# HundunOS v3.0 - 部署指南

## 目录

- [系统要求](#系统要求)
- [本地部署](#本地部署)
- [Docker 部署](#docker-部署)
- [生产环境部署](#生产环境部署)
- [监控与运维](#监控与运维)
- [故障排查](#故障排查)
- [升级与维护](#升级与维护)

---

## 系统要求

### 最低配置

- **操作系统**: Windows 10+, Linux (Ubuntu 20.04+, CentOS 7+), macOS 10.15+
- **CPU**: 2 核心或更多
- **内存**: 4 GB RAM
- **磁盘**: 10 GB 可用空间
- **Node.js**: v18 或更高
- **Python**: v3.8 或更高（可选）

### 推荐配置（生产环境）

- **CPU**: 4 核心或更多
- **内存**: 8 GB RAM 或更多
- **磁盘**: 50 GB SSD 可用空间
- **Node.js**: v22 LTS
- **Python**: v3.10+
- **Ollama**: 可选，用于本地 AI 模型

---

## 本地部署

### 1. 环境准备

#### Windows

```powershell
# 安装 Node.js
# 从 https://nodejs.org/ 下载并安装 Node.js v22 LTS

# 验证安装
node --version
npm --version

# 安装 Python（可选）
# 从 https://www.python.org/ 下载并安装 Python 3.10+

# 安装 Ollama（可选）
# 从 https://ollama.ai/ 下载并安装
```

#### Linux

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version

# 安装 Python（可选）
sudo apt-get install -y python3 python3-pip

# 安装 Ollama（可选）
curl -fsSL https://ollama.ai/install.sh | sh
```

#### macOS

```bash
# 使用 Homebrew 安装 Node.js
brew install node@22

# 验证安装
node --version
npm --version

# 安装 Python（可选）
brew install python3

# 安装 Ollama（可选）
brew install ollama
```

### 2. 安装依赖

```bash
# 克隆仓库
git clone <repository-url>
cd hundunos

# 安装依赖
npm install

# 或者使用 pnpm
pnpm install
```

### 3. 配置系统

编辑 `config/system.json`:

```json
{
  "version": "3.0.0",
  "name": "HundunOS",
  "environment": "production",
  "kernel": {
    "logLevel": "info",
    "maxRetries": 3,
    "timeout": 30000
  },
  "modelRouter": {
    "defaultStrategy": "COST_FIRST",
    "providers": ["ollama"],
    "localFirst": true,
    "endpoint": "http://127.0.0.1:11434",
    "localModel": "qwen2.5:1.5b"
  }
}
```

### 4. 启动服务

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm start

# 健康检查
npm run health
```

### 5. 验证部署

```bash
# 运行测试
npm test

# 检查服务状态
curl http://localhost:38080/health
```

---

## Docker 部署

### 1. 安装 Docker

#### Windows

```powershell
# 下载 Docker Desktop for Windows
# https://www.docker.com/products/docker-desktop/

# 验证安装
docker --version
docker-compose --version
```

#### Linux

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo apt-get install -y docker-compose-plugin

# 验证安装
docker --version
docker compose version
```

#### macOS

```bash
# 下载 Docker Desktop for Mac
# https://www.docker.com/products/docker-desktop/

# 验证安装
docker --version
docker-compose --version
```

### 2. 构建镜像

```bash
# 进入项目目录
cd hundunos

# 构建镜像
docker-compose build

# 或使用 Makefile
make build
```

### 3. 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 或使用 Makefile
make up

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 4. 安装 Ollama 模型

```bash
# 安装默认模型
docker-compose exec ollama ollama pull qwen2.5:1.5b

# 或使用 Makefile
make install-deps
```

### 5. 验证部署

```bash
# 检查健康状态
curl http://localhost:38080/health

# 运行测试
docker-compose run --rm hundunos npm test
```

### 6. 服务管理

```bash
# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看特定服务日志
docker-compose logs -f hundunos

# 进入容器
docker-compose exec hundunos sh

# 清理所有容器和镜像
docker-compose down -v
docker system prune -f
```

---

## 生产环境部署

### 1. 环境变量配置

创建 `.env` 文件:

```bash
# 数据库配置
POSTGRES_DB=hundunos
POSTGRES_USER=hundunos
POSTGRES_PASSWORD=your_secure_password_here

# Redis 配置
REDIS_PASSWORD=your_redis_password_here

# Grafana 配置
GRAFANA_PASSWORD=your_grafana_password_here

# 应用配置
NODE_ENV=production
HUNDUNOS_WS=/app/workspace
HUNDUNOS_DATA=/app/data
```

### 2. Nginx 反向代理配置

创建 `nginx/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream hundunos {
        server hundunos:38080;
    }

    server {
        listen 80;
        server_name your-domain.com;

        # 重定向到 HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        location / {
            proxy_pass http://hundunos;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /health {
            proxy_pass http://hundunos/health;
            access_log off;
        }
    }
}
```

### 3. 使用 Kubernetes 部署

创建 `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hundunos
  labels:
    app: hundunos
spec:
  replicas: 3
  selector:
    matchLabels:
      app: hundunos
  template:
    metadata:
      labels:
        app: hundunos
    spec:
      containers:
      - name: hundunos
        image: hundunos:latest
        ports:
        - containerPort: 38080
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 38080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 38080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: hundunos-service
spec:
  selector:
    app: hundunos
  ports:
  - protocol: TCP
    port: 80
    targetPort: 38080
  type: LoadBalancer
```

部署到 Kubernetes:

```bash
# 应用配置
kubectl apply -f k8s/deployment.yaml

# 查看部署状态
kubectl get pods
kubectl get services

# 查看日志
kubectl logs -f deployment/hundunos
```

### 4. 使用 Docker Swarm

```bash
# 初始化 Swarm
docker swarm init

# 部署堆栈
docker stack deploy -c docker-compose.yml hundunos

# 查看服务
docker service ls

# 查看日志
docker service logs hundunos_hundunos

# 扩展服务
docker service scale hundunos_hundunos=3
```

---

## 监控与运维

### 1. Prometheus 配置

创建 `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'hundunos'
    static_configs:
      - targets: ['hundunos:38080']
    metrics_path: /metrics
```

### 2. Grafana 仪表板

访问 `http://localhost:3000`，使用默认密码登录（或在 `.env` 中配置的密码）。

导入预定义的仪表板：
- 系统健康监控
- 请求延迟统计
- 错误率追踪
- 资源使用情况

### 3. 日志管理

配置日志轮转 `config/logging.json`:

```json
{
  "level": "info",
  "format": "json",
  "transports": {
    "console": {
      "enabled": true
    },
    "file": {
      "enabled": true,
      "filename": "logs/hundunos.log",
      "maxSize": "100M",
      "maxFiles": 10
    }
  }
}
```

### 4. 健康检查

```bash
# HTTP 健康检查
curl http://localhost:38080/health

# 详细状态
curl http://localhost:38080/status

# 指标端点
curl http://localhost:38080/metrics
```

---

## 故障排查

### 常见问题

#### 1. 服务无法启动

```bash
# 检查端口占用
netstat -tuln | grep 38080

# 检查日志
docker-compose logs hundunos

# 检查配置文件
cat config/system.json
```

#### 2. Ollama 连接失败

```bash
# 检查 Ollama 服务
docker-compose ps ollama

# 测试 Ollama 连接
curl http://localhost:11434/api/tags

# 重启 Ollama
docker-compose restart ollama
```

#### 3. 内存不足

```bash
# 检查内存使用
docker stats

# 增加内存限制
# 编辑 docker-compose.yml，添加：
services:
  hundunos:
    mem_limit: 2g
```

#### 4. 数据库连接失败

```bash
# 检查 PostgreSQL 状态
docker-compose ps postgres

# 测试数据库连接
docker-compose exec postgres psql -U hundunos -d hundunos -c "SELECT 1;"

# 查看数据库日志
docker-compose logs postgres
```

#### 5. 权限错误

```bash
# 修复文件权限
sudo chown -R 1001:1001 data/ logs/

# 重新启动服务
docker-compose restart
```

### 调试模式

启用调试日志：

```json
{
  "kernel": {
    "logLevel": "debug"
  }
}
```

---

## 升级与维护

### 1. 备份数据

```bash
# 备份数据库
docker-compose exec postgres pg_dump -U hundunos hundunos > backup.sql

# 备份数据卷
docker run --rm -v hundunos-data:/data -v $(pwd):/backup alpine tar czf /backup/hundunos-data.tar.gz /data

# 备份配置
tar czf config-backup.tar.gz config/
```

### 2. 升级步骤

```bash
# 1. 停止服务
docker-compose down

# 2. 备份数据
# (见上一步)

# 3. 拉取最新代码
git pull origin main

# 4. 重建镜像
docker-compose build --no-cache

# 5. 启动服务
docker-compose up -d

# 6. 验证升级
curl http://localhost:38080/health
```

### 3. 回滚步骤

```bash
# 1. 停止服务
docker-compose down

# 2. 恢复之前的版本
git checkout <previous-version>

# 3. 重建镜像
docker-compose build --no-cache

# 4. 恢复数据
# (见备份步骤)

# 5. 启动服务
docker-compose up -d
```

### 4. 定期维护

```bash
# 清理未使用的 Docker 资源
docker system prune -a --volumes

# 更新基础镜像
docker-compose pull

# 检查磁盘空间
df -h

# 检查日志大小
du -sh logs/
```

---

## 性能优化

### 1. Node.js 优化

```bash
# 增加堆内存
NODE_OPTIONS="--max-old-space-size=4096" node kernel/core.js

# 启用生产模式
NODE_ENV=production node kernel/core.js
```

### 2. 数据库优化

```sql
-- 创建索引
CREATE INDEX idx_sessions_created ON sessions(created);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);

-- 定期清理
DELETE FROM logs WHERE timestamp < NOW() - INTERVAL '30 days';
```

### 3. 缓存策略

```json
{
  "cache": {
    "enabled": true,
    "ttl": 3600,
    "maxSize": 1000
  }
}
```

---

## 安全加固

### 1. 网络安全

- 使用 HTTPS
- 配置防火墙规则
- 限制 API 访问频率

### 2. 访问控制

- 使用强密码
- 启用 RBAC
- 定期轮换密钥

### 3. 审计日志

```bash
# 查看审计日志
docker-compose exec hundunos cat logs/audit.log

# 导出审计日志
docker-compose exec hundunos cat logs/audit.log > audit.log
```

---

## 联系支持

如遇到部署问题，请：

1. 查看日志文件
2. 运行健康检查
3. 查阅故障排查章节
4. 提交 Issue 或联系支持团队

---

**文档版本**: v1.0
**最后更新**: 2026年4月1日
