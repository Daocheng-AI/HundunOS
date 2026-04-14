# HundunOS 可观测性系统

HundunOS 提供了一个轻量级的可观测性系统，包括结构化日志和基础指标。

## 架构概览

```
kernel/observability/
├── logger.js    # 结构化日志系统
├── metrics.js   # 基础指标系统
└── README.md    # 本文档
```

## 结构化日志

### 使用方法

```javascript
import { StructuredLogger } from './kernel/observability/logger.js';

const logger = new StructuredLogger({
  level: 'info',
  format: 'json',
  context: { service: 'my-service' }
});

logger.info('Service started');
logger.warn('Warning message');
logger.error('Error message', { error: new Error('Something went wrong') });
```

### 日志级别

- `debug`: 调试信息
- `info`: 一般信息
- `warn`: 警告信息
- `error`: 错误信息

### 子日志记录器

```javascript
const childLogger = logger.child({ module: 'auth' });
childLogger.info('User logged in');
```

## 基础指标

### 使用方法

```javascript
import { globalRegistry } from './kernel/observability/metrics.js';

// 创建计数器
const requestCounter = globalRegistry.createCounter(
  'http_requests_total',
  'Total number of HTTP requests',
  ['method', 'path']
);

requestCounter.inc(1, { method: 'GET', path: '/api/users' });

// 创建仪表盘
const activeConnections = globalRegistry.createGauge(
  'active_connections',
  'Number of active connections'
);

activeConnections.set(10);

// 创建直方图
const requestDuration = globalRegistry.createHistogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds',
  ['method']
);

requestDuration.observe(0.123, { method: 'GET' });

// 导出 Prometheus 格式
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(globalRegistry.toPrometheus());
```

### 指标类型

- `counter`: 只增不减的计数器
- `gauge`: 可增可减的仪表盘
- `histogram`: 直方图（用于记录分布）

## Prometheus 集成

### 暴露指标端点

```javascript
import { globalRegistry } from './kernel/observability/metrics.js';

export function metricsHandler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.send(globalRegistry.toPrometheus());
}
```

### Prometheus 配置

```yaml
scrape_configs:
  - job_name: 'hundunos'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:38080']
```

## 最佳实践

1. **使用结构化日志**: 记录上下文信息
2. **适当的日志级别**: 根据重要性选择级别
3. **有意义的指标名称**: 使用清晰的命名约定
4. **标签使用**: 使用标签区分不同维度
5. **性能考虑**: 避免在高频路径中使用日志

## 示例

### 完整示例

```javascript
import { StructuredLogger } from './kernel/observability/logger.js';
import { globalRegistry } from './kernel/observability/metrics.js';

// 创建日志记录器
const logger = new StructuredLogger({
  level: 'info',
  format: 'json',
  context: { service: 'api' }
});

// 创建指标
const requestCounter = globalRegistry.createCounter(
  'http_requests_total',
  'Total number of HTTP requests',
  ['method', 'status']
);

// 处理请求
async function handleRequest(req, res) {
  const startTime = Date.now();

  try {
    logger.info('Request received', {
      method: req.method,
      path: req.path
    });

    // 处理请求逻辑...

    const duration = (Date.now() - startTime) / 1000;

    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration
    });

    requestCounter.inc(1, {
      method: req.method,
      status: res.statusCode
    });

  } catch (error) {
    logger.error('Request failed', {
      method: req.method,
      path: req.path,
      error: error.message
    });

    requestCounter.inc(1, {
      method: req.method,
      status: 500
    });

    throw error;
  }
}
```
