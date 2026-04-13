/**
 * Supermemory 工具函数
 *
 * 提供各种辅助函数，支持 Supermemory 集成的各种功能。
 */

/**
 * 日志记录器
 */
class Logger {
  /**
   * 创建日志记录器实例
   * @param {string} name - 日志记录器名称
   * @param {string} [level='info'] - 日志级别
   */
  constructor(name, level = 'info') {
    this.name = name;
    this.level = level;
    this.levels = {
      'debug': 0,
      'info': 1,
      'warn': 2,
      'error': 3
    };
  }

  /**
   * 设置日志级别
   * @param {string} level - 日志级别
   */
  setLevel(level) {
    this.level = level;
  }

  /**
   * 记录调试日志
   * @param {string} message - 消息
   * @param {Object} [context] - 上下文
   */
  debug(message, context = {}) {
    if (this.levels[this.level] <= this.levels['debug']) {
      console.log(JSON.stringify({
        level: 'debug',
        name: this.name,
        message,
        context: this.sanitize(context),
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 记录信息日志
   * @param {string} message - 消息
   * @param {Object} [context] - 上下文
   */
  info(message, context = {}) {
    if (this.levels[this.level] <= this.levels['info']) {
      console.info(JSON.stringify({
        level: 'info',
        name: this.name,
        message,
        context: this.sanitize(context),
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 记录警告日志
   * @param {string} message - 消息
   * @param {Object} [context] - 上下文
   */
  warn(message, context = {}) {
    if (this.levels[this.level] <= this.levels['warn']) {
      console.warn(JSON.stringify({
        level: 'warn',
        name: this.name,
        message,
        context: this.sanitize(context),
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 记录错误日志
   * @param {string} message - 消息
   * @param {Object} [context] - 上下文
   */
  error(message, context = {}) {
    if (this.levels[this.level] <= this.levels['error']) {
      console.error(JSON.stringify({
        level: 'error',
        name: this.name,
        message,
        context: this.sanitize(context),
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 脱敏处理
   * @param {Object} data - 数据
   * @returns {Object} 脱敏后的数据
   */
  sanitize(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };

    // 脱敏 API 密钥
    if (sanitized.apiKey) {
      sanitized.apiKey = '***';
    }

    // 脱敏密码
    if (sanitized.password) {
      sanitized.password = '***';
    }

    // 脱敏 Bearer Token
    if (sanitized.authorization) {
      sanitized.authorization = 'Bearer ***';
    }

    return sanitized;
  }
}

/**
 * 配置验证器
 */
class ConfigValidator {
  /**
   * 验证 Supermemory 配置
   * @param {Object} config - 配置对象
   * @returns {Object} 验证结果
   */
  static validate(config) {
    const errors = [];
    const warnings = [];

    // 验证必需字段
    if (!config.apiKey) {
      errors.push('API 密钥未配置');
    }

    // 验证 URL
    if (config.baseUrl && !this.isValidUrl(config.baseUrl)) {
      errors.push(`基础 URL 无效: ${config.baseUrl}`);
    }

    // 验证容器标签策略
    if (!['user', 'project', 'custom'].includes(config.containerTagStrategy)) {
      errors.push(`容器标签策略无效: ${config.containerTagStrategy}`);
    }

    // 验证缓存配置
    if (config.cache?.enabled) {
      if (config.cache.ttl <= 0) {
        errors.push('缓存 TTL 必须大于 0');
      }
      if (config.cache.maxSize <= 0) {
        errors.push('缓存最大大小必须大于 0');
      }
    }

    // 验证重试配置
    if (config.retry?.maxAttempts < 0) {
      errors.push('最大重试次数不能为负数');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 检查 URL 是否有效
   * @param {string} url - URL 字符串
   * @returns {boolean} 是否有效
   */
  static isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

/**
 * 辅助函数
 */
class Helpers {
  /**
   * 生成容器标签
   * @param {string} strategy - 策略（user、project、custom）
   * @param {Object} options - 选项
   * @returns {string} 容器标签
   */
  static generateContainerTag(strategy, options = {}) {
    switch (strategy) {
      case 'user':
        return `user_${options.userId || 'default'}`;

      case 'project':
        return `project_${options.projectName || 'default'}`;

      case 'custom':
        return options.customTag || 'default';

      default:
        return 'default';
    }
  }

  /**
   * 格式化时间戳
   * @param {number} timestamp - 时间戳
   * @returns {string} 格式化的时间字符串
   */
  static formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString();
  }

  /**
   * 计算时间差
   * @param {number} start - 开始时间戳
   * @param {number} end - 结束时间戳
   * @returns {Object} 时间差
   */
  static getTimeDiff(start, end) {
    const diff = end - start;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return {
      milliseconds: diff,
      seconds: diff % 1000,
      minutes: minutes % 60,
      hours,
      humanReadable: `${hours}h ${minutes % 60}m ${seconds % 60}s`
    };
  }

  /**
   * 深度克隆对象
   * @param {Object} obj - 对象
   * @returns {Object} 克隆的对象
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item));
    }

    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  /**
   * 合并对象
   * @param {Object} target - 目标对象
   * @param {...Object} sources - 源对象
   * @returns {Object} 合并后的对象
   */
  static merge(target, ...sources) {
    const result = this.deepClone(target);

    for (const source of sources) {
      if (source && typeof source === 'object') {
        for (const key in source) {
          if (source.hasOwnProperty(key)) {
            const sourceValue = source[key];
            const targetValue = result[key];

            if (typeof sourceValue === 'object' && typeof targetValue === 'object' && 
                !Array.isArray(sourceValue) && !Array.isArray(targetValue)) {
              result[key] = this.merge(targetValue, sourceValue);
            } else {
              result[key] = this.deepClone(sourceValue);
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * 截断字符串
   * @param {string} str - 字符串
   * @param {number} maxLength - 最大长度
   * @param {string} [suffix='...'] - 后缀
   * @returns {string} 截断后的字符串
   */
  static truncate(str, maxLength, suffix = '...') {
    if (!str || str.length <= maxLength) {
      return str;
    }

    return str.substring(0, maxLength - suffix.length) + suffix;
  }

  /**
   * 格式化字节大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化的大小字符串
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * 生成唯一 ID
   * @returns {string} 唯一 ID
   */
  static generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 延迟执行
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 重试函数
   * @param {Function} fn - 要重试的函数
   * @param {Object} [options] - 选项
   * @param {number} [options.maxAttempts=3] - 最大重试次数
   * @param {number} [options.delay=1000] - 初始延迟（毫秒）
   * @param {number} [options.backoffMultiplier=2] - 退避倍数
   * @returns {Promise<any>} 函数结果
   */
  static async retry(fn, options = {}) {
    const maxAttempts = options.maxAttempts || 3;
    const delay = options.delay || 1000;
    const backoffMultiplier = options.backoffMultiplier || 2;

    let lastError;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxAttempts) {
          throw error;
        }

        await this.delay(currentDelay);
        currentDelay *= backoffMultiplier;
      }
    }

    throw lastError;
  }
}

/**
 * 创建日志记录器
 * @param {string} name - 日志记录器名称
 * @param {string} [level='info'] - 日志级别
 * @returns {Logger} 日志记录器实例
 */
function createLogger(name, level = 'info') {
  return new Logger(name, level);
}

export {
  Logger,
  ConfigValidator,
  Helpers,
  createLogger
};
