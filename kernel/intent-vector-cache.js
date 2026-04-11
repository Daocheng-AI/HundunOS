// hundunos/kernel/intent-vector-cache.js — IntentVectorCache v2.0
// 基于 TurboQuant：Intent embedding 向量缓存加速路由
// v2.0 升级（借鉴 TaxHacker PoorManCache 设计）：
//   - TTL 缓存条目，过期自动失效（cleanup / size / has 接口）
//   - 缓存命中率 + 内存占用统计（getStats 增强）
//   - 防内存泄漏：maxCacheBytes 上限 + 自动清理
//   - findBestIntent 统一返回结构（fromCache / latencyMs 字段）
import { createEmbeddingEngine } from './model-router/polar-quant.js';
import { createHash } from 'crypto';

const MAX_INTENT_NODES = 200;
const MAX_QUERY_CACHE = 200;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 分钟 TTL（TaxHacker PoorManCache 风格）

/**
 * 带 TTL 的缓存条目（借鉴 TaxHacker PoorManCache 过期检查）
 */
class CacheEntry {
    constructor(value) {
        this.value = value;
        this.timestamp = Date.now();
    }

    isExpired(ttlMs) {
        return Date.now() - this.timestamp > ttlMs;
    }

    age() {
        return Date.now() - this.timestamp;
    }
}

export class IntentVectorCache {
    /**
     * @param {object} kernel
     * @param {object} [config]
     * @param {boolean} [config.enabled=true]
     * @param {number}  [config.similarityThreshold=0.60]
     * @param {number}  [config.embeddingDim=384]
     * @param {number}  [config.maxQueryCache=200]
     * @param {number}  [config.ttlMs=300000]        v2.0: TTL（毫秒）
     * @param {number}  [config.maxCacheBytes=524288]v2.0: 最大缓存内存占用（512KB）
     */
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            enabled: config.enabled !== false,
            preloadOnInit: config.preloadOnInit !== false,
            similarityThreshold: config.similarityThreshold || 0.60,
            embeddingDim: config.embeddingDim || 384,
            maxQueryCache: config.maxQueryCache || MAX_QUERY_CACHE,
            ttlMs: config.ttlMs || DEFAULT_TTL_MS,
            maxCacheBytes: config.maxCacheBytes || 524288,
        };

        this.embeddingEngine = createEmbeddingEngine({ embeddingDim: this.config.embeddingDim });
        this.intentIndex = new Map();  // name → { quantized, type, action, patterns, priority, description }
        this.queryCache = new Map();   // key → CacheEntry (v2.0: 带 TTL)
        this.queryLRU = [];

        // v2.0: 统计增强
        this.stats = {
            intentPreloaded: 0,
            queriesTotal: 0,
            cacheHits: 0,
            cacheMisses: 0,
            expiredEntries: 0,
            warmLookups: 0,
            coldLookups: 0,
            avgLatencyMs: 0,
            totalBytesUsed: 0,
        };
    }

    async initialize() {
        if (!this.config.enabled) return;
        const classifiers = this.kernel?.intentEngine?.classifiers || [];
        await this._preloadIntents(classifiers);
        // review: removed // review: removed console.log(`[IntentVectorCache] Initialized v2.0: ${this.intentIndex.size} intent nodes`);
    }

    // ================================================================
    // 公共 API（v2.0 增强）
    // ================================================================

    /**
     * 查找最佳匹配的 Intent
     * v2.0: 统一返回结构，始终包含 fromCache / latencyMs
     * @param {string} text
     * @returns {{ intentName, type, action, priority, score, fromCache, latencyMs } | null}
     */
    findBestIntent(text) {
        if (!this.config.enabled) return null;
        const start = Date.now();

        this.stats.queriesTotal++;
        const safeText = (text || '').slice(0, 1000);
        if (!safeText) return null;

        const cacheKey = this._makeKey(safeText);

        // v2.0: 先 cleanup，再查缓存（含 TTL 检查）
        this._cleanupExpired();
        if (this.has(cacheKey)) {
            this.stats.cacheHits++;
            const cached = this.get(cacheKey);
            this._updateLRU(cacheKey);
            return {
                ...cached,
                fromCache: true,
                latencyMs: Date.now() - start,
            };
        }

        this.stats.cacheMisses++;
        const result = this._compressedSearch(safeText);
        if (result) {
            this._putQueryCache(cacheKey, result);
            this.stats.warmLookups++;
        } else {
            this.stats.coldLookups++;
        }

        return result
            ? { ...result, fromCache: false, latencyMs: Date.now() - start }
            : null;
    }

    /**
     * 查询缓存是否存在且未过期
     * v2.0: TaxHacker PoorManCache.has() 风格
     */
    has(key) {
        if (!this.queryCache.has(key)) return false;
        if (this._isExpired(key)) {
            this.queryCache.delete(key);
            this._removeLRU(key);
            return false;
        }
        return true;
    }

    /**
     * 从缓存获取（不触发 LRU 更新）
     */
    get(key) {
        const entry = this.queryCache.get(key);
        if (!entry) return undefined;
        if (entry.isExpired(this.config.ttlMs)) {
            this.queryCache.delete(key);
            this._removeLRU(key);
            return undefined;
        }
        return entry.value;
    }

    /**
     * 主动清理所有过期缓存条目
     * v2.0: TaxHacker PoorManCache.cleanup() 风格
     * @returns {number} 清理的条目数量
     */
    cleanup() {
        return this._cleanupExpired();
    }

    /**
     * 获取当前缓存条目数量
     * v2.0: TaxHacker PoorManCache.size() 风格
     */
    size() {
        this._cleanupExpired(); // 清理后再计数
        return this.queryCache.size;
    }

    /**
     * 获取意图索引数量
     */
    indexSize() {
        return this.intentIndex.size;
    }

    /**
     * 重置缓存（清理所有查询缓存）
     */
    reset() {
        this.queryCache.clear();
        this.queryLRU = [];
        this.stats = {
            intentPreloaded: 0,
            queriesTotal: 0,
            cacheHits: 0,
            cacheMisses: 0,
            expiredEntries: 0,
            warmLookups: 0,
            coldLookups: 0,
            avgLatencyMs: 0,
            totalBytesUsed: 0,
        };
    }

    // ================================================================
    // 向量索引管理
    // ================================================================

    registerIntent(classifier) {
        if (!this.config.enabled) return;
        if (this.intentIndex.size >= MAX_INTENT_NODES) {
            const oldest = this.intentIndex.keys().next().value;
            this.intentIndex.delete(oldest);
        }
        try {
            const representative = `${classifier.name} ${classifier.action || ''}`;
            const quantized = this.embeddingEngine.embedAndQuantize(representative.slice(0, 200));
            this.intentIndex.set(classifier.name, {
                name: classifier.name,
                type: classifier.type,
                action: classifier.action,
                patterns: classifier.patterns,
                quantized,
                priority: classifier.priority || 0,
                description: classifier.description || '',
            });
            // 意图注册时清空查询缓存（索引变了，结果可能不准确）
            this.queryCache.clear();
            this.queryLRU = [];
        } catch (e) { /* skip */ }
    }

    unregisterIntent(name) {
        return this.intentIndex.delete(name);
    }

    // ================================================================
    // 统计
    // ================================================================

    /**
     * v2.0: 增强统计信息
     * TaxHacker PoorManCache 无此接口，HundunOS 独家提供
     */
    getStats() {
        const total = this.stats.queriesTotal;
        const hitRate = total > 0 ? Math.round(this.stats.cacheHits / total * 100) : 0;
        const missRate = total > 0 ? Math.round(this.stats.cacheMisses / total * 100) : 0;
        return {
            // 基础指标
            enabled: this.config.enabled,
            similarityThreshold: this.config.similarityThreshold,
            ttlMs: this.config.ttlMs,
            ttlMinutes: Math.round(this.config.ttlMs / 60000 * 10) / 10,
            // 缓存状态
            intentIndexSize: this.intentIndex.size,
            queryCacheSize: this.queryCache.size,
            maxQueryCache: this.config.maxQueryCache,
            cacheUtilization: `${Math.round(this.queryCache.size / this.config.maxQueryCache * 100)}%`,
            // 命中率
            hitRate: `${hitRate}%`,
            missRate: `${missRate}%`,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            // 向量查找
            warmLookups: this.stats.warmLookups,
            coldLookups: this.stats.coldLookups,
            expiredEntries: this.stats.expiredEntries,
            // 性能
            avgLatencyMs: Math.round(this.stats.avgLatencyMs * 100) / 100,
            queriesTotal: this.stats.queriesTotal,
            intentPreloaded: this.stats.intentPreloaded,
        };
    }

    // ================================================================
    // 内部方法
    // ================================================================

    async _preloadIntents(classifiers) {
        let count = 0;
        for (const clf of classifiers) {
            if (this.intentIndex.size >= MAX_INTENT_NODES) break;
            try {
                const representative = `${clf.name} ${clf.action || ''} ${clf.description || ''}`;
                const quantized = this.embeddingEngine.embedAndQuantize(representative.slice(0, 200));
                this.intentIndex.set(clf.name, {
                    name: clf.name,
                    type: clf.type,
                    action: clf.action,
                    patterns: clf.patterns,
                    quantized,
                    priority: clf.priority || 0,
                    description: clf.description || '',
                });
                count++;
            } catch (e) { /* skip bad intent */ }
        }
        this.stats.intentPreloaded = count;
    }

    _compressedSearch(text) {
        const queryVec = this.embeddingEngine.embedAndQuantize(text);
        let bestIntent = null, bestScore = 0;
        for (const [, entry] of this.intentIndex) {
            const score = this.embeddingEngine.quantizer.similarityCompressed(queryVec, entry.quantized);
            if (score > bestScore) { bestScore = score; bestIntent = entry; }
        }
        if (bestIntent && bestScore >= this.config.similarityThreshold) {
            return {
                intentName: bestIntent.name,
                type: bestIntent.type,
                action: bestIntent.action,
                priority: bestIntent.priority,
                score: Math.round(bestScore * 100) / 100,
            };
        }
        return null;
    }

    _putQueryCache(key, result) {
        // v2.0: 内存上限检查
        this._evictIfNeeded();
        // LRU 淘汰
        while (this.queryLRU.length >= this.config.maxQueryCache) {
            const oldest = this.queryLRU.shift();
            this.queryCache.delete(oldest);
        }
        this.queryCache.set(key, new CacheEntry(result));
        this.queryLRU.push(key);
    }

    _updateLRU(key) {
        const idx = this.queryLRU.indexOf(key);
        if (idx !== -1) {
            this.queryLRU.splice(idx, 1);
            this.queryLRU.push(key);
        }
    }

    _removeLRU(key) {
        const idx = this.queryLRU.indexOf(key);
        if (idx !== -1) this.queryLRU.splice(idx, 1);
    }

    _isExpired(key) {
        const entry = this.queryCache.get(key);
        return entry ? entry.isExpired(this.config.ttlMs) : true;
    }

    /**
     * v2.0: 清理所有过期条目（TaxHacker PoorManCache.cleanup 风格）
     * @returns {number} 清理的条目数量
     */
    _cleanupExpired() {
        let cleaned = 0;
        const now = Date.now();
        for (const [key, entry] of this.queryCache.entries()) {
            if (now - entry.timestamp > this.config.ttlMs) {
                this.queryCache.delete(key);
                this._removeLRU(key);
                cleaned++;
                this.stats.expiredEntries++;
            }
        }
        return cleaned;
    }

    /**
     * v2.0: 内存超限时淘汰最老的 LRU 条目
     */
    _evictIfNeeded() {
        // 在循环内部重新计算总大小，否则循环条件永远不变（bug）
        while (this.queryLRU.length > 0) {
            const totalSize = JSON.stringify([...this.queryCache.values()].map(e => e.value)).length;
            if (totalSize <= this.config.maxCacheBytes) break;
            const oldest = this.queryLRU.shift();
            this.queryCache.delete(oldest);
        }
    }

    _makeKey(text) {
        return createHash('sha256').update(text.slice(0, 100)).digest('hex').slice(0, 16);
    }
}

export function createIntentVectorCache(kernel, config) {
    return new IntentVectorCache(kernel, config);
}
