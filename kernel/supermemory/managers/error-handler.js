/**
 * Supermemory 错误处理器
 *
 * 统一处理 Supermemory API 错误，实现重试机制、降级策略和离线模式。
 */

/**
 * Supermemory 错误类
 */
class SupermemoryError extends Error {
  constructor(message, status = null, code = null) {
    super(message);
    this.name = 'SupermemoryError';
    this.status = status;
    this.code = code;
    this.type = 'UnknownError';
  }
}

/**
 * 网络错误类
 */
class NetworkError extends SupermemoryError {
  constructor(message) {
    super(message, null, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    this.type = 'NetworkError';
  }
}

/**
 * 认证错误类
 */
class AuthError extends SupermemoryError {
  constructor(message) {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthError';
    this.type = 'AuthError';
  }
}

/**
 * 速率限制错误类
 */
class RateLimitError extends SupermemoryError {
  constructor(message) {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
    this.type = 'RateLimitError';
  }
}

/**
 * 服务器错误类
 */
class ServerError extends SupermemoryError {
  constructor(message) {
    super(message, 500, 'SERVER_ERROR');
    this.name = 'ServerError';
    this.type = 'ServerError';
  }
}

/**
 * 错误处理器
 */
class ErrorHandler {
  constructor(config = {}) {
    this.config = {
      maxAttempts: 3,
      delay: 1000,
      backoffMultiplier: 2,
      ...config
    };
    this.offlineMode = false;
    // 统计信息
    this.stats = {
      totalRetries: 0,
      failedRetries: 0,
      successfulRetries: 0,
      fallbacksUsed: 0,
    };
  }

  /**
   * 分类错误
   */
  classifyError(error) {
    // 如果已经是 SupermemoryError，直接返回
    if (error instanceof SupermemoryError) {
      return error;
    }

    // 优先检查 code 字段（字符串形式）
    const code = error.code || error.status;
    if (typeof code === 'string') {
      if (code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' ||
          code === 'ENETUNREACH' || code === 'ECONNRESET' || code === 'NETWORK_ERROR') {
        return new NetworkError(error.message);
      }
      if (code === '401' || code === 'AUTH_ERROR' || code === '403') {
        return new AuthError(error.message);
      }
      if (code === '429' || code === 'RATE_LIMIT_ERROR') {
        return new RateLimitError(error.message);
      }
      if (code === '500' || code === 'SERVER_ERROR') {
        return new ServerError(error.message);
      }
    }

    // 检查 status 字段（数字形式）
    const status = error.status;
    if (typeof status === 'number') {
      if (status === 401 || status === 403) {
        return new AuthError(error.message);
      }
      if (status === 429) {
        return new RateLimitError(error.message);
      }
      if (status >= 500) {
        return new ServerError(error.message);
      }
    }

    // 检查网络错误码
    if (error.name === 'AbortError' || error.message?.includes('fetch failed')) {
      return new NetworkError(error.message);
    }

    return new SupermemoryError(error.message, error.status, error.code);
  }

  /**
   * 判断错误是否可重试
   */
  isRetryable(classifiedError) {
    if (classifiedError instanceof AuthError) return false;
    if (classifiedError instanceof SupermemoryError) {
      // 4xx 错误（除 429）不可重试
      if (classifiedError.status >= 400 && classifiedError.status < 500 && classifiedError.status !== 429) {
        return false;
      }
    }
    return true;
  }

  /**
   * 重试操作
   */
  async retry(fn, options = {}) {
    const maxAttempts = options.maxAttempts ?? this.config.maxAttempts;
    const delay = options.delay ?? this.config.delay;
    const backoffMultiplier = options.backoffMultiplier ?? this.config.backoffMultiplier;

    let lastError;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (this.offlineMode) {
          throw error;
        }

        const classifiedError = this.classifyError(error);

        // 不可重试的错误直接抛出
        if (!this.isRetryable(classifiedError)) {
          this.stats.failedRetries++;
          throw error;
        }

        if (attempt === maxAttempts) {
          this.stats.failedRetries++;
          throw error;
        }

        console.warn(
          `[ErrorHandler] 操作失败，${currentDelay}ms 后重试 (${attempt}/${maxAttempts}):`,
          error.message
        );

        await this.sleep(currentDelay);
        currentDelay *= backoffMultiplier;
      }
    }

    throw lastError;
  }

  /**
   * 降级操作
   */
  async fallback(primary, fallback) {
    try {
      return await primary();
    } catch (error) {
      this.stats.fallbacksUsed++;
      console.warn('[ErrorHandler] 主操作失败，使用降级策略:', error.message);
      return await fallback();
    }
  }

  /**
   * 根据错误类型获取降级策略
   */
  getFallbackStrategy(error) {
    const classifiedError = this.classifyError(error);

    if (classifiedError instanceof NetworkError) return 'OFFLINE';
    if (classifiedError instanceof AuthError) return 'ERROR';
    if (classifiedError instanceof RateLimitError) return 'RETRY';
    if (classifiedError instanceof ServerError) return 'CACHE';
    return 'FALLBACK';
  }

  /**
   * 执行带降级的操作
   */
  async executeWithFallback(primaryFn, fallbackFn) {
    try {
      return await primaryFn();
    } catch (error) {
      const strategy = this.getFallbackStrategy(error);
      if (strategy === 'ERROR') {
        throw error;
      }
      if (strategy === 'FALLBACK' && fallbackFn) {
        return await fallbackFn();
      }
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalRetries: 0,
      failedRetries: 0,
      successfulRetries: 0,
      fallbacksUsed: 0,
    };
  }

  enableOfflineMode() {
    this.offlineMode = true;
    console.warn('[ErrorHandler] 离线模式已启用');
  }

  disableOfflineMode() {
    this.offlineMode = false;
    console.info('[ErrorHandler] 离线模式已禁用');
  }

  isOfflineMode() {
    return this.offlineMode;
  }

  logError(error, context = {}) {
    console.error(`[ErrorHandler] ${context.operation || '操作'} 失败:`, {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
      metadata: context.metadata,
      timestamp: Date.now(),
    });
  }

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
  ServerError,
};
