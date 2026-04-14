/**
 * HundunOS v5.0 - Logger Plugin
 * 核心插件：日志服务
 */

import { BasePlugin } from '../../core/BasePlugin.js';

/**
 * 日志插件
 */
export class LoggerPlugin extends BasePlugin {
  get name() {
    return 'logger';
  }

  get version() {
    return '1.0.0';
  }

  async onInit() {
    const config = this.config;
    
    // 创建日志服务
    const logger = new LoggerService({
      level: config.level || 'info',
      format: config.format || 'json',
    });

    // 注册到服务注册表
    this.kernel.register('logger', () => logger, { singleton: true });
    
    // 替换内核的临时日志服务
    this.kernel.services.instances.set('logger', logger);
  }
}

/**
 * 日志服务
 */
class LoggerService {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.format = options.format || 'json';
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
  }

  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  _format(level, message, meta = {}) {
    if (this.format === 'json') {
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
      });
    }
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message, meta) {
    if (this._shouldLog('debug')) {
      console.debug(this._format('debug', message, meta));
    }
  }

  info(message, meta) {
    if (this._shouldLog('info')) {
      console.info(this._format('info', message, meta));
    }
  }

  warn(message, meta) {
    if (this._shouldLog('warn')) {
      console.warn(this._format('warn', message, meta));
    }
  }

  error(message, meta) {
    if (this._shouldLog('error')) {
      console.error(this._format('error', message, meta));
    }
  }

  child(name) {
    return {
      debug: (msg, meta) => this.debug(`[${name}] ${msg}`, meta),
      info: (msg, meta) => this.info(`[${name}] ${msg}`, meta),
      warn: (msg, meta) => this.warn(`[${name}] ${msg}`, meta),
      error: (msg, meta) => this.error(`[${name}] ${msg}`, meta),
    };
  }
}

export default LoggerPlugin;
