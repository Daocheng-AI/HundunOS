# HundunOS v5 部署准备清单

本文档提供 HundunOS v5 生产环境部署的完整检查清单。

**生成日期**: 2026-04-15  
**版本**: 5.0.0

---

## ✅ 部署前检查清单

### 1. 环境配置 ⚠️ 关键

- [ ] **复制环境变量文件**
  ```bash
  cp .env.example .env
  ```

- [ ] **生成安全密钥**
  ```bash
  # 生成 JWT_SECRET
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  
  # 生成 HUNDUNOS_ENCRYPTION_KEY
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- [ ] **配置生产环境变量**
  - [ ] `NODE_ENV=production`
  - [ ] `JWT_SECRET=<生成的密钥>`
  - [ ] `HUNDUNOS_ENCRYPTION_KEY=<生成的密钥>`
  - [ ] `DB_PASSWORD=<强密码>`
  - [ ] `REDIS_PASSWORD=<强密码>`（如使用 Redis）

- [ ] **配置 AI 模型 API 密钥**（如需要）
  - [ ] `OPENAI_API_KEY`
  - [ ] `ANTHROPIC_API_KEY`

### 2. 依赖安装

- [ ] **安装 Node.js 依赖**
  ```bash
  npm install
  ```

- [ ] **验证依赖安装**
  ```bash
  npm ls --depth=0
  ```

- [ ] **安装 OpenTelemetry 依赖**（可选）
  ```bash
  npm install @opentelemetry/api @opentelemetry/sdk-trace-node
  ```

### 3. 安全检查

- [ ] **运行安全审计**
  ```bash
  npm audit
  ```

- [ ] **检查依赖漏洞**
  ```bash
  npm audit --audit-level=high
  ```

- [ ] **验证 .env 文件未提交到 Git**
  ```bash
  git check-ignore .env
  ```

### 4. 测试验证

- [ ] **运行单元测试**
  ```bash
  npm test
  ```

- [ ] **运行基准测试**（可选）
  ```bash
  npm run benchmark
  ```

- [ ] **检查测试覆盖率**
  ```bash
  npm run test:coverage
  ```

### 5. 代码质量

- [ ] **运行代码检查**
  ```bash
  npm run lint
  ```

- [ ] **格式化代码**
  ```bash
  npm run format
  ```

- [ ] **类型检查**（如使用 TypeScript）
  ```bash
  npm run typecheck
  ```

### 6. 数据库准备

- [ ] **安装 PostgreSQL**（生产环境）
  ```bash
  # Ubuntu/Debian
  sudo apt-get install postgresql postgresql-contrib
  
  # macOS
  brew install postgresql
  ```

- [ ] **创建数据库和用户**
  ```sql
  CREATE DATABASE hundunos;
  CREATE USER hundunos WITH PASSWORD '<强密码>';
  GRANT ALL PRIVILEGES ON DATABASE hundunos TO hundunos;
  ```

- [ ] **运行数据库迁移**
  ```bash
  # 根据项目实际的迁移脚本
  npm run db:migrate
  ```

### 7. Redis 配置（可选）

- [ ] **安装 Redis**
  ```bash
  # Ubuntu/Debian
  sudo apt-get install redis-server
  
  # macOS
  brew install redis
  ```

- [ ] **启动 Redis**
  ```bash
  redis-server --daemonize yes
  ```

- [ ] **配置 Redis 密码**（生产环境）
  编辑 `/etc/redis/redis.conf`:
  ```
  requirepass <强密码>
  ```

### 8. 性能监控配置（可选）

- [ ] **配置 OpenTelemetry**
  - [ ] 设置 `OTEL_SERVICE_NAME=hundunos`
  - [ ] 设置 `OTEL_EXPORTER_OTLP_ENDPOINT`
  - [ ] 设置 `OTEL_SAMPLE_RATE=0.1`

- [ ] **部署 Jaeger/Zipkin**（分布式追踪）
  ```bash
  # Docker 运行 Jaeger
  docker run -d --name jaeger \
    -e COLLECTOR_OTLP_ENABLED=true \
    -p 4318:4318 \
    -p 16686:16686 \
    jaegertracing/all-in-one:latest
  ```

### 9. 构建和打包

- [ ] **创建生产构建**（如适用）
  ```bash
  npm run build
  ```

- [ ] **验证构建输出**
  ```bash
  ls -la dist/
  ```

### 10. Docker 部署（可选）

- [ ] **构建 Docker 镜像**
  ```bash
  npm run docker:build
  ```

- [ ] **测试 Docker 容器**
  ```bash
  npm run docker:run
  ```

- [ ] **验证容器健康检查**
  ```bash
  docker ps
  docker logs hundunos
  ```

---

## 🚀 部署步骤

### 方案 A: 传统部署

1. **上传代码到服务器**
   ```bash
   git clone <repository-url>
   cd hundunos
   ```

2. **安装依赖**
   ```bash
   npm install --production
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件
   ```

4. **初始化数据库**
   ```bash
   npm run db:init
   ```

5. **启动应用**
   ```bash
   npm start
   ```

6. **配置进程管理**（使用 PM2）
   ```bash
   npm install -g pm2
   pm2 start kernel/v5/index.js --name hundunos
   pm2 save
   pm2 startup
   ```

### 方案 B: Docker 部署

1. **准备 docker-compose.yml**
   ```yaml
   version: '3.8'
   services:
     hundunos:
       image: hundunos:v5
       ports:
         - "3000:3000"
       environment:
         - NODE_ENV=production
         - JWT_SECRET=${JWT_SECRET}
         - HUNDUNOS_ENCRYPTION_KEY=${HUNDUNOS_ENCRYPTION_KEY}
       depends_on:
         - postgres
         - redis
   
   postgres:
     image: postgres:15
     environment:
       - POSTGRES_DB=hundunos
       - POSTGRES_USER=hundunos
       - POSTGRES_PASSWORD=${DB_PASSWORD}
     volumes:
       - postgres_data:/var/lib/postgresql/data
   
   redis:
     image: redis:7-alpine
     command: redis-server --requirepass ${REDIS_PASSWORD}
     volumes:
       - redis_data:/data
   
   volumes:
     postgres_data:
     redis_data:
   ```

2. **启动服务**
   ```bash
   docker-compose up -d
   ```

3. **验证服务运行**
   ```bash
   docker-compose ps
   docker-compose logs hundunos
   ```

---

## 🔍 部署后验证

### 健康检查

- [ ] **检查应用状态**
  ```bash
  curl http://localhost:3000/health
  ```

- [ ] **验证 API 响应**
  ```bash
  curl http://localhost:3000/api/status
  ```

- [ ] **检查数据库连接**
  ```bash
  curl http://localhost:3000/api/db/status
  ```

- [ ] **检查缓存连接**
  ```bash
  curl http://localhost:3000/api/cache/status
  ```

### 性能测试

- [ ] **运行负载测试**（使用 Apache Bench）
  ```bash
  ab -n 1000 -c 10 http://localhost:3000/api/status
  ```

- [ ] **监控响应时间**
  - 平均响应时间 < 200ms
  - P95 响应时间 < 500ms
  - P99 响应时间 < 1000ms

### 安全验证

- [ ] **验证 HTTPS 配置**（如使用）
  ```bash
  curl -I https://your-domain.com
  ```

- [ ] **检查 CORS 配置**
  ```bash
  curl -I -X OPTIONS http://localhost:3000/api/status \
    -H "Origin: http://example.com"
  ```

- [ ] **验证速率限制**
  ```bash
  # 快速发送多个请求，检查是否触发限流
  for i in {1..100}; do curl http://localhost:3000/api/status; done
  ```

---

## 📊 监控和日志

### 应用监控

- [ ] **配置日志收集**
  - 应用日志：`.hundunos/audit/audit.log`
  - 错误日志：查看控制台输出或 PM2 日志

- [ ] **设置性能监控**
  - 使用 OpenTelemetry 收集追踪数据
  - 配置告警阈值

### 系统监控

- [ ] **CPU 使用率** < 70%
- [ ] **内存使用率** < 80%
- [ ] **磁盘使用率** < 85%
- [ ] **网络连接数** 在正常范围内

---

## 🔄 回滚计划

### 回滚步骤

1. **停止当前服务**
   ```bash
   pm2 stop hundunos
   # 或
   docker-compose down
   ```

2. **恢复代码**
   ```bash
   git checkout <previous-version>
   ```

3. **恢复数据库**
   ```bash
   # 使用备份恢复
   psql -U hundunos hundunos < backup.sql
   ```

4. **重启服务**
   ```bash
   pm2 start hundunos
   # 或
   docker-compose up -d
   ```

---

## 📞 支持联系方式

- **技术支持**: support@hundunos.com
- **GitHub Issues**: https://github.com/hundunos/hundunos/issues
- **文档**: https://docs.hundunos.com

---

## ✅ 部署完成确认

部署完成后，请确认以下事项：

- [ ] 应用正常启动并响应请求
- [ ] 所有健康检查通过
- [ ] 性能指标在可接受范围内
- [ ] 安全配置已启用
- [ ] 监控和日志系统正常工作
- [ ] 备份策略已配置
- [ ] 回滚计划已准备

**部署完成时间**: _______________  
**部署人员**: _______________  
**验证人员**: _______________

---

*本文档由 HundunOS 自动化部署工具生成*  
*最后更新：2026-04-15*
