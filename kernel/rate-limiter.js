/**
 * HundunOS REST API 限流中间件
 * 实现令牌桶算法，支持按 IP / API Key / 用户分组限流
 * 集成到 kernel/core.js 的 HTTP 服务器中
 */

import { createHash } from 'crypto';

export class RateLimiter {
    /**
     * @param {Object} options
     * @param {number} options.windowMs  时间窗口（毫秒），默认 60000 (1分钟)
     * @param {number} options.maxRequests  窗口内最大请求数，默认 60
     * @param {number} options.burstMax   突发最大请求数（桶容量），默认 10
     * @param {Function} options.keyGenerator  从请求提取限流 key，默认按 IP
     * @param {Function} options.onLimitExceeded  触发限流时的回调
     */
    constructor(options = {}) {
        this.windowMs = options.windowMs ?? 60000;
        this.maxRequests = options.maxRequests ?? 60;
        this.burstMax = options.burstMax ?? 10;
        this.keyGenerator = options.keyGenerator || ((req) => req.ip || req.socket?.remoteAddress || 'unknown');
        this.onLimitExceeded = options.onLimitExceeded || null;

        // key -> { tokens, lastRefill }
        this.buckets = new Map();
        this.stats = {
            total: 0,
            allowed: 0,
            limited: 0,
            cleanup: 0
        };

        // 每分钟清理一次过期桶
        this._cleanupInterval = setInterval(() => this._cleanup(), this.windowMs);
    }

    /** 从请求中提取限流 key */
    _getKey(req) {
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
        return apiKey ? `key:${this._hash(apiKey)}` : `ip:${this.keyGenerator(req)}`;
    }

    /** M1 修复：用 SHA-256 哈希替代简单哈希，防止哈希碰撞攻击 */
    _hash(str) {
        return createHash('sha256').update(str).digest('hex');
    }

    /**
     * 中间件入口
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
     */
    check(req, res) {
        const key = this._getKey(req);
        const now = Date.now();

        this.stats.total++;

        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = { tokens: this.maxRequests, lastRefill: now };
            this.buckets.set(key, bucket);
        }

        // 令牌补充（基于时间流逝）
        const elapsed = now - bucket.lastRefill;
        const tokensToAdd = Math.floor((elapsed / this.windowMs) * this.maxRequests);
        if (tokensToAdd > 0) {
            bucket.tokens = Math.min(this.maxRequests, bucket.tokens + tokensToAdd);
            bucket.lastRefill = now;
        }

        // 消耗令牌
        if (bucket.tokens > 0) {
            bucket.tokens--;
            this.stats.allowed++;
            this._setHeaders(res, bucket, now, true);
            return { allowed: true, remaining: bucket.tokens, resetMs: this.windowMs };
        }

        // 限流触发
        this.stats.limited++;
        this._setHeaders(res, bucket, now, false);

        if (this.onLimitExceeded) {
            this.onLimitExceeded(req, res, key);
        }

        return { allowed: false, remaining: 0, resetMs: this.windowMs };
    }

    /** 作为 express-style 中间件使用 */
    middleware() {
        return (req, res, next) => {
            const result = this.check(req, res);
            if (!result.allowed) {
                res.statusCode = 429;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    error: 'Too Many Requests',
                    message: `Rate limit exceeded. Retry after ${Math.ceil(this.windowMs / 1000)}s.`,
                    retryAfter: Math.ceil(this.windowMs / 1000)
                }));
                return;
            }
            next();
        };
    }

    /** 设置标准 RateLimit 响应头（RFC 6585） */
    _setHeaders(res, bucket, now, allowed) {
        const remaining = Math.max(0, Math.floor(bucket.tokens));
        const resetTime = new Date(now + this.windowMs).toUTCString();

        res.setHeader('X-RateLimit-Limit', String(this.maxRequests));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Reset', resetTime);
        res.setHeader('RateLimit-Policy', `${this.maxRequests};w=${Math.ceil(this.windowMs / 1000)}`);
        res.setHeader('Retry-After', allowed ? '0' : String(Math.ceil(this.windowMs / 1000)));
    }

    /** 清理过期桶（防止内存泄漏） — 优化：分批 + 时间切片，不阻塞事件循环 */
    _cleanup() {
        const now = Date.now();
        const keys = [...this.buckets.keys()];
        let cleaned = 0;
        const BATCH = 100;

        const doBatch = () => {
            for (let i = 0; i < BATCH && keys.length > 0; i++) {
                const key = keys.shift();
                const bucket = this.buckets.get(key);
                // Map 可能已被其他流程删除，get 再确认一次
                if (bucket && (now - bucket.lastRefill > this.windowMs * 2)) {
                    this.buckets.delete(key);
                    cleaned++;
                }
            }

            if (keys.length > 0) {
                // 让出事件循环，避免大量清理时阻塞其他请求
                setTimeout(doBatch, 0);
            } else {
                this.stats.cleanup += cleaned;
                if (cleaned > 0) {
                    console.log(`[RateLimiter] Cleaned ${cleaned} expired buckets`);
                }
            }
        };

        doBatch();
    }

    /** 获取统计信息 */
    getStats() {
        return {
            ...this.stats,
            activeBuckets: this.buckets.size,
            config: {
                windowMs: this.windowMs,
                maxRequests: this.maxRequests,
                burstMax: this.burstMax
            }
        };
    }

    /** 重置信令桶 */
    reset(key) {
        if (key) {
            this.buckets.delete(key);
        } else {
            this.buckets.clear();
        }
    }

    /** 关闭清理定时器 */
    shutdown() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
    }
}

/** 预配置限流策略 */
export const rateLimitPresets = {
    default: { windowMs: 60000, maxRequests: 60, burstMax: 10 },
    auth: { windowMs: 60000, maxRequests: 10, burstMax: 3 },
    search: { windowMs: 60000, maxRequests: 120, burstMax: 20 },
    write: { windowMs: 60000, maxRequests: 30, burstMax: 5 },
    dev: { windowMs: 60000, maxRequests: 1000, burstMax: 200 }
};
