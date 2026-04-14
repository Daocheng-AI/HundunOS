// hundunos/kernel/di/services/logger.service.js
// 日志服务

/**
 * 日志服务类
 */
export class LoggerService {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    this.level = config.level || 'info';
    this.format = config.format || 'pretty';
    this.colors = config.colors !== false;
  }

  /**
   * 设置日志级别
   * @param {string} level - 日志级别
   */
  setLevel(level) {
    this.level = level;
  }

  /**
   * 设置日志格式
   * @param {string} format - 日志格式
   */
  setFormat(format) {
    this.format = format;
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} [meta] - 元数据
   */
  log(level, message, meta = {}) {
    if (!this._shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };

    if (this.format === 'json') {
      // console.log(JSON.stringify(logEntry));
    } else {
      const coloredMessage = this._colorize(level, message);
      // console.log(`[${timestamp}] [${level.toUpperCase()}] ${coloredMessage}`);
      if (Object.keys(meta).length > 0) {
        // console.log('  Meta:', meta);
      }
    }
  }

  /**
   * 调试日志
   * @param {string} message - 日志消息
   * @param {Object} [meta] - 元数据
   */
  debug(message, meta) {
    this.log('debug', message, meta);
  }

  /**
   * 信息日志
   * @param {string} message - 日志消息
   * @param {Object} [meta] - 元数据
   */
  info(message, meta) {
    this.log('info', message, meta);
  }

  /**
   * 警告日志
   * @param {string} message - 日志消息
   * @param {Object} [meta] - 元数据
   */
  warn(message, meta) {
    this.log('warn', message, meta);
  }

  /**
   * 错误日志
   * @param {string} message - 日志消息
   * @param {Object} [meta] - 元数据
   */
  error(message, meta) {
    this.log('error', message, meta);
  }

  /**
   * 判断是否应该记录日志
   * @param {string} level - 日志级别
   * @returns {boolean} 是否应该记录
   */
  _shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * 颜色化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @returns {string} 颜色化后的消息
   */
  _colorize(level, message) {
    if (!this.colors) {
      return message;
    }

    const colors = {
      debug: '\x1b[36m',  // 青色
      info: '\x1b[32m',   // 绿色
      warn: '\x1b[33m',   // 黄色
      error: '\x1b[31m'   // 红色
    };

    const reset = '\x1b[0m';
    const color = colors[level] || '';
    return `${color}${message}${reset}`;
  }
}
