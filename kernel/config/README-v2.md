# HundunOS 配置系统

HundunOS 采用基于 Schema 的配置系统，灵感来源于 n8n 的配置架构。该系统支持：

- Schema 驱动的配置类定义
- 环境变量自动映射
- Zod schema 验证
- 类型转换（布尔值、数字、数组等）
- 与现有 JSON 配置向后兼容
- 配置合并策略（Schema 配置优先）

## 架构概览

```
kernel/config/
├── schema-config.js        # 配置类定义（基于 Schema）
├── config-loader-v2.js     # 配置加载器
└── README-v2.md           # 本文档
```

## 使用方法

### 1. 基本用法

```javascript
import { ConfigLoader } from './kernel/config/config-loader-v2.js';

// 加载配置
const config = ConfigLoader.load('.', 'development');

console.log(config.kernel.logLevel);     // 'info'
console.log(config.restApi.port);        // 38080
console.log(config.modelRouter.strategy); // 'COST_FIRST'
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
console.log(config.kernel.logLevel); // 'debug'
console.log(config.kernel.debug);   // true
```

### 3. 创建自定义配置类

```javascript
import { BaseConfig } from './kernel/config/schema-config.js';
import { z } from 'zod';

export class MyCustomConfig extends BaseConfig {
  static getProperties() {
    return {
      myVar: {
        envName: 'MY_CUSTOM_VAR',
        defaultValue: 'default'
      },
      myNumber: {
        envName: 'MY_CUSTOM_NUMBER',
        defaultValue: 42,
        schema: z.coerce.number().int().gte(0)
      },
      myBool: {
        envName: 'MY_CUSTOM_BOOL',
        defaultValue: false,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      }
    };
  }
}

// 使用
const config = MyCustomConfig.create();
console.log(config.myVar);    // 'default'
console.log(config.myNumber); // 42
console.log(config.myBool);   // false
```

### 4. 使用 Zod Schema 验证

```javascript
import { BaseConfig } from './kernel/config/schema-config.js';
import { z } from 'zod';

export class ServiceConfig extends BaseConfig {
  static getProperties() {
    const portSchema = z.coerce.number().int().gte(1).lte(65535);
    const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

    return {
      port: {
        envName: 'SERVICE_PORT',
        defaultValue: 8080,
        schema: portSchema
      },
      logLevel: {
        envName: 'SERVICE_LOG_LEVEL',
        defaultValue: 'info',
        schema: logLevelSchema
      }
    };
  }
}
```

### 5. 嵌套配置

```javascript
import { BaseConfig } from './kernel/config/schema-config.js';

export class DatabaseConfig extends BaseConfig {
  static getProperties() {
    return {
      host: {
        envName: 'DB_HOST',
        defaultValue: 'localhost'
      },
      port: {
        envName: 'DB_PORT',
        defaultValue: 5432,
        schema: z.coerce.number().int().gte(1).lte(65535)
      }
    };
  }
}

export class AppConfig extends BaseConfig {
  static getProperties() {
    return {
      database: {
        envName: null,
        defaultValue: DatabaseConfig.create()
      },
      name: {
        envName: 'APP_NAME',
        defaultValue: 'MyApp'
      }
    };
  }
}
```

## 配置优先级

配置加载器按照以下优先级合并配置：

1. **Schema 配置**（环境变量）- 最高优先级
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

## 配置属性定义

每个配置属性通过 `getProperties()` 方法定义：

```javascript
{
  envName: 'ENV_VAR_NAME',      // 环境变量名称（null 表示不映射）
  defaultValue: 'default',      // 默认值
  schema: z.string(),           // 可选的 Zod schema 验证
  transform: (value) => value   // 可选的转换函数
}
```

### 类型转换

系统自动处理常见类型转换：

- **布尔值**: `'true'`, `'1'` → `true`; `'false'`, `'0'` → `false`
- **数字**: 使用 `z.coerce.number()` 自动转换
- **数组**: 逗号分隔的字符串自动转换为数组

```javascript
// 布尔值
{
  envName: 'DEBUG',
  defaultValue: false,
  transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
}

// 数字
{
  envName: 'PORT',
  defaultValue: 8080,
  schema: z.coerce.number().int().gte(1).lte(65535)
}

// 数组
{
  envName: 'ALLOWED_ORIGINS',
  defaultValue: ['http://localhost:8080'],
  transform: (value) => String(value).split(',').map(s => s.trim())
}
```

## 配置验证

配置加载器会自动验证配置：

- 必填字段检查
- 类型验证（通过 Zod schema）
- 环境特定安全检查（生产环境）

### 验证失败行为

当验证失败时，系统会：
1. 输出警告信息
2. 回退到默认值
3. 继续运行（不会中断）

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
import { ConfigLoader } from './kernel/config/config-loader-v2.js';
const config = ConfigLoader.load('.', 'development');
```

## 可用配置类

### 核心配置类

- `GlobalConfig` - 全局配置
- `KernelConfig` - 内核配置
- `ModelRouterConfig` - 模型路由器配置
- `RestApiConfig` - REST API 配置
- `StorageConfig` - 存储配置

### 子配置类

- `CircuitBreakerConfig` - 熔断器配置
- `OpenAIConfig` - OpenAI 配置
- `AnthropicConfig` - Anthropic 配置
- `GLMConfig` - GLM 配置
- `CorsConfig` - CORS 配置
- `PlatformConfig` - 平台配置
- `MessageBusConfig` - 消息总线配置
- `ToolBridgeConfig` - 工具桥接配置
- `SkillsConfig` - 技能配置
- `LoggingConfig` - 日志配置
- `RustModulesConfig` - Rust 模块配置

## 测试

运行配置系统测试：

```bash
node scripts/test-config-v2.js
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
import { BaseConfig } from './kernel/config/schema-config.js';
import { z } from 'zod';

// 定义 schema
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
const portSchema = z.coerce.number().int().gte(1).lte(65535);

// 子配置
export class LoggingConfig extends BaseConfig {
  static getProperties() {
    return {
      level: {
        envName: 'LOG_LEVEL',
        defaultValue: 'info',
        schema: logLevelSchema
      },
      format: {
        envName: 'LOG_FORMAT',
        defaultValue: 'pretty'
      }
    };
  }
}

// 主配置
export class MyServiceConfig extends BaseConfig {
  static getProperties() {
    return {
      name: {
        envName: 'SERVICE_NAME',
        defaultValue: 'MyService'
      },
      port: {
        envName: 'SERVICE_PORT',
        defaultValue: 8080,
        schema: portSchema
      },
      debug: {
        envName: 'SERVICE_DEBUG',
        defaultValue: false,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      logging: {
        envName: null,
        defaultValue: LoggingConfig.create()
      }
    };
  }

  // 自定义清理方法
  sanitize() {
    if (this.debug && this.logging.level !== 'debug') {
      console.warn('Debug mode enabled but log level is not debug');
    }
  }
}

// 使用
const config = MyServiceConfig.create();
console.log(config.name);         // 'MyService'
console.log(config.port);         // 8080
console.log(config.logging.level); // 'info'
```

## 故障排除

### 问题：配置未生效

**解决方案**：
1. 检查环境变量名称是否正确
2. 确保在创建配置实例前设置环境变量
3. 使用 `process.env.XXX` 直接检查环境变量值
4. 查看控制台警告信息

### 问题：类型验证失败

**解决方案**：
1. 检查 Zod schema 定义
2. 确保环境变量值符合 schema 要求
3. 查看控制台警告信息（会显示具体的验证错误）

### 问题：配置值不正确

**解决方案**：
1. 检查默认值设置
2. 验证转换函数逻辑
3. 确认配置优先级（Schema 配置优先）

## API 参考

### ConfigLoader

#### `ConfigLoader.load(baseDir, env)`
加载配置

- `baseDir` (string): 项目根目录
- `env` (string): 环境名称（可选）
- 返回: 配置对象

#### `ConfigLoader.getConfigStats(config)`
获取配置统计信息

- `config` (Object): 配置对象
- 返回: 统计信息对象

#### `ConfigLoader.createEnvTemplate(environment)`
创建环境变量模板

- `environment` (string): 环境名称
- 返回: 环境变量对象

#### `ConfigLoader.validateJsonFile(filePath)`
验证 JSON 配置文件

- `filePath` (string): 文件路径
- 返回: 验证结果对象

### BaseConfig

#### `BaseConfig.create()`
创建配置实例

- 返回: 配置对象

#### `BaseConfig.getProperties()`
获取配置属性定义（子类需重写）

- 返回: 配置属性对象

## 参考资料

- [n8n 配置系统](https://github.com/n8n-io/n8n)
- [Zod 文档](https://zod.dev/)
- [环境变量最佳实践](https://12factor.net/config)
