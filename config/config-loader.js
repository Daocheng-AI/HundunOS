// hundunos/config/config-loader.js
// 环境感知的配置加载器

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * 配置加载器
 */
export class ConfigLoader {
  /**
   * 根据环境加载配置
   * @param {string} baseDir 项目根目录
   * @param {string} env 环境变量
   * @returns {Object} 合并后的配置
   */
  static load(baseDir, env = null) {
    const environment = env || process.env.NODE_ENV || 'development';
    const configDir = join(baseDir, 'config');
    
    console.log(`[Config] Loading configuration for environment: ${environment}`);
    
    // 1. 加载基础配置
    const baseConfig = this._loadConfigFile(join(configDir, 'system.json'));
    if (!baseConfig) {
      throw new Error('Base configuration (system.json) not found');
    }
    
    // 2. 加载环境特定配置
    const envConfigPath = join(configDir, `system.${environment}.json`);
    const envConfig = this._loadConfigFile(envConfigPath);
    
    // 3. 加载本地覆盖配置（可选）
    const localConfigPath = join(configDir, `system.local.json`);
    const localConfig = existsSync(localConfigPath) 
      ? this._loadConfigFile(localConfigPath)
      : null;
    
    // 4. 合并配置
    const merged = this._deepMerge({}, baseConfig, envConfig, localConfig);
    
    // 5. 设置最终环境
    merged.environment = environment;
    merged.loadedAt = new Date().toISOString();
    
    // 6. 安全验证
    this._validateConfig(merged, environment);
    
    console.log(`[Config] Configuration loaded: ${JSON.stringify(this._getConfigStats(merged))}`);
    
    return merged;
  }
  
  /**
   * 加载配置文件
   * @param {string} filePath 配置文件路径
   * @returns {Object|null} 配置对象或null
   */
  static _loadConfigFile(filePath) {
    if (!existsSync(filePath)) {
      return null;
    }
    
    try {
      const content = readFileSync(filePath, 'utf8');
      const config = JSON.parse(content);
      console.log(`[Config] Loaded: ${filePath.replace(/^.*config[\\/]/, '')}`);
      return config;
    } catch (error) {
      console.error(`[Config] Failed to load ${filePath}:`, error.message);
      return null;
    }
  }
  
  /**
   * 深度合并对象
   * @param {Object} target 目标对象
   * @param {...Object} sources 源对象
   * @returns {Object} 合并后的对象
   */
  static _deepMerge(target, ...sources) {
    if (!sources.length) return target;
    
    const source = sources.shift();
    
    if (source && typeof source === 'object') {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) {
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
   * 验证配置
   * @param {Object} config 配置对象
   * @param {string} environment 环境
   */
  static _validateConfig(config, environment) {
    const warnings = [];
    
    // 验证必填字段
    const requiredFields = ['version', 'name', 'environment'];
    for (const field of requiredFields) {
      if (!config[field]) {
        warnings.push(`Missing required field: ${field}`);
      }
    }
    
    // 生产环境安全检查
    if (environment === 'production') {
      if (!config.restApi?.cors?.allowedOrigins?.length) {
        warnings.push('Production environment should configure CORS allowedOrigins');
      }
      
      if (!config.restApi?.rateLimit?.enabled) {
        warnings.push('Production environment should enable rate limiting');
      }
      
      if (!config.storage?.encryptBackups) {
        warnings.push('Production environment should encrypt backups');
      }
      
      if (!config.audit?.encryption) {
        warnings.push('Production environment should encrypt audit logs');
      }
      
      if (config.restApi?.cors?.allowCredentials && config.restApi?.cors?.allowedOrigins?.includes('*')) {
        warnings.push('Production environment should not allow credentials with wildcard CORS');
      }
    }
    
    // 开发环境警告
    if (environment === 'development') {
      if (config.upgrade?.requireSignature !== false) {
        warnings.push('Development environment may want to disable upgrade signature requirement');
      }
      
      if (!config.debug?.enabled) {
        warnings.push('Development environment may want to enable debug features');
      }
    }
    
    if (warnings.length > 0) {
      console.warn('[Config] Configuration warnings:');
      warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
  }
  
  /**
   * 获取配置统计信息
   * @param {Object} config 配置对象
   * @returns {Object} 统计信息
   */
  static _getConfigStats(config) {
    const stats = {
      environment: config.environment,
      modules: Object.keys(config.modules || {}).length,
      hasCorsConfig: !!(config.restApi?.cors),
      hasRateLimit: !!(config.rateLimit),
      hasMetrics: !!(config.metrics?.enabled),
      hasLogging: !!(config.logging)
    };
    
    // 安全增强：生产环境不输出敏感配置
    if (config.environment === 'production') {
      stats.corsOriginsCount = config.restApi?.cors?.allowedOrigins?.length || 0;
      stats.trustedSourcesCount = config.upgrade?.trustedSources?.length || 0;
    }
    
    return stats;
  }
  
  /**
   * 创建环境特定的配置模板
   * @param {string} environment 环境名称
   * @param {Object} baseConfig 基础配置
   * @returns {Object} 配置模板
   */
  static createTemplate(environment, baseConfig) {
    const templates = {
      production: {
        environment: 'production',
        kernel: { logLevel: 'info', maxRetries: 3 },
        restApi: {
          cors: { allowedOrigins: ['https://your-production-domain.com'] },
          rateLimit: { enabled: true, maxRequests: 120 }
        },
        storage: { encryptBackups: true },
        logging: { level: 'info', format: 'json' }
      },
      development: {
        environment: 'development',
        kernel: { logLevel: 'debug', maxRetries: 5 },
        restApi: {
          cors: { allowedOrigins: ['http://localhost:*'] },
          rateLimit: { enabled: false }
        },
        logging: { level: 'debug', format: 'pretty', colors: true },
        debug: { enabled: true }
      },
      testing: {
        environment: 'testing',
        kernel: { logLevel: 'warn', maxRetries: 1 },
        restApi: { cors: { allowedOrigins: ['*'] } },
        modelRouter: { defaultStrategy: 'MOCK', mockResponses: true },
        logging: { level: 'warn', format: 'simple' }
      }
    };
    
    return this._deepMerge({}, baseConfig, templates[environment] || {});
  }
  
  /**
   * 验证配置文件的语法和结构
   * @param {string} filePath 配置文件路径
   * @returns {Object} 验证结果
   */
  static validateFile(filePath) {
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
      if (config.version && typeof config.version !== 'string') errors.push('version must be a string');
      
      // 模块配置验证
      if (config.modules) {
        for (const [moduleName, moduleConfig] of Object.entries(config.modules)) {
          if (typeof moduleConfig !== 'object' || moduleConfig === null) {
            errors.push(`Module ${moduleName} config must be an object`);
          }
        }
      }
      
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

// 命令行接口
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  
  switch (command) {
    case 'validate':
      const filePath = process.argv[3] || './config/system.json';
      console.log(`Validating ${filePath}...`);
      const result = ConfigLoader.validateFile(filePath);
      
      if (result.valid) {
        console.log('✅ Configuration is valid');
        console.log(JSON.stringify(ConfigLoader._getConfigStats(result.config), null, 2));
      } else {
        console.error('❌ Configuration validation failed:');
        result.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }
      break;
      
    case 'list':
      const env = process.argv[3] || process.env.NODE_ENV || 'development';
      process.chdir(join(__dirname, '..'));
      const config = ConfigLoader.load('.', env);
      console.log(JSON.stringify(config, null, 2));
      break;
      
    case 'template':
      const targetEnv = process.argv[3];
      if (!targetEnv) {
        console.error('Usage: node config-loader.js template <environment>');
        process.exit(1);
      }
      
      const baseConfig = ConfigLoader._loadConfigFile('./config/system.json') || {};
      const template = ConfigLoader.createTemplate(targetEnv, baseConfig);
      console.log(JSON.stringify(template, null, 2));
      break;
      
    default:
      console.log('Configuration Loader Commands:');
      console.log('  node config-loader.js validate [file]  - Validate a configuration file');
      console.log('  node config-loader.js list [env]       - List configuration for environment');
      console.log('  node config-loader.js template <env>   - Generate template for environment');
      break;
  }
}