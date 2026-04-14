# HundunOS 依赖注入容器

HundunOS 采用轻量级的依赖注入（DI）容器，灵感来源于 n8n 的 DI 架构。该容器支持：

- 自动依赖解析
- 单例模式
- 工厂函数
- 循环依赖检测
- 服务注册和获取

## 架构概览

```
kernel/di/
├── container.js          # DI 容器实现
├── service-registrar.js  # 服务注册器
├── services/             # 服务实现
│   ├── logger.service.js
│   ├── config.service.js
│   └── kernel.service.js
└── README.md            # 本文档
```

## 使用方法

### 1. 注册服务

```javascript
import { registerService, registerFactory, registerValue } from './kernel/di/container.js';
import { MyService } from './services/my.service.js';
import { LoggerService } from './services/logger.service.js';

// 注册普通服务
registerService(MyService);

// 注册工厂函数
registerFactory(
  MyService,
  (loggerService) => {
    return new MyService(loggerService);
  },
  [LoggerService]  // 依赖列表
);

// 注册值（常量）
registerValue(MyService, myInstance);
```

### 2. 获取服务实例

```javascript
import { getService } from './kernel/di/service-registrar.js';
import { MyService } from './services/my.service.js';

const myService = getService(MyService);
myService.doSomething();
```

### 3. 创建服务类

```javascript
/**
 * 我的服务类
 */
export class MyService {
  /**
   * 构造函数
   * @param {LoggerService} logger - 日志服务
   * @param {ConfigService} config - 配置服务
   */
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
  }

  doSomething() {
    this.logger.info('Doing something...');
  }
}
```

### 4. 使用服务注册器

```javascript
import { registerCoreServices, getService } from './kernel/di/service-registrar.js';

// 注册所有核心服务
registerCoreServices();

// 获取服务实例
const kernel = getService(KernelService);
await kernel.start();
```

## 核心 API

### Container

#### `Container.registerService(type, options)`
注册服务

- `type` (Function): 服务类
- `options` (Object): 注册选项
  - `factory` (Function): 工厂函数
  - `singleton` (boolean): 是否单例（默认 true）
  - `dependencies` (Function[]): 依赖列表

#### `Container.get(type)`
获取服务实例

- `type` (Function): 服务类
- 返回: 服务实例

#### `Container.has(type)`
检查服务是否已注册

- `type` (Function): 服务类
- 返回: boolean

#### `Container.set(type, instance)`
手动设置服务实例

- `type` (Function): 服务类
- `instance` (any): 服务实例

#### `Container.reset()`
重置容器（清除所有实例）

#### `Container.clear()`
清空容器（清除所有注册）

#### `Container.getStats()`
获取容器统计信息

- 返回: 统计信息对象

### Service Registrar

#### `registerCoreServices()`
注册所有核心服务

#### `getService(ServiceClass)`
获取服务实例

#### `setService(ServiceClass, instance)`
手动设置服务实例

#### `hasService(ServiceClass)`
检查服务是否已注册

#### `resetContainer()`
重置容器

#### `getContainerStats()`
获取容器统计信息

## 服务示例

### LoggerService

```javascript
import { getService } from './kernel/di/service-registrar.js';
import { LoggerService } from './kernel/di/service-registrar.js';

const logger = getService(LoggerService);

logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

### ConfigService

```javascript
import { getService } from './kernel/di/service-registrar.js';
import { ConfigService } from './kernel/di/service-registrar.js';

const config = getService(ConfigService);

// 设置配置
config.set('app.name', 'HundunOS');
config.set('app.version', '3.6.0');

// 获取配置
const name = config.get('app.name');
const version = config.get('app.version');
```

### KernelService

```javascript
import { getService } from './kernel/di/service-registrar.js';
import { KernelService } from './kernel/di/service-registrar.js';

const kernel = getService(KernelService);

// 启动内核
await kernel.start();

// 获取状态
const status = kernel.getStatus();
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('Kernel is running:', status.isRunning);

// 停止内核
await kernel.stop();
```

## 依赖注入模式

### 1. 构造函数注入

```javascript
export class MyService {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
  }
}
```

### 2. 工厂函数注入

```javascript
registerFactory(
  MyService,
  (logger, config) => {
    return new MyService(logger, config);
  },
  [LoggerService, ConfigService]
);
```

### 3. 值注入

```javascript
const myConfig = { key: 'value' };
registerValue(MyConfig, myConfig);
```

## 最佳实践

1. **使用服务注册器**: 通过 `service-registrar.js` 统一管理服务注册
2. **明确依赖关系**: 在注册时明确指定依赖列表
3. **使用单例模式**: 大多数服务应该是单例
4. **避免循环依赖**: 设计服务时避免循环依赖
5. **使用工厂函数**: 对于复杂的初始化逻辑使用工厂函数

## 测试

运行 DI 容器测试：

```bash
node scripts/test-di.js
```

## 故障排除

### 问题：服务未注册

**解决方案**：
1. 确保调用了 `registerCoreServices()`
2. 检查服务类是否正确导出
3. 使用 `hasService()` 检查服务是否已注册

### 问题：依赖解析失败

**解决方案**：
1. 检查依赖列表是否正确
2. 确保所有依赖都已注册
3. 查看错误信息中的依赖链

### 问题：循环依赖

**解决方案**：
1. 重新设计服务架构，避免循环依赖
2. 使用事件系统解耦服务
3. 考虑使用服务定位器模式

## 参考资料

- [n8n DI 实现](https://github.com/n8n-io/n8n)
- [依赖注入模式](https://en.wikipedia.org/wiki/Dependency_injection)
- [InversifyJS](https://inversify.io/)
