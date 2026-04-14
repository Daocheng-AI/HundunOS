// hundunos/kernel/observability/logger.js
// 结构化日志系统

/**
 * 日志级别
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

/**
 * 结构化日志类
 */
export class StructuredLogger {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.format = options.format || 'json';
    this.colors = options.colors !== false;
    this.context = options.context || {};

    this._levelValue = LogLevel[this.level.toUpperCase()] || LogLevel.INFO;
  }

  /**
   * 设置日志级别
   * @param {string} level - 日志级别
   */
  setLevel(level) {
    this.level = level;
    this._levelValue = LogLevel[level.toUpperCase()] || LogLevel.INFO;
  }

  /**
   * 设置上下文
   * @param {Object} context - 上下文信息
   */
  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * 添加上下文
   * @param {Object} context - 上下文信息
   */
  addContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * 清除上下文
   */
  clearContext() {
    this.context = {};
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} [meta] - 元数据
   */
  log(level, message, meta = {}) {
    const levelValue = LogLevel[level.toUpperCase()];

    if (levelValue < this._levelValue) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...this.context,
      ...meta
    };

    if (this.format === 'json') {
      console.log(JSON.stringify(logEntry));
    } else {
      const coloredMessage = this._colorize(level, message);
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${coloredMessage}`);

      const extraMeta = { ...this.context, ...meta };
      if (Object.keys(extraMeta).length > 0) {
        console.log('  Meta:', JSON.stringify(extraMeta, null, 2));
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
   * @param {Object|Error} [meta] - 元数据或错误对象
   */
  error(message, meta) {
    let errorMeta = meta;

    // 如果 meta 是 Error 对象，提取错误信息
    if (meta instanceof Error) {
      errorMeta = {
        name: meta.name,
        message: meta.message,
        stack: meta.stack
      };
    }

    this.log('error', message, errorMeta);
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
    const color = colors[level.toLowerCase()] || '';
    return `${color}${message}${reset}`;
  }
}

/**
 * 创建子日志记录器
 * @param {Object} context - 上下文信息
 * @returns {StructuredLogger} 子日志记录器
 */
StructuredLogger.prototype.child = function(context) {
  const child = new StructuredLogger({
    level: this.level,
    format: this.format,
    colors: this.colors,
    context: { ...this.context, ...context }
  });
  return child;
};

export { LogLevel };
