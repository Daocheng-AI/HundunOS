/**
 * 限流中间件
 * @module infrastructure/admin/api/middlewares/rate-limit
 */

import { ErrorCodes, ResponseSchema } from '../../core/response.js';

/**
 * 内存存储
 */
class MemoryStore {
  constructor() {
    this.hits = new Map();
    this.resetTime = new Map();
  }

  async increment(key) {
    const now = Date.now();
    const resetTime = this.resetTime.get(key) || 0;

    // 如果已重置，重新计数
    if (now > resetTime) {
      this.hits.set(key, 1);
      this.resetTime.set(key, now + this.windowMs);
      return { total: 1, resetTime: now + this.windowMs };
    }

    const total = (this.hits.get(key) || 0) + 1;
    this.hits.set(key, total);
    return { total, resetTime };
  }

  async decrement(key) {
    const total = (this.hits.get(key) || 1) - 1;
    this.hits.set(key, Math.max(0, total));
  }

  async reset(key) {
    this.hits.delete(key);
    this.resetTime.delete(key);
  }

  async resetAll() {
    this.hits.clear();
    this.resetTime.clear();
  }
}

/**
 * 限流中间件工厂
 * @param {Object} [options={}] - 配置选项
 * @param {number} [options.windowMs=60000] - 时间窗口（毫秒）
 * @param {number} [options.max=100] - 最大请求数
 * @param {number} [options.burstMax=150] - 突发最大请求数
 * @param {string} [options.keyGenerator] - 键生成策略: 'ip', 'user', 'ip+user'
 * @param {Function} [options.customKeyGenerator] - 自定义键生成函数
 * @param {string} [options.message] - 限流消息
 * @param {number} [options.statusCode=429] - 限流状态码
 * @param {boolean} [options.headers=true] - 是否在响应头中显示限流信息
 * @returns {Function} 中间件函数
 */
export function createRateLimitMiddleware(options = {}) {
  const {
    windowMs = 60000,
    max = 100,
    burstMax = 150,
    keyGenerator = 'ip',
    customKeyGenerator,
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    headers = true,
  } = options;

  const store = new MemoryStore();
  store.windowMs = windowMs;

  /**
   * 生成限流键
   */
  function getKey(req) {
    if (customKeyGenerator) {
      return customKeyGenerator(req);
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               'unknown';

    const user = req.user;

    switch (keyGenerator) {
      case 'user':
        return user?.id || ip;
      case 'ip+user':
        return user ? `${ip}:${user.id}` : ip;
      case 'ip':
      default:
        return ip;
    }
  }

  return async function rateLimitMiddleware(req, res, next) {
    const key = getKey(req);
    const { total, resetTime } = await store.increment(key);

    // 设置响应头
    if (headers) {
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - total));
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
    }

    // 检查是否超限
    const limit = user?.isSuperAdmin ? burstMax : max;
    if (total > limit) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter);

      return res.status(statusCode).json(
        ResponseSchema.error(
          ErrorCodes.SERVICE_UNAVAILABLE,
          message,
          { retryAfter, limit, current: total }
        )
      );
    }

    next();
  };
}

/**
 * 滑动窗口限流
 * 更精确的限流算法
 */
export function createSlidingWindowRateLimit(options = {}) {
  const {
    windowMs = 60000,
    max = 100,
    keyGenerator = 'ip',
    customKeyGenerator,
    message = 'Too many requests, please try again later.',
    statusCode = 429,
  } = options;

  const requests = new Map();

  function getKey(req) {
    if (customKeyGenerator) {
      return customKeyGenerator(req);
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.connection?.remoteAddress ||
               'unknown';

    const user = req.user;

    switch (keyGenerator) {
      case 'user':
        return user?.id || ip;
      case 'ip+user':
        return user ? `${ip}:${user.id}` : ip;
      default:
        return ip;
    }
  }

  return async function slidingWindowMiddleware(req, res, next) {
    const key = getKey(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // 获取请求时间戳列表
    let timestamps = requests.get(key) || [];
    
    // 移除过期的请求
    timestamps = timestamps.filter(t => t > windowStart);
    
    // 检查是否超限
    if (timestamps.length >= max) {
      const oldestRequest = timestamps[0];
      const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);

      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);

      return res.status(statusCode).json(
        ResponseSchema.error(
          ErrorCodes.SERVICE_UNAVAILABLE,
          message,
          { retryAfter }
        )
      );
    }

    // 记录当前请求
    timestamps.push(now);
    requests.set(key, timestamps);

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - timestamps.length);

    next();
  };
}

/**
 * 令牌桶限流
 * 允许突发流量
 */
export function createTokenBucketRateLimit(options = {}) {
  const {
    bucketSize = 100,
    refillRate = 10, // 每秒补充的令牌数
    keyGenerator = 'ip',
    customKeyGenerator,
    message = 'Too many requests, please try again later.',
    statusCode = 429,
  } = options;

  const buckets = new Map();

  function getKey(req) {
    if (customKeyGenerator) {
      return customKeyGenerator(req);
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.connection?.remoteAddress ||
               'unknown';

    return ip;
  }

  return async function tokenBucketMiddleware(req, res, next) {
    const key = getKey(req);
    const now = Date.now();

    // 获取或创建令牌桶
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: bucketSize, lastRefill: now };
      buckets.set(key, bucket);
    }

    // 补充令牌
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(bucketSize, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    // 检查是否有令牌
    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate);

      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', bucketSize);
      res.setHeader('X-RateLimit-Remaining', 0);

      return res.status(statusCode).json(
        ResponseSchema.error(
          ErrorCodes.SERVICE_UNAVAILABLE,
          message,
          { retryAfter }
        )
      );
    }

    // 消耗一个令牌
    bucket.tokens -= 1;

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', bucketSize);
    res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens));

    next();
  };
}

/**
 * 默认限流中间件
 */
export const rateLimitMiddleware = createRateLimitMiddleware();

/**
 * 严格限流中间件（用于敏感操作）
 */
export const strictRateLimitMiddleware = createRateLimitMiddleware({
  windowMs: 60000,
  max: 10,
  burstMax: 20,
});

export default {
  createRateLimitMiddleware,
  createSlidingWindowRateLimit,
  createTokenBucketRateLimit,
  rateLimitMiddleware,
  strictRateLimitMiddleware,
};
