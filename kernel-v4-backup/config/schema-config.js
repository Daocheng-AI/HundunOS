// hundunos/kernel/config/schema-config.js
// 基于 Schema 的配置系统（不使用装饰器）

import { readFileSync } from 'fs';
import { z } from 'zod';

/**
 * 读取环境变量（支持 _FILE 后缀）
 * @param {string} envName - 环境变量名称
 * @returns {string|undefined} 环境变量值
 */
const readEnv = (envName) => {
  if (envName in process.env) return process.env[envName];

  // 如果定义了 _FILE 环境变量，从文件读取
  const filePath = process.env[`${envName}_FILE`];
  if (filePath) {
    try {
      const value = readFileSync(filePath, 'utf8');
      if (value !== value.trim()) {
        console.warn(
          `[HundunOS] Warning: The file specified by ${envName}_FILE contains leading or trailing whitespace, which may cause authentication failures.`
        );
      }
      return value;
    } catch (error) {
      console.error(`[HundunOS] Error reading file ${filePath}:`, error.message);
      return undefined;
    }
  }

  return undefined;
};

/**
 * 配置属性定义
 * @typedef {Object} ConfigProperty
 * @property {string} envName - 环境变量名称
 * @property {*} defaultValue - 默认值
 * @property {z.ZodType} [schema] - Zod 验证 schema
 * @property {Function} [transform] - 转换函数
 */

/**
 * 配置类基类
 */
export class BaseConfig {
  /**
   * 获取配置属性定义
   * @returns {Object<string, ConfigProperty>} 配置属性定义
   */
  static getProperties() {
    return {};
  }

  /**
   * 创建配置实例
   * @returns {Object} 配置对象
   */
  static create() {
    const properties = this.getProperties();
    const config = {};

    for (const [key, property] of Object.entries(properties)) {
      const value = this._loadProperty(property);
      config[key] = value;
    }

    // 调用 sanitize 方法（如果存在）
    if (typeof config.sanitize === 'function') {
      config.sanitize();
    }

    return config;
  }

  /**
   * 加载配置属性
   * @param {ConfigProperty} property - 配置属性定义
   * @returns {*} 配置值
   */
  static _loadProperty(property) {
    const { envName, defaultValue, schema, transform } = property;

    // 尝试从环境变量读取
    let value = readEnv(envName);

    if (value === undefined) {
      return defaultValue;
    }

    // 应用转换函数
    if (transform) {
      value = transform(value);
    }

    // 应用 schema 验证
    if (schema) {
      const result = schema.safeParse(value);
      if (result.error) {
        console.warn(
          `[HundunOS] Invalid value for ${envName} - ${result.error.issues[0].message}. Falling back to default value.`
        );
        return defaultValue;
      }
      return result.data;
    }

    return value;
  }
}

/**
 * 内核配置类
 */
export class KernelConfig extends BaseConfig {
  static getProperties() {
    const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

    return {
      logLevel: {
        envName: 'HUNDUNOS_LOG_LEVEL',
        defaultValue: 'info',
        schema: logLevelSchema
      },
      maxRetries: {
        envName: 'HUNDUNOS_MAX_RETRIES',
        defaultValue: 3,
        schema: z.coerce.number().int().gte(0)
      },
      timeout: {
        envName: 'HUNDUNOS_TIMEOUT',
        defaultValue: 30000,
        schema: z.coerce.number().int().gt(0)
      },
      debug: {
        envName: 'HUNDUNOS_DEBUG',
        defaultValue: false,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      workspace: {
        envName: 'HUNDUNOS_WORKSPACE',
        defaultValue: '.'
      },
      pythonPath: {
        envName: 'HUNDUNOS_PYTHON_PATH',
        defaultValue: 'python'
      },
      nodePath: {
        envName: 'HUNDUNOS_NODE_PATH',
        defaultValue: 'node'
      }
    };
  }
}

/**
 * 熔断器配置类
 */
export class CircuitBreakerConfig extends BaseConfig {
  static getProperties() {
    return {
      enabled: {
        envName: 'CIRCUIT_BREAKER_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      threshold: {
        envName: 'CIRCUIT_BREAKER_THRESHOLD',
        defaultValue: 5,
        schema: z.coerce.number().int().gte(1)
      },
      timeout: {
        envName: 'CIRCUIT_BREAKER_TIMEOUT',
        defaultValue: 60000,
        schema: z.coerce.number().int().gt(0)
      }
    };
  }
}

/**
 * OpenAI 配置类
 */
export class OpenAIConfig extends BaseConfig {
  static getProperties() {
    return {
      apiKey: {
        envName: 'OPENAI_API_KEY',
        defaultValue: ''
      },
      endpoint: {
        envName: 'OPENAI_ENDPOINT',
        defaultValue: 'https://api.openai.com/v1'
      },
      model: {
        envName: 'OPENAI_MODEL',
        defaultValue: 'gpt-4o-mini'
      }
    };
  }
}

/**
 * Anthropic 配置类
 */
export class AnthropicConfig extends BaseConfig {
  static getProperties() {
    return {
      apiKey: {
        envName: 'ANTHROPIC_API_KEY',
        defaultValue: ''
      },
      endpoint: {
        envName: 'ANTHROPIC_ENDPOINT',
        defaultValue: 'https://api.anthropic.com'
      },
      model: {
        envName: 'ANTHROPIC_MODEL',
        defaultValue: 'claude-sonnet-4-20250514'
      }
    };
  }
}

/**
 * GLM 配置类
 */
export class GLMConfig extends BaseConfig {
  static getProperties() {
    return {
      apiKey: {
        envName: 'GLM_API_KEY',
        defaultValue: ''
      },
      baseUrl: {
        envName: 'GLM_BASE_URL',
        defaultValue: 'https://open.bigmodel.cn/api/paas/v4'
      },
      defaultModel: {
        envName: 'GLM_DEFAULT_MODEL',
        defaultValue: 'glm-4-flash'
      }
    };
  }
}

/**
 * 模型路由器配置类
 */
export class ModelRouterConfig extends BaseConfig {
  static getProperties() {
    const strategySchema = z.enum(['COST_FIRST', 'SPEED_FIRST', 'QUALITY_FIRST', 'MOCK']);

    return {
      defaultStrategy: {
        envName: 'MODEL_ROUTER_STRATEGY',
        defaultValue: 'COST_FIRST',
        schema: strategySchema
      },
      localFirst: {
        envName: 'MODEL_ROUTER_LOCAL_FIRST',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      endpoint: {
        envName: 'OLLAMA_ENDPOINT',
        defaultValue: 'http://127.0.0.1:11434'
      },
      localModel: {
        envName: 'OLLAMA_MODEL',
        defaultValue: 'qwen2.5:1.5b'
      },
      localMaxTokens: {
        envName: 'OLLAMA_MAX_TOKENS',
        defaultValue: 8192,
        schema: z.coerce.number().int().gte(1)
      },
      requestTimeout: {
        envName: 'MODEL_REQUEST_TIMEOUT',
        defaultValue: 30000,
        schema: z.coerce.number().int().gt(0)
      },
      circuitBreaker: {
        envName: null,
        defaultValue: CircuitBreakerConfig.create()
      },
      openai: {
        envName: null,
        defaultValue: OpenAIConfig.create()
      },
      anthropic: {
        envName: null,
        defaultValue: AnthropicConfig.create()
      },
      glm: {
        envName: null,
        defaultValue: GLMConfig.create()
      }
    };
  }
}

/**
 * CORS 配置类
 */
export class CorsConfig extends BaseConfig {
  static getProperties() {
    return {
      allowedOrigins: {
        envName: 'CORS_ALLOWED_ORIGINS',
        defaultValue: ['http://localhost:38080', 'http://127.0.0.1:38080'],
        transform: (value) => String(value).split(',').map(s => s.trim())
      },
      allowCredentials: {
        envName: 'CORS_ALLOW_CREDENTIALS',
        defaultValue: false,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      maxAge: {
        envName: 'CORS_MAX_AGE',
        defaultValue: 86400,
        schema: z.coerce.number().int().gte(0)
      },
      allowedMethods: {
        envName: 'CORS_ALLOWED_METHODS',
        defaultValue: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        transform: (value) => String(value).split(',').map(s => s.trim())
      },
      allowedHeaders: {
        envName: 'CORS_ALLOWED_HEADERS',
        defaultValue: ['Content-Type', 'Authorization', 'X-API-Key'],
        transform: (value) => String(value).split(',').map(s => s.trim())
      }
    };
  }
}

/**
 * REST API 配置类
 */
export class RestApiConfig extends BaseConfig {
  static getProperties() {
    return {
      port: {
        envName: 'REST_API_PORT',
        defaultValue: 38080,
        schema: z.coerce.number().int().gte(1).lte(65535)
      },
      apiKeys: {
        envName: 'REST_API_KEYS',
        defaultValue: [],
        transform: (value) => {
          if (!value) return [];
          return String(value).split(',').map(s => s.trim()).filter(s => s);
        }
      },
      cors: {
        envName: null,
        defaultValue: CorsConfig.create()
      },
      rateLimitEnabled: {
        envName: 'REST_API_RATE_LIMIT_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      rateLimitWindow: {
        envName: 'REST_API_RATE_LIMIT_WINDOW',
        defaultValue: 60000,
        schema: z.coerce.number().int().gt(0)
      },
      rateLimitMax: {
        envName: 'REST_API_RATE_LIMIT_MAX',
        defaultValue: 60,
        schema: z.coerce.number().int().gte(1)
      },
      rateLimitBurstMax: {
        envName: 'REST_API_RATE_LIMIT_BURST_MAX',
        defaultValue: 10,
        schema: z.coerce.number().int().gte(1)
      }
    };
  }
}

/**
 * 存储配置类
 */
export class StorageConfig extends BaseConfig {
  static getProperties() {
    const storageTypeSchema = z.enum(['json', 'sqlite', 'postgres']);

    return {
      type: {
        envName: 'STORAGE_TYPE',
        defaultValue: 'json',
        schema: storageTypeSchema
      },
      path: {
        envName: 'STORAGE_PATH',
        defaultValue: './data'
      },
      encryptBackups: {
        envName: 'STORAGE_ENCRYPT_BACKUPS',
        defaultValue: false,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      backupRetentionDays: {
        envName: 'STORAGE_BACKUP_RETENTION_DAYS',
        defaultValue: 7,
        schema: z.coerce.number().int().gte(1)
      },
      maxBackups: {
        envName: 'STORAGE_MAX_BACKUPS',
        defaultValue: 10,
        schema: z.coerce.number().int().gte(1)
      },
      sqliteDatabasePath: {
        envName: 'SQLITE_DATABASE_PATH',
        defaultValue: './data/hundunos.db'
      },
      sqlitePoolSize: {
        envName: 'SQLITE_POOL_SIZE',
        defaultValue: 3,
        schema: z.coerce.number().int().gte(1)
      },
      postgresHost: {
        envName: 'POSTGRES_HOST',
        defaultValue: 'localhost'
      },
      postgresPort: {
        envName: 'POSTGRES_PORT',
        defaultValue: 5432,
        schema: z.coerce.number().int().gte(1).lte(65535)
      },
      postgresDatabase: {
        envName: 'POSTGRES_DATABASE',
        defaultValue: 'hundunos'
      },
      postgresUser: {
        envName: 'POSTGRES_USER',
        defaultValue: 'postgres'
      },
      postgresPassword: {
        envName: 'POSTGRES_PASSWORD',
        defaultValue: ''
      }
    };
  }
}

/**
 * 平台配置类
 */
export class PlatformConfig extends BaseConfig {
  static getProperties() {
    return {
      os: {
        envName: 'PLATFORM_OS',
        defaultValue: 'windows'
      },
      workspace: {
        envName: 'PLATFORM_WORKSPACE',
        defaultValue: '.'
      },
      pythonPath: {
        envName: 'PLATFORM_PYTHON_PATH',
        defaultValue: 'python'
      },
      nodePath: {
        envName: 'PLATFORM_NODE_PATH',
        defaultValue: 'node'
      }
    };
  }
}

/**
 * 消息总线配置类
 */
export class MessageBusConfig extends BaseConfig {
  static getProperties() {
    return {
      ackTimeout: {
        envName: 'MESSAGE_BUS_ACK_TIMEOUT',
        defaultValue: 5000,
        schema: z.coerce.number().int().gt(0)
      },
      maxRetries: {
        envName: 'MESSAGE_BUS_MAX_RETRIES',
        defaultValue: 3,
        schema: z.coerce.number().int().gte(0)
      },
      persistenceEnabled: {
        envName: 'MESSAGE_BUS_PERSISTENCE_ENABLED',
        defaultValue: false,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      }
    };
  }
}

/**
 * 工具桥接配置类
 */
export class ToolBridgeConfig extends BaseConfig {
  static getProperties() {
    return {
      toolsDir: {
        envName: 'TOOL_BRIDGE_TOOLS_DIR',
        defaultValue: './scripts/tools'
      },
      timeout: {
        envName: 'TOOL_BRIDGE_TIMEOUT',
        defaultValue: 30000,
        schema: z.coerce.number().int().gt(0)
      },
      sandboxEnabled: {
        envName: 'TOOL_BRIDGE_SANDBOX_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      }
    };
  }
}

/**
 * 技能配置类
 */
export class SkillsConfig extends BaseConfig {
  static getProperties() {
    return {
      enabled: {
        envName: 'SKILLS_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      dirs: {
        envName: 'SKILLS_DIRS',
        defaultValue: ['./.claude/skills', './skills'],
        transform: (value) => String(value).split(',').map(s => s.trim())
      },
      hotReload: {
        envName: 'SKILLS_HOT_RELOAD',
        defaultValue: false,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      }
    };
  }
}

/**
 * 日志配置类
 */
export class LoggingConfig extends BaseConfig {
  static getProperties() {
    const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

    return {
      level: {
        envName: 'LOGGING_LEVEL',
        defaultValue: 'info',
        schema: logLevelSchema
      },
      format: {
        envName: 'LOGGING_FORMAT',
        defaultValue: 'pretty'
      },
      colors: {
        envName: 'LOGGING_COLORS',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      filePath: {
        envName: 'LOGGING_FILE_PATH',
        defaultValue: './logs/hundunos.log'
      },
      structured: {
        envName: 'LOGGING_STRUCTURED',
        defaultValue: false,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      }
    };
  }
}

/**
 * Rust 模块配置类
 */
export class RustModulesConfig extends BaseConfig {
  static getProperties() {
    return {
      enabled: {
        envName: 'RUST_MODULES_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      mode: {
        envName: 'RUST_MODULES_MODE',
        defaultValue: 'auto'
      },
      tcpPort: {
        envName: 'RUST_MODULES_TCP_PORT',
        defaultValue: 38082,
        schema: z.coerce.number().int().gte(1).lte(65535)
      },
      socketPath: {
        envName: 'RUST_MODULES_SOCKET_PATH',
        defaultValue: '\\\\.\\pipe\\hundunos'
      },
      fallbackToJS: {
        envName: 'RUST_MODULES_FALLBACK_TO_JS',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      healthCheckInterval: {
        envName: 'RUST_MODULES_HEALTH_CHECK_INTERVAL',
        defaultValue: 30000,
        schema: z.coerce.number().int().gt(0)
      }
    };
  }
}

/**
 * 全局配置类
 */
export class GlobalConfig extends BaseConfig {
  static getProperties() {
    const environmentSchema = z.enum(['development', 'testing', 'production']);

    return {
      version: {
        envName: 'HUNDUNOS_VERSION',
        defaultValue: '3.6.0'
      },
      name: {
        envName: 'HUNDUNOS_NAME',
        defaultValue: 'HundunOS'
      },
      environment: {
        envName: 'NODE_ENV',
        defaultValue: 'development',
        schema: environmentSchema
      },
      kernel: {
        envName: null,
        defaultValue: KernelConfig.create()
      },
      modelRouter: {
        envName: null,
        defaultValue: ModelRouterConfig.create()
      },
      restApi: {
        envName: null,
        defaultValue: RestApiConfig.create()
      },
      storage: {
        envName: null,
        defaultValue: StorageConfig.create()
      },
      platform: {
        envName: null,
        defaultValue: PlatformConfig.create()
      },
      messageBus: {
        envName: null,
        defaultValue: MessageBusConfig.create()
      },
      toolBridge: {
        envName: null,
        defaultValue: ToolBridgeConfig.create()
      },
      skills: {
        envName: null,
        defaultValue: SkillsConfig.create()
      },
      logging: {
        envName: null,
        defaultValue: LoggingConfig.create()
      },
      rustModules: {
        envName: null,
        defaultValue: RustModulesConfig.create()
      },
      healthMonitorEnabled: {
        envName: 'HEALTH_MONITOR_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      permissionMode: {
        envName: 'PERMISSION_MODE',
        defaultValue: 'default'
      },
      auditLoggingEnabled: {
        envName: 'AUDIT_LOGGING_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      permissionGatingEnabled: {
        envName: 'PERMISSION_GATING_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      },
      privacyShieldEnabled: {
        envName: 'PRIVACY_SHIELD_ENABLED',
        defaultValue: true,
        transform: (value) => ['true', '1'].includes(String(value).toLowerCase())
      }
    };
  }
}
