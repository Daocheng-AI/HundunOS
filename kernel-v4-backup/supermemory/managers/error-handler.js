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
      delay: 100,
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
    // 优先检查 code 字段（字符串形式）
    const code = error.code || error.status;
    if (typeof code === 'string') {
      if (code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' ||
          code === 'ENETUNREACH' || code === 'ECONNRESET' || code === 'NETWORK_ERROR') {
        return { type: 'NetworkError', retryable: true };
      }
      if (code === '401' || code === 'AUTH_ERROR' || code === '403') {
        return { type: 'AuthError', retryable: false };
      }
      if (code === '429' || code === 'RATE_LIMIT_ERROR') {
        return { type: 'RateLimitError', retryable: true };
      }
      if (code === '500' || code === 'SERVER_ERROR') {
        return { type: 'ServerError', retryable: true };
      }
    }

    // 检查 status 字段（数字形式）
    const status = error.status;
    if (typeof status === 'number') {
      if (status === 401 || status === 403) {
        return { type: 'AuthError', retryable: false };
      }
      if (status === 429) {
        return { type: 'RateLimitError', retryable: true };
      }
      if (status >= 500) {
        return { type: 'ServerError', retryable: true };
      }
    }

// 检查网络错误码
    if (error.name === 'AbortError' || error.message?.includes('fetch failed')) {
      return { type: 'NetworkError', retryable: true };
    }

    // 未知错误默认可重试（除非明确不可重试）
    return { type: 'UnknownError', retryable: true };
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
          this.stats.failedRetries++;
          return Promise.reject(error);
        }

        const classification = this.classifyError(error);

        // 不可重试的错误直接返回 rejected promise
        if (!classification.retryable) {
          this.stats.failedRetries++;
          return Promise.reject(error);
        }

        // 尝试重试前统计
        this.stats.totalRetries++;

        if (attempt === maxAttempts) {
          this.stats.failedRetries++;
          return Promise.reject(error);
        }

        console.warn(
          `[ErrorHandler] 操作失败，${currentDelay}ms 后重试 (${attempt}/${maxAttempts}):`,
          error.message
        );

        await this.sleep(currentDelay);
        currentDelay *= backoffMultiplier;
        // 重试成功前的失败已计入 totalRetries，成功后返回结果
        this.stats.successfulRetries++;
      }
    }

    return Promise.reject(lastError);
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
    const classification = this.classifyError(error);

    if (classification.type === 'NetworkError') return 'OFFLINE';
    if (classification.type === 'AuthError') return 'ERROR';
    if (classification.type === 'RateLimitError') return 'RETRY';
    if (classification.type === 'ServerError') return 'CACHE';
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
    return {
      totalRetries: this.stats.totalRetries,
      successfulRetries: this.stats.successfulRetries,
      failedRetries: this.stats.failedRetries,
      fallbacksUsed: this.stats.fallbacksUsed,
    };
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
    // console.info('[ErrorHandler] 离线模式已禁用');
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
    return new Promise(resolve => {
      globalThis.setTimeout(resolve, ms);
    });
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
