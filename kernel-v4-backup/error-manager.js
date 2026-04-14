/**
 * HundunOS v4.3 - 错误管理器
 * 统一管理错误处理，提供标准的错误类型和处理机制
 */

/**
 * 错误类型枚举
 */
export const ErrorType = {
  // 系统错误
  SYSTEM: 'system',
  // 配置错误
  CONFIG: 'config',
  // 安全错误
  SECURITY: 'security',
  // 工具错误
  TOOL: 'tool',
  // 网络错误
  NETWORK: 'network',
  // 存储错误
  STORAGE: 'storage',
  // 业务错误
  BUSINESS: 'business',
  // 未知错误
  UNKNOWN: 'unknown'
};

/**
 * 自定义错误类
 */
export class HundunOSError extends Error {
  constructor(message, type = ErrorType.UNKNOWN, code = null, details = null) {
    super(message);
    this.name = 'HundunOSError';
    this.type = type;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * 转换为响应对象
   * @returns {Object} 响应对象
   */
  toResponse() {
    return {
      success: false,
      error: {
        message: this.message,
        type: this.type,
        code: this.code,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * 错误管理器
 */
export class ErrorManager {
  constructor(logger = null) {
    this.logger = logger;
  }

  /**
   * 创建错误
   * @param {string} message - 错误消息
   * @param {string} type - 错误类型
   * @param {string} code - 错误代码
   * @param {Object} details - 错误详情
   * @returns {HundunOSError} 错误对象
   */
  createError(message, type = ErrorType.UNKNOWN, code = null, details = null) {
    return new HundunOSError(message, type, code, details);
  }

  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息
   * @returns {Object} 错误响应对象
   */
  handleError(error, context = {}) {
    // 记录错误
    this.logError(error, context);

    // 如果是自定义错误，直接转换为响应
    if (error instanceof HundunOSError) {
      return error.toResponse();
    }

    // 处理其他类型的错误
    return {
      success: false,
      error: {
        message: error.message || 'Unknown error',
        type: ErrorType.UNKNOWN,
        code: null,
        details: error.stack,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 记录错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息
   */
  logError(error, context = {}) {
    if (this.logger) {
      this.logger.error('Error occurred', {
        error: {
          message: error.message,
          type: error.type || ErrorType.UNKNOWN,
          code: error.code,
          stack: error.stack
        },
        context
      });
    } else {
      console.error('[ErrorManager]', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  /**
   * 处理异步操作错误
   * @param {Function} fn - 异步函数
   * @param {Object} context - 上下文信息
   * @returns {Promise} 处理结果
   */
  async handleAsyncError(fn, context = {}) {
    try {
      return await fn();
    } catch (error) {
      return this.handleError(error, context);
    }
  }

  /**
   * 验证参数
   * @param {*} value - 要验证的值
   * @param {string} name - 参数名称
   * @param {Function} validator - 验证函数
   * @param {string} message - 错误消息
   * @throws {HundunOSError} 验证失败时抛出错误
   */
  validateParam(value, name, validator, message) {
    if (!validator(value)) {
      throw this.createError(
        message || `${name} is invalid`,
        ErrorType.BUSINESS,
        'INVALID_PARAM',
        { param: name, value }
      );
    }
  }

  /**
   * 验证必需参数
   * @param {*} value - 要验证的值
   * @param {string} name - 参数名称
   * @throws {HundunOSError} 缺少参数时抛出错误
   */
  requireParam(value, name) {
    if (value === undefined || value === null) {
      throw this.createError(
        `${name} is required`,
        ErrorType.BUSINESS,
        'MISSING_PARAM',
        { param: name }
      );
    }
  }
}

// 导出单例实例
export const errorManager = new ErrorManager();
export default errorManager;