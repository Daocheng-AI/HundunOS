// hundunos/kernel/config/config-loader.js
// 装饰器驱动的配置加载器

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { GlobalConfig } from './global.config.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * 配置加载器类
 */
export class ConfigLoader {
  /**
   * 加载配置（优先使用装饰器配置，回退到 JSON 配置）
   * @param {string} baseDir - 项目根目录
   * @param {string} env - 环境变量
   * @returns {Object} 配置对象
   */
  static load(baseDir, env = null) {
    const environment = env || process.env.NODE_ENV || 'development';

    // 1. 尝试使用装饰器配置（如果环境变量已设置）
    const decoratorConfig = this._loadDecoratorConfig(environment);

    // 2. 加载 JSON 配置（用于向后兼容和默认值）
    const jsonConfig = this._loadJsonConfig(baseDir, environment);

    // 3. 合并配置（装饰器配置优先）
    const merged = this._mergeConfigs(decoratorConfig, jsonConfig);

    // 4. 设置元数据
    merged.environment = environment;
    merged.loadedAt = new Date().toISOString();
    merged.configSource = this._determineConfigSource(decoratorConfig, jsonConfig);

    // 5. 验证配置
    this._validateConfig(merged, environment);

    return merged;
  }

  /**
   * 加载装饰器配置
   * @param {string} environment - 环境
   * @returns {Object} 装饰器配置对象
   */
  static _loadDecoratorConfig(environment) {
    try {
      const config = GlobalConfig();
      return config;
    } catch (error) {
      console.warn(`[Config] Failed to load decorator config: ${error.message}`);
      return {};
    }
  }

  /**
   * 加载 JSON 配置
   * @param {string} baseDir - 项目根目录
   * @param {string} environment - 环境
   * @returns {Object} JSON 配置对象
   */
  static _loadJsonConfig(baseDir, environment) {
    const configDir = join(baseDir, 'config');

    // 1. 加载基础配置
    const baseConfig = this._loadJsonFile(join(configDir, 'system.json'));
    if (!baseConfig) {
      console.warn('[Config] Base configuration (system.json) not found');
      return {};
    }

    // 2. 加载环境特定配置
    const envConfigPath = join(configDir, `system.${environment}.json`);
    const envConfig = this._loadJsonFile(envConfigPath);

    // 3. 加载本地覆盖配置（可选）
    const localConfigPath = join(configDir, 'system.local.json');
    const localConfig = existsSync(localConfigPath)
      ? this._loadJsonFile(localConfigPath)
      : null;

    // 4. 合并 JSON 配置
    return this._deepMerge({}, baseConfig, envConfig, localConfig);
  }

  /**
   * 加载 JSON 文件
   * @param {string} filePath - 文件路径
   * @returns {Object|null} 配置对象或 null
   */
  static _loadJsonFile(filePath) {
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`[Config] Failed to load ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * 合并装饰器配置和 JSON 配置
   * @param {Object} decoratorConfig - 装饰器配置
   * @param {Object} jsonConfig - JSON 配置
   * @returns {Object} 合并后的配置
   */
  static _mergeConfigs(decoratorConfig, jsonConfig) {
    // 深度合并，装饰器配置优先
    return this._deepMerge({}, jsonConfig, decoratorConfig);
  }

  /**
   * 深度合并对象
   * @param {Object} target - 目标对象
   * @param {...Object} sources - 源对象
   * @returns {Object} 合并后的对象
   */
  static _deepMerge(target, ...sources) {
    if (!sources.length) return target;

    const source = sources.shift();

    if (source && typeof source === 'object') {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          this._deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }

    return this._deepMerge(target, ...sources);
  }

  /**
   * 确定配置来源
   * @param {Object} decoratorConfig - 装饰器配置
   * @param {Object} jsonConfig - JSON 配置
   * @returns {string} 配置来源
   */
  static _determineConfigSource(decoratorConfig, jsonConfig) {
    const hasDecoratorConfig = Object.keys(decoratorConfig).length > 0;
    const hasJsonConfig = Object.keys(jsonConfig).length > 0;

    if (hasDecoratorConfig && hasJsonConfig) {
      return 'mixed';
    } else if (hasDecoratorConfig) {
      return 'decorators';
    } else if (hasJsonConfig) {
      return 'json';
    } else {
      return 'none';
    }
  }

  /**
   * 验证配置
   * @param {Object} config - 配置对象
   * @param {string} environment - 环境
   */
  static _validateConfig(config, environment) {
    const warnings = [];
    const errors = [];

    // 验证必填字段
    const requiredFields = ['version', 'name'];
    for (const field of requiredFields) {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // 生产环境安全检查
    if (environment === 'production') {
      if (!config.restApi?.cors?.allowedOrigins?.length) {
        warnings.push('Production environment should configure CORS allowedOrigins');
      }

      if (!config.restApi?.rateLimitEnabled) {
        warnings.push('Production environment should enable rate limiting');
      }

      if (!config.storage?.encryptBackups) {
        warnings.push('Production environment should encrypt backups');
      }

      if (config.restApi?.cors?.allowCredentials && config.restApi?.cors?.allowedOrigins?.includes('*')) {
        warnings.push('Production environment should not allow credentials with wildcard CORS');
      }
    }

    // 开发环境建议
    if (environment === 'development') {
      if (!config.kernel?.debug) {
        warnings.push('Development environment may want to enable debug mode');
      }

      if (config.logging?.level !== 'debug') {
        warnings.push('Development environment may want to set log level to debug');
      }
    }

    // 输出警告
    if (warnings.length > 0) {
      console.warn('[Config] Configuration warnings:');
      warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    // 输出错误
    if (errors.length > 0) {
      console.error('[Config] Configuration errors:');
      errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('Configuration validation failed');
    }
  }

  /**
   * 获取配置统计信息
   * @param {Object} config - 配置对象
   * @returns {Object} 统计信息
   */
  static getConfigStats(config) {
    return {
      environment: config.environment,
      version: config.version,
      configSource: config.configSource,
      hasDecoratorConfig: config.configSource === 'decorators' || config.configSource === 'mixed',
      hasJsonConfig: config.configSource === 'json' || config.configSource === 'mixed',
      loadedAt: config.loadedAt,
      modules: config.modules ? Object.keys(config.modules).length : 0,
      logging: config.logging ? {
        level: config.logging.level,
        format: config.logging.format,
        structured: config.logging.structured
      } : null,
      restApi: config.restApi ? {
        port: config.restApi.port,
        rateLimitEnabled: config.restApi.rateLimitEnabled,
        corsOriginsCount: config.restApi.cors?.allowedOrigins?.length || 0
      } : null,
      storage: config.storage ? {
        type: config.storage.type,
        encryptBackups: config.storage.encryptBackups
      } : null
    };
  }

  /**
   * 创建环境特定的配置模板
   * @param {string} environment - 环境名称
   * @returns {Object} 环境变量模板
   */
  static createEnvTemplate(environment) {
    const templates = {
      production: {
        NODE_ENV: 'production',
        HUNDUNOS_LOG_LEVEL: 'info',
        HUNDUNOS_DEBUG: 'false',
        LOGGING_LEVEL: 'info',
        LOGGING_FORMAT: 'json',
        LOGGING_STRUCTURED: 'true',
        REST_API_RATE_LIMIT_ENABLED: 'true',
        STORAGE_ENCRYPT_BACKUPS: 'true',
        AUDIT_LOGGING_ENABLED: 'true',
        PERMISSION_GATING_ENABLED: 'true',
        PRIVACY_SHIELD_ENABLED: 'true'
      },
      development: {
        NODE_ENV: 'development',
        HUNDUNOS_LOG_LEVEL: 'debug',
        HUNDUNOS_DEBUG: 'true',
        LOGGING_LEVEL: 'debug',
        LOGGING_FORMAT: 'pretty',
        LOGGING_COLORS: 'true',
        REST_API_RATE_LIMIT_ENABLED: 'false',
        SKILLS_HOT_RELOAD: 'true'
      },
      testing: {
        NODE_ENV: 'testing',
        HUNDUNOS_LOG_LEVEL: 'warn',
        HUNDUNOS_DEBUG: 'false',
        LOGGING_LEVEL: 'warn',
        LOGGING_FORMAT: 'simple',
        MODEL_ROUTER_STRATEGY: 'MOCK',
        MODEL_ROUTER_LOCAL_FIRST: 'false'
      }
    };

    return templates[environment] || {};
  }

  /**
   * 验证 JSON 配置文件
   * @param {string} filePath - 配置文件路径
   * @returns {Object} 验证结果
   */
  static validateJsonFile(filePath) {
    try {
      if (!existsSync(filePath)) {
        return { valid: false, error: 'File does not exist' };
      }

      const content = readFileSync(filePath, 'utf8');
      const config = JSON.parse(content);

      // 基本结构验证
      const errors = [];

      if (!config.version) errors.push('Missing version field');
      if (!config.name) errors.push('Missing name field');

      return {
        valid: errors.length === 0,
        errors,
        config: errors.length === 0 ? config : null
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        errors: [error.message]
      };
    }
  }
}

// 导出配置类
export { GlobalConfig } from './global.config.js';
export { KernelConfig } from './kernel.config.js';
export { ModelRouterConfig } from './model-router.config.js';
export { RestApiConfig } from './rest-api.config.js';
export { StorageConfig } from './storage.config.js';
export { Config, Env, Nested } from './decorators.js';
