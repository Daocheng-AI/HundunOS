/**
 * kernel/multi-level-cache.js
 * 多级缓存系统（内存层）
 * 
 * 借鉴 TradingAgents-CN 的缓存优化方案
 * L1: 内存缓存（快速访问）
 * L2: 磁盘缓存（持久化）
 * L3: 分布式缓存（可选）
 */

import { LRUCache } from 'lru-cache';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * 缓存条目
 */
class CacheEntry {
    constructor(value, metadata = {}) {
        this.value = value;
        this.metadata = {
            createdAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 0,
            size: this._estimateSize(value),
            ...metadata
        };
    }

    _estimateSize(value) {
        if (typeof value === 'string') {
            return Buffer.byteLength(value, 'utf8');
        } else if (Buffer.isBuffer(value)) {
            return value.length;
        } else if (typeof value === 'object') {
            try {
                return Buffer.byteLength(JSON.stringify(value), 'utf8');
            } catch {
                return 1024; // 默认 1KB
            }
        }
        return 1024; // 默认 1KB
    }

    touch() {
        this.metadata.accessedAt = Date.now();
        this.metadata.accessCount++;
        return this;
    }

    get age() {
        return Date.now() - this.metadata.createdAt;
    }

    isExpired(ttl) {
        return ttl > 0 && this.age > ttl;
    }
}

/**
 * L1 缓存：内存缓存（快速访问）
 */
class L1MemoryCache {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 1000;
        this.maxMemoryMB = options.maxMemoryMB || 100; // 最大内存 100MB
        this.ttl = options.ttl || 3600000; // 1小时
        this.enabled = options.enabled !== false;

        this.cache = new LRUCache({
            max: this.maxSize,
            maxSize: this.maxMemoryMB * 1024 * 1024, // 转换为字节
            sizeCalculation: (value) => value.metadata.size,
            ttl: this.ttl,
            updateAgeOnGet: true,
            updateAgeOnHas: true,
        });

        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            size: 0,
            maxSize: this.maxSize,
            maxMemoryMB: this.maxMemoryMB,
        };
    }

    get(key) {
        if (!this.enabled) return null;

        const entry = this.cache.get(key);
        if (entry) {
            this.stats.hits++;
            entry.touch();
            return entry.value;
        } else {
            this.stats.misses++;
            return null;
        }
    }

    set(key, value, metadata = {}) {
        if (!this.enabled) return false;

        const entry = new CacheEntry(value, metadata);
        const oldEntry = this.cache.get(key);
        
        if (oldEntry) {
            this.stats.size -= oldEntry.metadata.size;
        }
        
        this.cache.set(key, entry);
        this.stats.size += entry.metadata.size;
        
        return true;
    }

    delete(key) {
        if (!this.enabled) return false;

        const entry = this.cache.get(key);
        if (entry) {
            this.stats.size -= entry.metadata.size;
        }
        
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
        this.stats.size = 0;
        this.stats.evictions = 0;
    }

    has(key) {
        return this.enabled && this.cache.has(key);
    }

    keys() {
        return this.enabled ? Array.from(this.cache.keys()) : [];
    }

    getStats() {
        return {
            ...this.stats,
            enabled: this.enabled,
            hitRate: this.stats.hits + this.stats.misses > 0 
                ? (this.stats.hits / (this.stats.hits + this.stats.misses)).toFixed(4)
                : 0,
            currentSize: this.stats.size,
            entryCount: this.cache.size,
        };
    }
}

/**
 * L2 缓存：磁盘缓存（持久化）
 */
class L2DiskCache {
    constructor(options = {}) {
        this.baseDir = options.baseDir || '.hundunos/cache';
        this.maxSizeMB = options.maxSizeMB || 1024; // 最大 1GB
        this.ttl = options.ttl || 86400000; // 24小时
        this.enabled = options.enabled !== false;
        this.compression = options.compression !== false;

        if (this.enabled) {
            mkdirSync(this.baseDir, { recursive: true });
        }

        this.stats = {
            hits: 0,
            misses: 0,
            writes: 0,
            deletes: 0,
            size: 0,
            maxSizeMB: this.maxSizeMB,
        };
    }

    _getFilePath(key) {
        // 使用哈希避免文件名冲突
        const hash = this._hashKey(key);
        const subDir = hash.substring(0, 2);
        const dirPath = join(this.baseDir, subDir);
        
        if (this.enabled && !existsSync(dirPath)) {
            mkdirSync(dirPath, { recursive: true });
        }
        
        return join(dirPath, `${hash}.json`);
    }

    _hashKey(key) {
        // 简单哈希函数
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash << 5) - hash) + key.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    get(key) {
        if (!this.enabled) return null;

        const filePath = this._getFilePath(key);
        
        try {
            if (!existsSync(filePath)) {
                this.stats.misses++;
                return null;
            }

            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            
            // 检查是否过期
            if (data.expiresAt && Date.now() > data.expiresAt) {
                this.delete(key);
                this.stats.misses++;
                return null;
            }

            this.stats.hits++;
            return data.value;
        } catch (error) {
            console.warn(`[L2DiskCache] Failed to read cache for key ${key}:`, error.message);
            this.stats.misses++;
            return null;
        }
    }

    set(key, value, metadata = {}) {
        if (!this.enabled) return false;

        const filePath = this._getFilePath(key);
        const expiresAt = this.ttl > 0 ? Date.now() + this.ttl : null;
        
        const data = {
            key,
            value,
            metadata: {
                ...metadata,
                createdAt: Date.now(),
                expiresAt,
                size: this._estimateSize(value),
            },
        };

        try {
            writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            this.stats.writes++;
            
            // 更新大小统计
            const fileStats = existsSync(filePath) ? require('fs').statSync(filePath) : { size: 0 };
            this.stats.size += fileStats.size;
            
            // 检查是否超过大小限制
            this._enforceSizeLimit();
            
            return true;
        } catch (error) {
            console.warn(`[L2DiskCache] Failed to write cache for key ${key}:`, error.message);
            return false;
        }
    }

    _estimateSize(value) {
        if (typeof value === 'string') {
            return Buffer.byteLength(value, 'utf8');
        } else if (Buffer.isBuffer(value)) {
            return value.length;
        } else if (typeof value === 'object') {
            try {
                return Buffer.byteLength(JSON.stringify(value), 'utf8');
            } catch {
                return 1024;
            }
        }
        return 1024;
    }

    _enforceSizeLimit() {
        const maxSizeBytes = this.maxSizeMB * 1024 * 1024;
        if (this.stats.size <= maxSizeBytes) return;

        // 简单的 LRU 清理：删除最旧的文件
        try {
            const files = this._getAllCacheFiles();
            files.sort((a, b) => a.mtimeMs - b.mtimeMs); // 按修改时间排序
            
            let freed = 0;
            for (const file of files) {
                if (this.stats.size - freed <= maxSizeBytes * 0.8) break; // 保留 80% 空间
                
                try {
                    const fileSize = file.size;
                    unlinkSync(file.path);
                    freed += fileSize;
                    this.stats.deletes++;
                } catch (e) {
                    console.warn(`[L2DiskCache] Failed to delete cache file ${file.path}:`, e.message);
                }
            }
            
            this.stats.size -= freed;
        } catch (error) {
            console.warn('[L2DiskCache] Failed to enforce size limit:', error.message);
        }
    }

    _getAllCacheFiles() {
        const files = [];
        const scanDir = (dir) => {
            try {
                const entries = require('fs').readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else if (entry.isFile() && entry.name.endsWith('.json')) {
                        const stats = require('fs').statSync(fullPath);
                        files.push({
                            path: fullPath,
                            size: stats.size,
                            mtimeMs: stats.mtimeMs,
                        });
                    }
                }
            } catch (error) {
                // 忽略目录读取错误
            }
        };
        
        scanDir(this.baseDir);
        return files;
    }

    delete(key) {
        if (!this.enabled) return false;

        const filePath = this._getFilePath(key);
        
        try {
            if (existsSync(filePath)) {
                const stats = require('fs').statSync(filePath);
                unlinkSync(filePath);
                this.stats.size -= stats.size;
                this.stats.deletes++;
                return true;
            }
            return false;
        } catch (error) {
            console.warn(`[L2DiskCache] Failed to delete cache for key ${key}:`, error.message);
            return false;
        }
    }

    clear() {
        if (!this.enabled) return;

        try {
            const files = this._getAllCacheFiles();
            for (const file of files) {
                try {
                    unlinkSync(file.path);
                } catch (e) {
                    // 忽略删除错误
                }
            }
            this.stats.size = 0;
            this.stats.deletes += files.length;
        } catch (error) {
            console.warn('[L2DiskCache] Failed to clear cache:', error.message);
        }
    }

    has(key) {
        if (!this.enabled) return false;
        return existsSync(this._getFilePath(key));
    }

    getStats() {
        return {
            ...this.stats,
            enabled: this.enabled,
            hitRate: this.stats.hits + this.stats.misses > 0 
                ? (this.stats.hits / (this.stats.hits + this.stats.misses)).toFixed(4)
                : 0,
            currentSizeMB: (this.stats.size / (1024 * 1024)).toFixed(2),
            fileCount: this._getAllCacheFiles().length,
        };
    }
}

/**
 * L3 缓存：分布式缓存（占位符，未来扩展）
 */
class L3DistributedCache {
    constructor(options = {}) {
        this.enabled = options.enabled || false;
        this.provider = options.provider || 'redis'; // redis, memcached, etc.
        this.config = options.config || {};
        
        this.stats = {
            hits: 0,
            misses: 0,
            enabled: this.enabled,
        };
    }

    get(key) {
        if (!this.enabled) return null;
        // 占位符实现，未来可以集成 Redis 等
        this.stats.misses++;
        return null;
    }

    set(key, value, metadata = {}) {
        if (!this.enabled) return false;
        // 占位符实现
        return false;
    }

    delete(key) {
        if (!this.enabled) return false;
        return false;
    }

    clear() {
        // 占位符实现
    }

    has(key) {
        return false;
    }

    getStats() {
        return {
            ...this.stats,
            provider: this.provider,
            configured: this.enabled,
        };
    }
}

/**
 * 多级缓存管理器
 */
export class MultiLevelCache {
    constructor(options = {}) {
        this.l1 = new L1MemoryCache(options.l1 || {});
        this.l2 = new L2DiskCache(options.l2 || {});
        this.l3 = new L3DistributedCache(options.l3 || {});
        
        this.stats = {
            totalHits: 0,
            totalMisses: 0,
            levelHits: { l1: 0, l2: 0, l3: 0 },
            levelMisses: { l1: 0, l2: 0, l3: 0 },
        };
        
        this.prefetchEnabled = options.prefetchEnabled !== false;
        this.writeThrough = options.writeThrough !== false;
        this.readThrough = options.readThrough !== false;
    }

    /**
     * 获取缓存（多级查找）
     */
    async get(key, options = {}) {
        const { skipL1 = false, skipL2 = false, skipL3 = false } = options;
        
        // 1. 检查 L1 缓存
        if (!skipL1 && this.l1.enabled) {
            const l1Value = this.l1.get(key);
            if (l1Value !== null) {
                this.stats.totalHits++;
                this.stats.levelHits.l1++;
                return l1Value;
            }
            this.stats.levelMisses.l1++;
        }

        // 2. 检查 L2 缓存
        if (!skipL2 && this.l2.enabled) {
            const l2Value = this.l2.get(key);
            if (l2Value !== null) {
                this.stats.totalHits++;
                this.stats.levelHits.l2++;
                
                // 写回 L1 缓存（缓存预热）
                if (this.prefetchEnabled && this.l1.enabled) {
                    this.l1.set(key, l2Value);
                }
                
                return l2Value;
            }
            this.stats.levelMisses.l2++;
        }

        // 3. 检查 L3 缓存
        if (!skipL3 && this.l3.enabled) {
            const l3Value = this.l3.get(key);
            if (l3Value !== null) {
                this.stats.totalHits++;
                this.stats.levelHits.l3++;
                
                // 写回 L2 和 L1 缓存
                if (this.prefetchEnabled) {
                    if (this.l2.enabled) this.l2.set(key, l3Value);
                    if (this.l1.enabled) this.l1.set(key, l3Value);
                }
                
                return l3Value;
            }
            this.stats.levelMisses.l3++;
        }

        this.stats.totalMisses++;
        return null;
    }

    /**
     * 设置缓存（多级写入）
     */
    async set(key, value, options = {}) {
        const { ttl, metadata = {}, skipL1 = false, skipL2 = false, skipL3 = false } = options;
        
        let success = true;
        
        // 写穿透模式：同时写入所有级别
        if (this.writeThrough) {
            if (!skipL1 && this.l1.enabled) {
                success = success && this.l1.set(key, value, { ...metadata, ttl });
            }
            if (!skipL2 && this.l2.enabled) {
                success = success && this.l2.set(key, value, { ...metadata, ttl });
            }
            if (!skipL3 && this.l3.enabled) {
                success = success && this.l3.set(key, value, { ...metadata, ttl });
            }
        } else {
            // 只写入 L1，L2/L3 在淘汰时写入
            if (!skipL1 && this.l1.enabled) {
                success = success && this.l1.set(key, value, { ...metadata, ttl });
            }
        }
        
        return success;
    }

    /**
     * 删除缓存（多级删除）
     */
    async delete(key, options = {}) {
        const { skipL1 = false, skipL2 = false, skipL3 = false } = options;
        
        let success = true;
        
        if (!skipL1 && this.l1.enabled) {
            success = success && this.l1.delete(key);
        }
        if (!skipL2 && this.l2.enabled) {
            success = success && this.l2.delete(key);
        }
        if (!skipL3 && this.l3.enabled) {
            success = success && this.l3.delete(key);
        }
        
        return success;
    }

    /**
     * 清空所有缓存
     */
    async clear() {
        if (this.l1.enabled) this.l1.clear();
        if (this.l2.enabled) this.l2.clear();
        if (this.l3.enabled) this.l3.clear();
        
        this.stats = {
            totalHits: 0,
            totalMisses: 0,
            levelHits: { l1: 0, l2: 0, l3: 0 },
            levelMisses: { l1: 0, l2: 0, l3: 0 },
        };
    }

    /**
     * 检查缓存是否存在
     */
    async has(key) {
        return (this.l1.enabled && this.l1.has(key)) ||
               (this.l2.enabled && this.l2.has(key)) ||
               (this.l3.enabled && this.l3.has(key));
    }

    /**
     * 获取缓存统计信息
     */
    getStats() {
        const l1Stats = this.l1.getStats();
        const l2Stats = this.l2.getStats();
        const l3Stats = this.l3.getStats();
        
        const totalRequests = this.stats.totalHits + this.stats.totalMisses;
        const overallHitRate = totalRequests > 0 
            ? (this.stats.totalHits / totalRequests).toFixed(4)
            : 0;
        
        const levelHitRates = {
            l1: l1Stats.hitRate,
            l2: l2Stats.hitRate,
            l3: l3Stats.hitRate,
        };
        
        return {
            enabled: {
                l1: this.l1.enabled,
                l2: this.l2.enabled,
                l3: this.l3.enabled,
            },
            overall: {
                hits: this.stats.totalHits,
                misses: this.stats.totalMisses,
                hitRate: overallHitRate,
                totalRequests,
            },
            levels: {
                l1: l1Stats,
                l2: l2Stats,
                l3: l3Stats,
            },
            levelHits: this.stats.levelHits,
            levelMisses: this.stats.levelMisses,
            levelHitRates,
            config: {
                prefetchEnabled: this.prefetchEnabled,
                writeThrough: this.writeThrough,
                readThrough: this.readThrough,
            },
        };
    }

    /**
     * 预热缓存（从 L2/L3 加载到 L1）
     */
    async warmup(keys) {
        if (!this.prefetchEnabled) return;
        
        for (const key of keys) {
            // 尝试从 L2 加载
            if (this.l2.enabled) {
                const value = this.l2.get(key);
                if (value !== null && this.l1.enabled) {
                    this.l1.set(key, value);
                }
            }
        }
    }

    /**
     * 批量获取缓存
     */
    async mget(keys, options = {}) {
        const results = {};
        const missingKeys = [];
        
        for (const key of keys) {
            const value = await this.get(key, options);
            if (value !== null) {
                results[key] = value;
            } else {
                missingKeys.push(key);
            }
        }
        
        return { results, missingKeys };
    }

    /**
     * 批量设置缓存
     */
    async mset(items, options = {}) {
        const results = {};
        
        for (const [key, value] of Object.entries(items)) {
            results[key] = await this.set(key, value, options);
        }
        
        return results;
    }
}

export default {
    MultiLevelCache,
    L1MemoryCache,
    L2DiskCache,
    L3DistributedCache,
};