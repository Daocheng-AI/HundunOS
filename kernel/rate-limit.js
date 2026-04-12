/**
 * HundunOS v4.3 - Rate Limiting 管理器
 * 实现 Token Bucket 和 Sliding Window 算法
 */

/**
 * Token Bucket 限流器
 */
export class TokenBucketRateLimiter {
  constructor(options = {}) {
    this.capacity = options.capacity || 100;
    this.refillRate = options.refillRate || 10; // tokens per second
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * 尝试获取 token
   */
  tryConsume(tokens = 1) {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return { allowed: true, tokens: this.tokens };
    }
    return { allowed: false, tokens: this.tokens };
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      capacity: this.capacity,
      tokens: this.tokens,
      refillRate: this.refillRate,
    };
  }
}

/**
 * Sliding Window 限流器
 */
export class SlidingWindowRateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowSize = options.windowSize || 60000; // 1 minute
    this.requests = [];
  }

  /**
   * 尝试获取请求
   */
  tryRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(r => r > now - this.windowSize);

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return { allowed: true, count: this.requests.length };
    }
    return { allowed: false, count: this.requests.length };
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      maxRequests: this.maxRequests,
      windowSize: this.windowSize,
      count: this.requests.length,
    };
  }
}

/**
 * Rate Limiting 管理器
 */
export class RateLimitManager {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.limiters = new Map();
    this.enabled = options.enabled !== false;
    this.defaultLimit = options.defaultLimit || {
      windowMs: 60000,
      maxRequests: 100,
      burst: 10,
    };
  }

  /**
   * 获取限流器
   */
  getLimiter(key, options = {}) {
    if (!this.limiters.has(key)) {
      const algorithm = options.algorithm || 'token-bucket';
      const limiter = algorithm === 'token-bucket'
        ? new TokenBucketRateLimiter(options)
        : new SlidingWindowRateLimiter(options);
      this.limiters.set(key, limiter);
    }
    return this.limiters.get(key);
  }

  /**
   * 检查是否允许请求
   */
  async check(key, options = {}) {
    if (!this.enabled) return { allowed: true };

    const limiter = this.getLimiter(key, options);
    return limiter.tryRequest();
  }

  /**
   * 获取统计
   */
  getStats() {
    const stats = {};
    for (const [key, limiter] of this.limiters) {
      stats[key] = limiter.getStats();
    }
    return stats;
  }
}

export default { TokenBucketRateLimiter, SlidingWindowRateLimiter, RateLimitManager };
