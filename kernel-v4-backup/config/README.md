# HundunOS 配置系统

HundunOS 采用装饰器驱动的配置系统，灵感来源于 n8n 的配置架构。该系统支持：

- 装饰器驱动的配置类定义
- 环境变量自动映射
- Zod schema 验证
- 与现有 JSON 配置向后兼容
- 配置合并策略（装饰器优先）

## 架构概览

```
kernel/config/
├── decorators.js          # 装饰器实现 (@Config, @Env, @Nested)
├── global.config.js       # 全局配置类
├── kernel.config.js       # 内核配置类
├── model-router.config.js # 模型路由器配置类
├── rest-api.config.js     # REST API 配置类
├── storage.config.js      # 存储配置类
├── config-loader.js       # 配置加载器
└── config-loader.test.js  # 单元测试
```

## 使用方法

### 1. 基本用法

```javascript
import { ConfigLoader } from './kernel/config/config-loader.js';

// 加载配置
const config = ConfigLoader.load('.', 'development');

// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(config.kernel.logLevel);     // 'info'
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(config.restApi.port);        // 38080
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(config.modelRouter.strategy); // 'COST_FIRST'
```

### 2. 使用环境变量

设置环境变量来覆盖默认配置：

```bash
# .env 文件
HUNDUNOS_LOG_LEVEL=debug
HUNDUNOS_DEBUG=true
REST_API_PORT=39000
```

或者在代码中：

```javascript
process.env.HUNDUNOS_LOG_LEVEL = 'debug';
process.env.HUNDUNOS_DEBUG = 'true';

const config = ConfigLoader.load('.', 'development');
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(config.kernel.logLevel); // 'debug'
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(config.kernel.debug);   // true
```

### 3. 创建自定义配置类

```javascript
import { Config, Env, Nested } from './kernel/config/decorators.js';

@Config
export class MyCustomConfig {
  @Env('MY_CUSTOM_VAR')
  myVar = 'default';

  @Env('MY_CUSTOM_NUMBER')
  myNumber = 42;

  @Env('MY_CUSTOM_BOOL')
  myBool = false;
}
```

### 4. 使用 Zod Schema 验证

```javascript
import { Config, Env } from './kernel/config/decorators.js';
import { z } from 'zod';

const portSchema = z.coerce.number().int().gte(1).lte(65535);

@Config
export class ServiceConfig {
  @Env('SERVICE_PORT', portSchema)
  port = 8080;
}
```

### 5. 嵌套配置

```javascript
import { Config, Env, Nested } from './kernel/config/decorators.js';

@Config
export class DatabaseConfig {
  @Env('DB_HOST')
  host = 'localhost';

  @Env('DB_PORT')
  port = 5432;
}

@Config
export class AppConfig {
  @Nested
  database = new DatabaseConfig();

  @Env('APP_NAME')
  name = 'MyApp';
}
```

## 配置优先级

配置加载器按照以下优先级合并配置：

1. **装饰器配置**（环境变量）- 最高优先级
2. **环境特定 JSON 配置**（如 `system.production.json`）
3. **基础 JSON 配置**（`system.json`）

## 环境变量文件支持

支持 `.env` 文件和 `_FILE` 后缀：

```bash
# 直接设置
API_KEY=your-api-key

# 从文件读取
API_KEY_FILE=/path/to/api-key.txt
```

## 可用装饰器

### @Config

类装饰器，标记配置类：

```javascript
@Config
export class MyConfig {
  // 配置属性
}
```

### @Env

属性装饰器，映射到环境变量：

```javascript
@Env('MY_VAR')
myVar = 'default';

@Env('MY_VAR', mySchema)
myVar = 'default'; // 使用 Zod schema 验证
```

### @Nested

属性装饰器，标记嵌套配置类：

```javascript
@Nested
nested = new NestedConfig();
```

## 配置验证

配置加载器会自动验证配置：

- 必填字段检查
- 类型验证（通过 Zod schema）
- 环境特定安全检查（生产环境）

## 迁移指南

### 从 JSON 配置迁移

1. 安装依赖：
```bash
npm install reflect-metadata zod
```

2. 创建 `.env` 文件（参考 `.env.example`）

3. 设置环境变量：

```bash
# 开发环境
NODE_ENV=development
HUNDUNOS_LOG_LEVEL=debug

# 生产环境
NODE_ENV=production
HUNDUNOS_LOG_LEVEL=info
STORAGE_ENCRYPT_BACKUPS=true
```

4. 代码中使用新的配置加载器：

```javascript
// 旧方式
import { ConfigLoader } from './config/config-loader.js';
const config = ConfigLoader.load('.', 'development');

// 新方式（兼容旧方式）
import { ConfigLoader } from './kernel/config/config-loader.js';
const config = ConfigLoader.load('.', 'development');
```

## 测试

运行配置系统测试：

```bash
npm test -- kernel/config/config-loader.test.js
```

## 最佳实践

1. **使用环境变量**：敏感信息（如 API 密钥）应该通过环境变量设置
2. **添加验证**：使用 Zod schema 验证关键配置项
3. **提供默认值**：为所有配置项提供合理的默认值
4. **文档化配置**：在配置类中添加 JSDoc 注释
5. **环境特定配置**：区分开发、测试、生产环境配置

## 示例

### 完整示例

```javascript
import { Config, Env, Nested } from './kernel/config/decorators.js';
import { z } from 'zod';

// 定义 schema
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
const portSchema = z.coerce.number().int().gte(1).lte(65535);

// 嵌套配置
@Config
export class LoggingConfig {
  @Env('LOG_LEVEL', logLevelSchema)
  level = 'info';

  @Env('LOG_FORMAT')
  format = 'pretty';
}

// 主配置
@Config
export class MyServiceConfig {
  @Env('SERVICE_NAME')
  name = 'MyService';

  @Env('SERVICE_PORT', portSchema)
  port = 8080;

  @Env('SERVICE_DEBUG')
  debug = false;

  @Nested
  logging = new LoggingConfig();

  // 自定义清理方法
  sanitize() {
    if (this.debug && this.logging.level !== 'debug') {
      console.warn('Debug mode enabled but log level is not debug');
    }
  }
}

// 使用
const config = MyServiceConfig();
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(config.name);        // 'MyService'
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(config.port);        // 8080
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(config.logging.level); // 'info'
```

## 故障排除

### 问题：装饰器不工作

**解决方案**：确保在入口文件顶部导入 `reflect-metadata`：

```javascript
import 'reflect-metadata';
import { Config } from './kernel/config/decorators.js';
```

### 问题：环境变量未生效

**解决方案**：
1. 检查环境变量名称是否正确
2. 确保在创建配置实例前设置环境变量
3. 使用 `process.env.XXX` 直接检查环境变量值

### 问题：类型验证失败

**解决方案**：
1. 检查 Zod schema 定义
2. 确保环境变量值符合 schema 要求
3. 查看控制台警告信息

## 参考资料

- [n8n 配置系统](https://github.com/n8n-io/n8n)
- [Zod 文档](https://zod.dev/)
- [Reflect Metadata](https://github.com/rbuckton/reflect-metadata)
