# HundunOS v3.0 - 监控指南

## 目录

- [监控概览](#监控概览)
- [指标收集](#指标收集)
- [日志管理](#日志管理)
- [告警配置](#告警配置)
- [性能分析](#性能分析)
- [故障诊断](#故障诊断)

---

## 监控概览

HundunOS 提供完整的监控和可观测性解决方案，包括：

- **指标监控**: Prometheus + Grafana
- **日志聚合**: 结构化日志输出
- **健康检查**: 多维度健康状态
- **告警系统**: 可配置的告警规则
- **性能追踪**: 请求延迟和吞吐量

### 监控架构

```
┌─────────────┐
│  HundunOS   │
│   Metrics   │─────┐
│   Logs      │     │
│   Health    │─────┤
└─────────────┘     │
                    │
              ┌─────▼─────┐
              │ Prometheus│
              └─────┬─────┘
                    │
              ┌─────▼─────┐
              │  Grafana  │
              │ Dashboard │
              └───────────┘
```

---

## 指标收集

### 1. 系统指标

#### 内核指标

```javascript
// 暴露指标端点
GET /metrics

// 返回的指标示例：
# HELP hundunos_kernel_uptime Kernel uptime in seconds
# TYPE hundunos_kernel_uptime gauge
hundunos_kernel_uptime 3600

# HELP hundunos_modules_total Total number of modules
# TYPE hundunos_modules_total gauge
hundunos_modules_total 15

# HELP hundunos_modules_active Number of active modules
# TYPE hundunos_modules_active gauge
hundunos_modules_active 12

# HELP hundunos_requests_total Total number of requests
# TYPE hundunos_requests_total counter
hundunos_requests_total 12345

# HELP hundunos_requests_duration Request duration in milliseconds
# TYPE hundunos_requests_duration histogram
hundunos_requests_duration_bucket{le="10"} 1000
hundunos_requests_duration_bucket{le="50"} 5000
hundunos_requests_duration_bucket{le="100"} 9000
hundunos_requests_duration_bucket{le="+Inf"} 10000
```

#### 模块指标

```javascript
# 模块执行时间
hundunos_module_execution_duration{module="intent-engine"} 45.2

# 模块错误率
hundunos_module_errors_total{module="model-router",type="timeout"} 3

# 模块调用次数
hundunos_module_calls_total{module="file-reader"} 234
```

### 2. 健康指标

#### 10 维度健康检查

```javascript
GET /health

{
  "status": "healthy",
  "score": 95,
  "dimensions": {
    "modules": {
      "score": 100,
      "status": "healthy",
      "details": {
        "total": 15,
        "active": 12,
        "idle": 3,
        "error": 0
      }
    },
    "model-router": {
      "score": 90,
      "status": "healthy",
      "details": {
        "providers": {
          "ollama": {
            "available": true,
            "latency": 150
          },
          "anthropic": {
            "available": true,
            "latency": 320
          }
        }
      }
    },
    "memory": {
      "score": 85,
      "status": "degraded",
      "details": {
        "used": 1024,
        "total": 2048,
        "percentage": 50
      }
    },
    "tasks": {
      "score": 100,
      "status": "healthy",
      "details": {
        "pending": 0,
        "in_progress": 2,
        "completed": 145
      }
    }
  },
  "alerts": []
}
```

### 3. Prometheus 配置

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'hundunos'
    static_configs:
      - targets: ['hundunos:38080']
    metrics_path: /metrics
    scrape_interval: 10s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9182']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### 4. Grafana 仪表板

#### 导入预定义仪表板

1. 访问 Grafana: `http://localhost:3000`
2. 登录（默认用户名: admin，密码: admin）
3. 导航到 Dashboards → Import
4. 上传仪表板 JSON 文件或输入仪表板 ID

#### 系统概览仪表板

```json
{
  "dashboard": {
    "title": "HundunOS System Overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(hundunos_requests_total[5m])"
        }]
      },
      {
        "title": "Request Duration",
        "type": "graph",
        "targets": [{
          "expr": "histogram_quantile(0.95, hundunos_requests_duration_bucket)"
        }]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(hundunos_errors_total[5m])"
        }]
      },
      {
        "title": "Module Health",
        "type": "stat",
        "targets": [{
          "expr": "hundunos_health_score"
        }]
      }
    ]
  }
}
```

---

## 日志管理

### 1. 日志格式

#### 结构化日志

```json
{
  "timestamp": "2026-04-01T19:00:00.000Z",
  "level": "info",
  "message": "Request processed",
  "context": {
    "sessionId": "session_123",
    "intentType": "file_read",
    "latency": 45,
    "success": true
  }
}
```

#### 审计日志

```json
{
  "timestamp": "2026-04-01T19:00:00.000Z",
  "type": "audit",
  "action": "file_read",
  "userId": "user_001",
  "resource": "/workspace/file.txt",
  "result": "success",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}
```

### 2. 日志配置

```json
{
  "logging": {
    "level": "info",
    "format": "json",
    "outputs": {
      "console": {
        "enabled": true,
        "colorize": true
      },
      "file": {
        "enabled": true,
        "filename": "logs/hundunos.log",
        "maxSize": "100M",
        "maxFiles": 10,
        "datePattern": "YYYY-MM-DD"
      },
      "syslog": {
        "enabled": false,
        "host": "localhost",
        "port": 514
      }
    }
  }
}
```

### 3. 日志查询

#### 使用 grep 查询

```bash
# 查询错误日志
grep "level\":\"error" logs/hundunos.log

# 查询特定用户的操作
grep "userId\":\"user_001" logs/audit.log

# 查询慢请求
grep "latency\":1[0-9]{3}" logs/hundunos.log
```

#### 使用 jq 查询 JSON 日志

```bash
# 查询错误日志
jq 'select(.level=="error")' logs/hundunos.log

# 查询延迟超过 100ms 的请求
jq 'select(.context.latency > 100)' logs/hundunos.log

# 统计每小时的请求量
jq '[.timestamp[0:13]] | group_by(.) | map({time: .[0], count: length})'
```

### 4. 日志聚合

#### 使用 Loki 收集日志

```yaml
# monitoring/loki-config.yml
server:
  http_listen_port: 3100

clients:
  - url: http://localhost:3100/loki/api/v1/push

scrape_configs:
  - job_name: hundunos
    static_configs:
      - targets:
          - localhost
        labels:
          job: hundunos
          __path__: /app/logs/*.log
```

---

## 告警配置

### 1. 告警规则

```yaml
# monitoring/alerts.yml
groups:
  - name: hundunos_alerts
    interval: 30s
    rules:
      # 高错误率告警
      - alert: HighErrorRate
        expr: rate(hundunos_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      # 高延迟告警
      - alert: HighLatency
        expr: histogram_quantile(0.95, hundunos_requests_duration_bucket) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High request latency"
          description: "P95 latency is {{ $value }}ms"

      # 模块失败告警
      - alert: ModuleFailure
        expr: hundunos_module_errors_total > 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Module failure detected"
          description: "Module {{ $labels.module }} has errors"

      # 内存使用告警
      - alert: HighMemoryUsage
        expr: hundunos_memory_usage_percentage > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}%"

      # 健康分数告警
      - alert: LowHealthScore
        expr: hundunos_health_score < 70
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Low health score"
          description: "Health score is {{ $value }}"
```

### 2. 告警通知

#### 邮件通知

```yaml
# monitoring/alertmanager.yml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alerts@example.com'
  smtp_auth_username: 'alerts@example.com'
  smtp_auth_password: 'password'

route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h

receivers:
  - name: 'default-receiver'
    email_configs:
      - to: 'admin@example.com'
        headers:
          Subject: '[Alert] {{ .GroupLabels.alertname }}'
```

#### Webhook 通知

```yaml
receivers:
  - name: 'webhook-receiver'
    webhook_configs:
      - url: 'https://hooks.slack.com/services/...'
        send_resolved: true
```

---

## 性能分析

### 1. 请求追踪

```javascript
// 启用请求追踪
{
  "tracing": {
    "enabled": true,
    "sampleRate": 0.1,
    "exporter": "jaeger",
    "endpoint": "http://jaeger:14268/api/traces"
  }
}
```

### 2. 性能指标

#### 延迟指标

- **P50 延迟**: 50% 请求的延迟
- **P95 延迟**: 95% 请求的延迟
- **P99 延迟**: 99% 请求的延迟
- **最大延迟**: 最慢请求的延迟

#### 吞吐量指标

- **RPS (Requests Per Second)**: 每秒请求数
- **TPS (Transactions Per Second)**: 每秒事务数

#### 错误率指标

- **错误率**: 错误请求数 / 总请求数
- **成功率**: 成功请求数 / 总请求数

### 3. 性能分析工具

#### 使用 pprof 分析 CPU

```bash
# 生成 CPU profile
node --prof kernel/core.js

# 分析 profile
node --prof-process isolate-0xnnnnnnnnnnnn-v8.log > profile.txt
```

#### 使用 Chrome DevTools

```bash
# 启用 inspector
node --inspect kernel/core.js

# 打开 Chrome DevTools
chrome://inspect
```

---

## 故障诊断

### 1. 常见性能问题

#### 内存泄漏

**症状**: 内存使用持续增长

**诊断**:
```bash
# 检查内存使用
docker stats hundunos

# 查看内存快照
node --heap-prof kernel/core.js
```

**解决方案**:
- 定期重启服务
- 优化缓存策略
- 检查内存泄漏点

#### CPU 占用高

**症状**: CPU 使用率持续超过 80%

**诊断**:
```bash
# 查看 CPU profile
node --prof kernel/core.js

# 分析热点函数
node --prof-process isolate-0x*.log | sort -k2 -n
```

**解决方案**:
- 优化算法复杂度
- 使用缓存减少计算
- 异步处理耗时任务

#### 响应慢

**症状**: 请求延迟超过 1 秒

**诊断**:
```bash
# 查看慢查询日志
grep "latency\":1[0-9]{3}" logs/hundunos.log

# 分析追踪数据
curl http://localhost:38080/traces
```

**解决方案**:
- 优化数据库查询
- 增加缓存层
- 使用连接池

### 2. 诊断命令

#### 系统诊断

```bash
# 查看系统状态
curl http://localhost:38080/status

# 查看健康状态
curl http://localhost:38080/health

# 查看指标
curl http://localhost:38080/metrics

# 查看最近的日志
docker-compose logs --tail=100 hundunos
```

#### 模块诊断

```bash
# 列出所有模块
curl http://localhost:38080/api/modules

# 查看模块状态
curl http://localhost:38080/api/modules/intent-engine

# 测试模块
curl http://localhost:38080/api/modules/intent-engine/test
```

### 3. 故障排查流程

```
发现问题
    ↓
检查健康状态
    ↓
查看日志
    ↓
分析指标
    ↓
定位问题
    ↓
实施修复
    ↓
验证效果
```

---

## 最佳实践

### 1. 监控策略

- 监控关键指标
- 设置合理的阈值
- 及时响应告警
- 定期审查告警规则

### 2. 日志策略

- 使用结构化日志
- 记录足够的上下文
- 定期清理旧日志
- 敏感信息脱敏

### 3. 告警策略

- 避免告警疲劳
- 分级告警（critical, warning, info）
- 设置合理的通知频率
- 定期更新告警规则

---

## 联系支持

如遇到监控问题，请：

1. 查看监控文档
2. 检查日志文件
3. 分析指标数据
4. 联系支持团队

---

**文档版本**: v1.0
**最后更新**: 2026年4月1日
