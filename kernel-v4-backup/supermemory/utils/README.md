# Supermemory 工具函数

本目录包含 Supermemory 集成所需的工具函数。

## 工具模块

### Logger - 日志记录器

**文件**: `helpers.js`

**功能**:
- 支持不同日志级别（debug、info、warn、error）
- 结构化日志（JSON 格式）
- 敏感信息脱敏

**使用方式**:
```javascript
const { createLogger } = require('./utils/helpers.js');
const logger = createLogger('Supermemory', 'info');

logger.info('Supermemory initialized', { timestamp: Date.now() });
logger.error('API call failed', { error: err.message });
```

### ConfigValidator - 配置验证器

**文件**: `helpers.js`

**功能**:
- 配置验证
- API 密钥格式验证
- 参数校验

**使用方式**:
```javascript
const { ConfigValidator } = require('./utils/helpers.js');
const validation = ConfigValidator.validate(config);

if (!validation.valid) {
  console.error('配置验证失败:', validation.errors);
}
```

### Helpers - 辅助函数

**文件**: `helpers.js`

**功能**:
- Container Tag 生成
- 时间格式转换
- 数据转换
- 对象合并
- 字符串截断
- 延迟执行
- 重试机制

**使用方式**:
```javascript
const { Helpers } = require('./utils/helpers.js');

// 生成容器标签
const tag = Helpers.generateContainerTag('user', { userId: '123' });

// 格式化时间戳
const formatted = Helpers.formatTimestamp(Date.now());

// 计算时间差
const diff = Helpers.getTimeDiff(startTime, endTime);

// 深度克隆对象
const cloned = Helpers.deepClone(obj);

// 合并对象
const merged = Helpers.merge(target, source);

// 截断字符串
const truncated = Helpers.truncate(str, 100);

// 格式化字节大小
const size = Helpers.formatBytes(1024);

// 生成唯一 ID
const id = Helpers.generateId();

// 延迟执行
await Helpers.delay(1000);

// 重试函数
const result = await Helpers.retry(fn, { maxAttempts: 3, delay: 1000 });
```

## 导出

```javascript
const {
  Logger,
  ConfigValidator,
  Helpers,
  createLogger
} = require('./utils/helpers.js');
```
