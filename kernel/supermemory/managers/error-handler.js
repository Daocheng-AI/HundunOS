/**
 * Supermemory 错误处理器
 *
 * 统一处理 Supermemory API 错误，实现重试机制、降级策略和离线模式。
 */

/**
 * Supermemory 错误类
 */
class SupermemoryError extends Error {
  /**
   * 创建 Supermemory 错误
   * @param {string} message - 错误消息
   * @param {number} [status] - HTTP 状态码
   * @param {string} [code] - 错误代码
   */
  constructor(message, status = null, code = null) {
    super(message);
    this.name = 'SupermemoryError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 网络错误类
 */
class NetworkError extends SupermemoryError {
  constructor(message) {
    super(message, null, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * 认证错误类
 */
class AuthError extends SupermemoryError {
  constructor(message) {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

/**
 * 速率限制错误类
 */
class RateLimitError extends SupermemoryError {
  constructor(message) {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

/**
 * 服务器错误类
 */
class ServerError extends SupermemoryError {
  constructor(message) {
    super(message, 500, 'SERVER_ERROR');
    this.name = 'ServerError';
  }
}

/**
 * 错误处理器类
 */
class ErrorHandler {
  /**
   * 创建错误处理器实例
   * @param {Object} config - 重试配置
   * @param {number} config.maxAttempts - 最大重试次数
   * @param {number} config.delay - 初始延迟（毫秒）
   * @param {number} config.backoffMultiplier - 退避倍数
   */
  constructor(config = {}) {
    this.config = {
      maxAttempts: 3,
      delay: 1000,
      backoffMultiplier: 2,
      ...config
    };
    this.offlineMode = false;
  }

  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @param {string} context.operation - 操作名称
   * @param {Object} [context.metadata] - 元数据
   * @returns {Promise<Object>} 错误处理结果
   */
  async handleError(error, context = {}) {
    // 记录错误日志
    this.logError(error, context);

    // 分类错误
    const classifiedError = this.classifyError(error);

    // 根据错误类型处理
    switch (classifiedError.code) {
      case 'NETWORK_ERROR':
        return { handled: true, action: 'retry' };

      case 'AUTH_ERROR':
        return { handled: true, action: 'abort' };

      case 'RATE_LIMIT_ERROR':
        return { handled: true, action: 'wait', waitTime: 60000 };

      case 'SERVER_ERROR':
        return { handled: true, action: 'retry' };

      default:
        return { handled: false, action: 'fallback' };
    }
  }

  /**
   * 分类错误
   * @param {Error} error - 错误对象
   * @returns {SupermemoryError} 分类后的错误
   */
  classifyError(error) {
    // 如果已经是 SupermemoryError，直接返回
    if (error instanceof SupermemoryError) {
      return error;
    }

    // 网络错误
    if (this.isNetworkError(error)) {
      return new NetworkError(error.message);
    }

    // 认证错误
    if (error.status === 401 || error.status === 403) {
      return new AuthError(error.message);
    }

    // 速率限制错误
    if (error.status === 429) {
      return new RateLimitError(error.message);
    }

    // 服务器错误
    if (error.status >= 500) {
      return new ServerError(error.message);
    }

    // 默认错误
    return new SupermemoryError(error.message, error.status);
  }

  /**
   * 检查是否为网络错误
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否为网络错误
   */
  isNetworkError(error) {
    const networkErrorCodes = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      'ECONNRESET'
    ];

    return (
      networkErrorCodes.includes(error.code) ||
      error.name === 'AbortError' ||
      error.message.includes('fetch failed') ||
      error.message.includes('network')
    );
  }

  /**
   * 重试操作
   * @param {Function} fn - 要重试的函数
   * @param {Object} [options] - 重试选项
   * @param {number} [options.maxAttempts] - 最大重试次数
   * @param {number} [options.delay] - 初始延迟（毫秒）
   * @param {number} [options.backoffMultiplier] - 退避倍数
   * @returns {Promise<any>} 操作结果
   */
  async retry(fn, options = {}) {
    const maxAttempts = options.maxAttempts || this.config.maxAttempts;
    const delay = options.delay || this.config.delay;
    const backoffMultiplier = options.backoffMultiplier || this.config.backoffMultiplier;

    let lastError;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 离线模式下直接抛出错误
        if (this.offlineMode) {
          throw error;
        }

        // 分类错误
        const classifiedError = this.classifyError(error);

        // 4xx 错误不重试（除了 429）
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }

        // 最后一次尝试失败
        if (attempt === maxAttempts) {
          throw error;
        }

        // 记录重试日志
        console.warn(
          `[ErrorHandler] 操作失败，${currentDelay}ms 后重试 (${attempt}/${maxAttempts}):`,
          error.message
        );

        // 等待
        await this.sleep(currentDelay);

        // 计算下一次延迟（指数退避）
        currentDelay *= backoffMultiplier;
      }
    }

    throw lastError;
  }

  /**
   * 降级操作
   * @param {Function} primary - 主函数
   * @param {Function} fallback - 备用函数
   * @returns {Promise<any>} 操作结果
   */
  async fallback(primary, fallback) {
    try {
      return await primary();
    } catch (error) {
      console.warn('[ErrorHandler] 主操作失败，使用降级策略:', error.message);
      return await fallback();
    }
  }

  /**
   * 启用离线模式
   */
  enableOfflineMode() {
    this.offlineMode = true;
    console.warn('[ErrorHandler] 离线模式已启用');
  }

  /**
   * 禁用离线模式
   */
  disableOfflineMode() {
    this.offlineMode = false;
    console.info('[ErrorHandler] 离线模式已禁用');
  }

  /**
   * 检查是否为离线模式
   * @returns {boolean} 是否为离线模式
   */
  isOfflineMode() {
    return this.offlineMode;
  }

  /**
   * 记录错误日志
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   */
  logError(error, context) {
    console.error(`[ErrorHandler] ${context.operation || '操作'} 失败:`, {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
      metadata: context.metadata,
      timestamp: Date.now()
    });
  }

  /**
   * 睡眠指定时间
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export {
  ErrorHandler,
  SupermemoryError,
  NetworkError,
  AuthError,
  RateLimitError,
  ServerError
};
