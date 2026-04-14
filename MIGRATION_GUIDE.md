# HundunOS v4 到 v5 迁移指南

## 概述

HundunOS v5 引入了全新的微内核 + 插件架构，相比 v4 的 Mixin 模式有以下改进：

- **更好的性能**：支持懒加载、服务缓存、事件批量处理
- **更清晰的架构**：微内核设计，职责分离明确
- **更强的扩展性**：插件系统支持热插拔
- **更易于测试**：依赖注入使单元测试更简单

## 快速开始

### 1. 更新导入语句

**v4 代码：**
```javascript
import { HundunOS } from './kernel/hundunos.js';
```

**v5 代码：**
```javascript
// 方式1：使用兼容层（推荐迁移阶段使用）
import { createV4Adapter } from './kernel/v5/compat/v4-adapter.js';

// 方式2：直接使用 v5 API
import { createKernel, LoggerPlugin, SecurityPlugin } from './kernel/v5/index.js';
```

### 2. 初始化系统

**v4 代码：**
```javascript
const app = new HundunOS(config);
await app.initialize();
```

**v5 代码（兼容层）：**
```javascript
const app = createV4Adapter(config);
await app.initialize();
```

**v5 代码（原生 API）：**
```javascript
const kernel = createKernel(config);

// 注册插件
await kernel.plugins.register(LoggerPlugin);
await kernel.plugins.register(SecurityPlugin);
await kernel.plugins.register(CachePlugin);

// 初始化
await kernel.initialize();
```

### 3. 使用服务

**v4 代码：**
```javascript
const logger = app.getLogger('my-module');
const config = app.config('database.host');
```

**v5 代码（兼容层）：**
```javascript
// 完全相同
const logger = app.getLogger('my-module');
const config = app.config('database.host');
```

**v5 代码（原生 API）：**
```javascript
const logger = kernel.get('logger').child('my-module');
const config = kernel.get('config').get('database.host');
```

## Mixin 迁移

### 简单 Mixin

**v4 代码：**
```javascript
app.useMixin('myService', (ctx) => ({
  async doSomething() {
    ctx.logger.info('Doing something');
    return 'result';
  }
}));

// 使用
const service = app.getMixin('myService');
await service.doSomething();
```

**v5 代码（转换为 Plugin）：**
```javascript
import { BasePlugin } from './kernel/v5/core/BasePlugin.js';

class MyServicePlugin extends BasePlugin {
  get name() { return 'myService'; }
  get dependencies() { return ['logger']; }
  
  async onInit() {
    this.logger.info('MyService initialized');
  }
  
  async doSomething() {
    this.logger.info('Doing something');
    return 'result';
  }
}

// 注册
await kernel.plugins.register(MyServicePlugin);

// 使用
const service = kernel.plugins.get('myService');
await service.doSomething();
```

### 带依赖的 Mixin

**v4 代码：**
```javascript
app.useMixin('dataService', (ctx) => {
  const db = ctx.getMixin('database');
  
  return {
    async fetchData(id) {
      return db.query('SELECT * FROM data WHERE id = ?', [id]);
    }
  };
});
```

**v5 代码：**
```javascript
class DataServicePlugin extends BasePlugin {
  get name() { return 'dataService'; }
  get dependencies() { return ['logger', 'database']; }
  
  async onInit() {
    this.db = this.kernel.get('db');
  }
  
  async fetchData(id) {
    return this.db.query('SELECT * FROM data WHERE id = ?', [id]);
  }
}
```

## Phase 迁移

**v4 代码：**
```javascript
app.onPhase('services', async () => {
  // 注册服务
});

app.onPhase('routes', async () => {
  // 设置路由
});
```

**v5 代码：**
```javascript
// 方式1：使用插件生命周期
class MyPlugin extends BasePlugin {
  async onInit() {
    // 相当于 'services' phase
    this.kernel.services.register('myService', () => ({}));
  }
}

// 方式2：监听事件
kernel.events.on('kernel:initialized', async () => {
  // 系统初始化完成后
});

// 方式3：使用兼容层
import { createV4Adapter } from './kernel/v5/compat/v4-adapter.js';
const app = createV4Adapter(config);
app.onPhase('services', async () => {
  // 完全兼容 v4 API
});
```

## 事件系统迁移

**v4 代码：**
```javascript
app.on('user:login', (data) => {
  console.log(`User ${data.userId} logged in`);
});

app.emit('user:login', { userId: 123 });
```

**v5 代码（兼容层）：**
```javascript
// 完全相同
app.on('user:login', (data) => {
  console.log(`User ${data.userId} logged in`);
});

app.emit('user:login', { userId: 123 });
```

**v5 代码（原生 API）：**
```javascript
// 使用 events 服务
const events = kernel.get('events');

const subscription = events.on('user:login', (data) => {
  console.log(`User ${data.userId} logged in`);
});

// 取消订阅
subscription.unsubscribe();

// 触发事件
await events.emit('user:login', { userId: 123 });
```

## 服务注册迁移

**v4 代码：**
```javascript
app.register('myService', () => {
  return {
    method1() {},
    method2() {}
  };
});
```

**v5 代码：**
```javascript
kernel.services.register('myService', () => {
  return {
    method1() {},
    method2() {}
  };
}, { singleton: true, lazy: true });  // 支持更多选项
```

## 配置迁移

**v4 代码：**
```javascript
const dbHost = app.config('database.host', 'localhost');
app.config.set('feature.enabled', true);
```

**v5 代码：**
```javascript
const config = kernel.get('config');
const dbHost = config.get('database.host', 'localhost');
config.set('feature.enabled', true);

// 监听配置变化
config.watch('feature.enabled', (event) => {
  console.log(`Config changed: ${event.key} = ${event.newValue}`);
});
```

## 安全功能迁移

**v4 代码：**
```javascript
// 手动实现或分散在各处
function sanitize(input) {
  return input.replace(/[<>]/g, '');
}
```

**v5 代码：**
```javascript
const security = kernel.get('security');

// 输入清理
const clean = security.sanitize.sanitize(dirtyInput, 'string');
const safePath = security.sanitize.sanitize(userPath, 'path');

// CORS 验证
const cors = kernel.get('security.cors');
const allowed = cors.validateOrigin(requestOrigin);

// 限流
const rateLimit = kernel.get('security.rateLimit');
const result = rateLimit.check(userId, { maxRequests: 100, windowMs: 60000 });
if (!result.allowed) {
  return { error: 'Rate limit exceeded' };
}
```

## 缓存迁移

**v4 代码：**
```javascript
// 通常需要手动实现或使用外部库
const cache = new Map();
```

**v5 代码：**
```javascript
const cache = kernel.get('cache');

// 基本操作
await cache.set('key', 'value', 3600);  // TTL: 1小时
const value = await cache.get('key');
await cache.delete('key');

// 自动缓存
const data = await cache.remember('expensive-query', 300, async () => {
  return await fetchDataFromDatabase();
});

// 标签缓存
const userCache = cache.tags(['users', 'active']);
await userCache.set('user:123', userData);
await userCache.flush();  // 清除所有带这些标签的缓存
```

## 数据库迁移

**v4 代码：**
```javascript
// 各 Mixin 自行管理数据库连接
```

**v5 代码：**
```javascript
// 注册 DatabasePlugin
await kernel.plugins.register(DatabasePlugin);

const db = kernel.get('db');

// 查询
const users = await db.query('SELECT * FROM users WHERE active = ?', [true]);

// 事务
await db.transaction(async (trx) => {
  await trx.query('INSERT INTO orders ...');
  await trx.query('UPDATE inventory ...');
});

// 健康检查
const health = await db.healthCheck();
console.log(health.healthy);  // true/false
```

## 性能优化建议

### 1. 使用懒加载

```javascript
// 标记服务为懒加载，首次使用时才初始化
kernel.services.register('heavyService', () => {
  return new HeavyResource();
}, { lazy: true });
```

### 2. 使用缓存

```javascript
const cache = kernel.get('cache');

// 缓存频繁访问的数据
const data = await cache.remember('config:all', 60, async () => {
  return await loadConfigFromDisk();
});
```

### 3. 批量事件处理

```javascript
// 收集多个事件后批量处理
const events = kernel.get('events');
const batch = [];

events.on('data:update', (data) => {
  batch.push(data);
  
  if (batch.length >= 100) {
    processBatch([...batch]);
    batch.length = 0;
  }
});
```

## 常见问题

### Q: 我可以混合使用 v4 和 v5 API 吗？

A: 可以。通过兼容层，你可以逐步迁移代码，一次一个 Mixin。

### Q: v5 是否向后兼容？

A: 不完全。v5 使用 ESM 模块，某些 API 有变化。建议使用兼容层进行平滑迁移。

### Q: 迁移需要多长时间？

A: 取决于项目规模。建议：
1. 第1周：设置兼容层，验证基本功能
2. 第2-3周：逐个迁移 Mixin
3. 第4周：全面测试，移除兼容层

### Q: 如何调试迁移问题？

A: 启用详细日志：
```javascript
const kernel = createKernel({
  logger: { level: 'debug' }
});
```

## 完整示例

### v4 代码
```javascript
import { HundunOS } from './kernel/hundunos.js';

const app = new HundunOS({
  database: { host: 'localhost', port: 5432 }
});

app.useMixin('userService', (ctx) => ({
  async getUser(id) {
    const db = ctx.getMixin('database');
    return db.query('SELECT * FROM users WHERE id = ?', [id]);
  }
}));

app.onPhase('routes', () => {
  app.get('/users/:id', async (req, res) => {
    const service = app.getMixin('userService');
    const user = await service.getUser(req.params.id);
    res.json(user);
  });
});

await app.initialize();
```

### v5 代码
```javascript
import { createKernel, LoggerPlugin, SecurityPlugin } from './kernel/v5/index.js';
import { DatabasePlugin } from './kernel/v5/plugins/features/DatabasePlugin.js';
import { BasePlugin } from './kernel/v5/core/BasePlugin.js';

// 定义 UserService 插件
class UserServicePlugin extends BasePlugin {
  get name() { return 'userService'; }
  get dependencies() { return ['logger', 'db']; }
  
  async onInit() {
    this.db = this.kernel.get('db');
    this.cache = this.kernel.get('cache');
  }
  
  async getUser(id) {
    // 使用缓存
    return this.cache.remember(`user:${id}`, 300, async () => {
      const users = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
      return users[0];
    });
  }
}

// 初始化内核
const kernel = createKernel({
  database: { host: 'localhost', port: 5432 }
});

// 注册插件
await kernel.plugins.register(LoggerPlugin);
await kernel.plugins.register(SecurityPlugin);
await kernel.plugins.register(DatabasePlugin);
await kernel.plugins.register(UserServicePlugin);

// 初始化
await kernel.initialize();

// 设置路由
const userService = kernel.plugins.get('userService');
app.get('/users/:id', async (req, res) => {
  const security = kernel.get('security.sanitize');
  const id = security.sanitize(req.params.id, 'string');
  
  const user = await userService.getUser(id);
  res.json(user);
});
```

## 总结

迁移到 v5 需要一些工作，但带来的好处是显著的：

1. **更好的性能**：懒加载、缓存、批量处理
2. **更清晰的代码**：插件架构职责明确
3. **更易测试**：依赖注入使测试更简单
4. **更强扩展性**：新功能以插件形式添加

建议采用渐进式迁移策略，使用兼容层确保业务连续性。
