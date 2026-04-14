/**
 * HundunOS v5.0 - 配置管理器
 * 统一管理配置加载、合并和验证
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 配置管理器
 */
export class ConfigManager {
  constructor(initialConfig = {}) {
    this.config = { ...initialConfig };
    this.sources = new Map();
  }

  /**
   * 初始化配置
   */
  async initialize() {
    // 加载默认配置
    this._loadDefaults();
    
    // 加载环境变量
    this._loadEnvVars();
    
    // 加载配置文件
    await this._loadConfigFiles();
  }

  /**
   * 获取配置值
   */
  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value === null || value === undefined) {
        return defaultValue;
      }
      value = value[k];
    }
    
    return value !== undefined ? value : defaultValue;
  }

  /**
   * 设置配置值
   */
  set(key, value) {
    const keys = key.split('.');
    let target = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target)) {
        target[k] = {};
      }
      target = target[k];
    }
    
    target[keys[keys.length - 1]] = value;
  }

  /**
   * 合并配置
   */
  merge(source) {
    this.config = this._deepMerge(this.config, source);
  }

  /**
   * 获取完整配置
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 加载默认配置
   * @private
   */
  _loadDefaults() {
    const defaults = {
      environment: 'development',
      plugins: [],
      logging: {
        level: 'info',
        format: 'json',
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
    };
    
    this.config = this._deepMerge(defaults, this.config);
  }

  /**
   * 加载环境变量
   * @private
   */
  _loadEnvVars() {
    const envMappings = {
      'NODE_ENV': 'environment',
      'HUNDUNOS_PORT': 'server.port',
      'HUNDUNOS_LOG_LEVEL': 'logging.level',
    };

    for (const [envKey, configKey] of Object.entries(envMappings)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        this.set(configKey, value);
      }
    }
  }

  /**
   * 加载配置文件
   * @private
   */
  async _loadConfigFiles() {
    const configPaths = [
      'config/default.json',
      `config/${this.get('environment')}.json`,
      'config/local.json',
    ];

    for (const path of configPaths) {
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, 'utf8');
          const config = JSON.parse(content);
          this.merge(config);
        } catch (error) {
          console.warn(`[ConfigManager] Failed to load ${path}:`, error.message);
        }
      }
    }
  }

  /**
   * 深度合并
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

export default ConfigManager;
