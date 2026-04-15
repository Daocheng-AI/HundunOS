# HundunOS v5 性能监控指南

本文档介绍如何使用 HundunOS 内置的性能监控和基准测试功能。

---

## 📋 目录

1. [OpenTelemetry 集成](#opentelemetry-集成)
2. [性能监控 API](#性能监控-api)
3. [基准测试](#基准测试)
4. [最佳实践](#最佳实践)

---

## 🔧 OpenTelemetry 集成

### 安装依赖

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node
```

**注意**: 依赖已添加到 `package.json`，运行 `npm install` 即可自动安装。

### 配置环境变量

在 `.env` 文件中添加以下配置：

```bash
# OpenTelemetry 配置
OTEL_SERVICE_NAME=hundunos
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SAMPLE_RATE=0.1
```

### 配置说明

| 环境变量 | 描述 | 默认值 | 必填 |
|---------|------|--------|------|
| `OTEL_SERVICE_NAME` | 服务名称 | `hundunos` | 否 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP 导出器端点 | 无 | 否 |
| `OTEL_SAMPLE_RATE` | 采样率 (0-1) | `0.1` | 否 |
| `OTEL_AUTH_TOKEN` | 认证令牌 | 无 | 否 |

---

## 📊 性能监控 API

### 基本使用

```javascript
import { PerformanceMonitor } from './kernel/performance-monitor.js';

const monitor = new PerformanceMonitor(kernel);
await monitor.initialize();

// 创建 Span
const span = monitor.startSpan('my.operation');
try {
  // 执行操作
  await doSomething();
  monitor.endSpan(span);
} catch (error) {
  monitor.endSpan(span, error);
  throw error;
}
```

### 使用辅助方法

```javascript
// 自动管理 Span 生命周期
await monitor.withSpan('database.query', async () => {
  return await db.query('SELECT * FROM users');
});

// 追踪数据库查询
await monitor.traceDatabaseQuery('SELECT * FROM users', async () => {
  return await db.query('SELECT * FROM users');
});

// 追踪 HTTP 请求
await monitor.traceHttpRequest('GET', '/api/users', async () => {
  return await fetch('/api/users');
});

// 追踪技能执行
await monitor.traceSkillExecution('weather-query', async () => {
  return await skill.execute('weather', { city: 'Beijing' });
});
```

### 记录指标

```javascript
monitor.recordMetric('api.response.time', 125, {
  endpoint: '/api/users',
  method: 'GET',
});
```

### 分布式追踪

```javascript
// 生成追踪上下文（用于跨服务传播）
const traceContext = monitor.generateTraceContext();

// 在另一个服务中恢复追踪
const ctx = monitor.extractTraceContext(traceContext);
const span = monitor.startSpan('downstream.operation', {
  parentContext: ctx,
});
```

---

## ⚡ 基准测试

### 运行基准测试

```bash
# 使用 npm 脚本
npm run benchmark

# 或直接运行
node kernel/v5/tests/benchmark.js
```

### 自定义基准测试

```javascript
import { BenchmarkRunner } from './kernel/v5/tests/benchmark.js';

const runner = new BenchmarkRunner({
  iterations: 100,  // 迭代次数
  warmup: 10,       // 预热次数
  timeout: 300000,  // 超时时间（毫秒）
});

await runner.setup();

// 运行单个测试
const result = await runner.runBenchmark('自定义测试', async (kernel) => {
  // 测试逻辑
  await kernel.plugins.get('cache').set('key', 'value');
});

// 查看结果
console.log(result.toJSON());

await runner.teardown();
```

### 基准测试结果示例

```
╔════════════════════════════════════════════════════════╗
║          HundunOS v5 性能基准测试总结                  ║
╚════════════════════════════════════════════════════════╝

测试时间：2026-04-15T10:30:00.000Z
总耗时：15.42 秒

详细结果:

┌─────────────────────────────┬──────────┬──────────┬──────────┬──────────┐
│ 测试名称                    │ 迭代次数 │ 平均 (ms) │ P95 (ms) │ 吞吐量   │
├─────────────────────────────┼──────────┼──────────┼──────────┼──────────┤
│ 密码哈希 (PBKDF2)           │      100 │   125.34 │   130.21 │    7.98  │
│ 缓存操作                    │      100 │     2.15 │     3.42 │  465.12  │
│ 事件发射                    │      100 │     0.85 │     1.23 │ 1176.47  │
│ 工具函数                    │      100 │     0.42 │     0.65 │ 2380.95  │
│ 安全策略检查                │      100 │     0.18 │     0.25 │ 5555.56  │
└─────────────────────────────┴──────────┴──────────┴──────────┴──────────┘

✅ 基准测试完成
```

---

## 🎯 最佳实践

### 1. 生产环境配置

**采样率设置**:
- 开发环境：`1.0` (100% 采样)
- 测试环境：`0.5` (50% 采样)
- 生产环境：`0.1` (10% 采样) 或更低

**导出器选择**:
- 开发：使用 `ConsoleSpanExporter`
- 生产：使用 `OTLPTraceExporter` 连接到 Jaeger/Zipkin

### 2. 性能优化建议

**密码哈希**:
- PBKDF2 默认迭代次数较高，可根据安全需求调整
- 考虑使用 bcrypt 或 argon2 作为替代方案

**缓存操作**:
- 使用 Redis 替代内存缓存提升性能
- 设置合理的 TTL 避免缓存堆积

**事件系统**:
- 异步事件处理避免阻塞主流程
- 使用事件池限制并发事件数量

### 3. 监控告警

建议设置以下监控指标：

```javascript
// 示例：监控操作耗时
const threshold = 1000; // 1 秒
const span = monitor.startSpan('operation');
const startTime = Date.now();

try {
  await doOperation();
} finally {
  const duration = Date.now() - startTime;
  if (duration > threshold) {
    console.warn(`操作耗时过长：${duration}ms`);
    // 发送告警通知
  }
  monitor.endSpan(span);
}
```

### 4. 持续集成

在 CI/CD 流水线中运行基准测试：

```yaml
# GitHub Actions 示例
- name: Run Benchmark Tests
  run: npm run benchmark

- name: Upload Benchmark Results
  uses: actions/upload-artifact@v3
  with:
    name: benchmark-results
    path: test-results/benchmark-results.json
```

---

## 📚 相关资源

- [OpenTelemetry 官方文档](https://opentelemetry.io/docs/)
- [OpenTelemetry Node.js SDK](https://github.com/open-telemetry/opentelemetry-js)
- [Jaeger 分布式追踪](https://www.jaegertracing.io/)
- [Zipkin 分布式追踪](https://zipkin.io/)

---

## 🔍 故障排查

### 常见问题

**Q: 没有看到追踪数据导出？**
- 检查 `OTEL_EXPORTER_OTLP_ENDPOINT` 是否配置正确
- 确认网络连接正常
- 查看控制台输出是否有错误日志

**Q: 基准测试结果不稳定？**
- 增加迭代次数和预热次数
- 确保测试环境资源充足
- 关闭其他占用资源的应用

**Q: 性能监控影响应用性能？**
- 降低采样率
- 使用异步导出器（BatchSpanProcessor）
- 减少不必要的 Span 创建

---

*最后更新：2026-04-15*
