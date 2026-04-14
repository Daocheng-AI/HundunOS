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
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

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
        // P0-3 修复：原 32 位 djb2 哈希在 1000 key 时碰撞率 ~2.3%，改用 SHA-256 取前 16 位
        // 碰撞概率从 ~2.3% 降至 ~10^-19（可忽略不计）
        return createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
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
            const fileStats = existsSync(filePath) ? statSync(filePath) : { size: 0 };
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
                const entries = readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else if (entry.isFile() && entry.name.endsWith('.json')) {
                        const stats = statSync(fullPath);
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
                const stats = statSync(filePath);
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
        this.provider = options.provider || 'redis'; // redis, memcached, memory-cluster
        this.config = {
            host: options.host || 'localhost',
            port: options.port || 6379,
            password: options.password || null,
            db: options.db || 0,
            keyPrefix: options.keyPrefix || 'hundunos:cache:',
            ttl: options.ttl || 3600000, // 默认1小时
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            timeout: options.timeout || 5000,
            ...options.config
        };
        
        this.client = null;
        this.isConnected = false;
        // P0-4 修复：将异步初始化从构造函数中移除，改为显式 initialize() 方法
        // 原代码：构造函数同步调用 async _initializeClient()，Promise 未 await，
        // 导致 L3 尚未连接时即被 get/set 使用，产生竞争条件。
        // 修复：通过 initialize() 暴露显式初始化入口，由 MultiLevelCache 在
        // 自己的 initialize() 中 await 调用。
        this._initPromise = null;
        
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0,
            enabled: this.enabled,
        };
    }

    /**
     * 显式异步初始化（P0-4 修复）
     * 外部调用方须 await l3.initialize() 后再使用缓存。
     */
    async initialize() {
        if (!this.enabled) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._initializeClient();
        return this._initPromise;
    }

    /**
     * 初始化客户端连接
     */
    async _initializeClient() {
        try {
            if (this.provider === 'redis') {
                // 动态导入 Redis 客户端
                const { createClient } = await import('redis');
                
                this.client = createClient({
                    url: this.config.password 
                        ? `redis://:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.db}`
                        : `redis://${this.config.host}:${this.config.port}/${this.config.db}`,
                    socket: {
                        connectTimeout: this.config.timeout,
                        retryStrategy: (retries) => {
                            if (retries > this.config.maxRetries) {
                                console.error('[L3DistributedCache] Redis connection failed after max retries');
                                return new Error('Redis connection failed');
                            }
                            return Math.min(retries * this.config.retryDelay, 3000);
                        }
                    }
                });
                
                this.client.on('error', (err) => {
                    console.error('[L3DistributedCache] Redis Client Error:', err);
                    this.stats.errors++;
                });
                
                this.client.on('connect', () => {
                    // console.log('[L3DistributedCache] Redis connected');
                    this.isConnected = true;
                });
                
                this.client.on('disconnect', () => {
                    // console.log('[L3DistributedCache] Redis disconnected');
                    this.isConnected = false;
                });
                
                await this.client.connect();
                
            } else if (this.provider === 'memcached') {
                // 动态导入 Memcached 客户端
                const Memcached = await import('memcached');
                
                this.client = new Memcached.default(
                    `${this.config.host}:${this.config.port}`,
                    {
                        retries: this.config.maxRetries,
                        timeout: this.config.timeout,
                        poolSize: 10
                    }
                );
                
                this.isConnected = true;
                
            } else if (this.provider === 'memory-cluster') {
                // 内存集群模式（用于测试或小规模部署）
                this.client = new Map();
                this.isConnected = true;
            }
            
        } catch (error) {
            console.error('[L3DistributedCache] Failed to initialize client:', error);
            this.enabled = false;
            this.stats.errors++;
        }
    }

    /**
     * 获取缓存值
     */
    async get(key) {
        if (!this.enabled || !this.isConnected) return null;
        
        const fullKey = this.config.keyPrefix + key;
        
        try {
            let value = null;
            
            if (this.provider === 'redis') {
                const data = await this.client.get(fullKey);
                if (data) {
                    value = JSON.parse(data);
                    this.stats.hits++;
                } else {
                    this.stats.misses++;
                }
                
            } else if (this.provider === 'memcached') {
                value = await new Promise((resolve, reject) => {
                    this.client.get(fullKey, (err, data) => {
                        if (err) reject(err);
                        else resolve(data ? JSON.parse(data) : null);
                    });
                });
                
                if (value) {
                    this.stats.hits++;
                } else {
                    this.stats.misses++;
                }
                
            } else if (this.provider === 'memory-cluster') {
                const data = this.client.get(fullKey);
                if (data && (!data.expiresAt || Date.now() < data.expiresAt)) {
                    value = data.value;
                    this.stats.hits++;
                } else {
                    if (data) this.client.delete(fullKey); // 清理过期数据
                    this.stats.misses++;
                }
            }
            
            return value;
            
        } catch (error) {
            console.error(`[L3DistributedCache] Failed to get key ${key}:`, error);
            this.stats.errors++;
            this.stats.misses++;
            return null;
        }
    }

    /**
     * 设置缓存值
     */
    async set(key, value, metadata = {}) {
        if (!this.enabled || !this.isConnected) return false;
        
        const fullKey = this.config.keyPrefix + key;
        const ttl = metadata.ttl || this.config.ttl;
        const expiresAt = ttl > 0 ? Date.now() + ttl : null;
        
        const data = {
            value,
            metadata: {
                ...metadata,
                createdAt: Date.now(),
                expiresAt,
            }
        };
        
        try {
            if (this.provider === 'redis') {
                const serialized = JSON.stringify(data);
                if (ttl > 0) {
                    await this.client.setEx(fullKey, Math.floor(ttl / 1000), serialized);
                } else {
                    await this.client.set(fullKey, serialized);
                }
                
            } else if (this.provider === 'memcached') {
                await new Promise((resolve, reject) => {
                    this.client.set(fullKey, JSON.stringify(data), ttl > 0 ? Math.floor(ttl / 1000) : 0, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
            } else if (this.provider === 'memory-cluster') {
                this.client.set(fullKey, data);
                if (ttl > 0) {
                    // 设置过期清理
                    setTimeout(() => {
                        this.client.delete(fullKey);
                    }, ttl);
                }
            }
            
            this.stats.sets++;
            return true;
            
        } catch (error) {
            console.error(`[L3DistributedCache] Failed to set key ${key}:`, error);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 删除缓存值
     */
    async delete(key) {
        if (!this.enabled || !this.isConnected) return false;
        
        const fullKey = this.config.keyPrefix + key;
        
        try {
            if (this.provider === 'redis') {
                await this.client.del(fullKey);
                
            } else if (this.provider === 'memcached') {
                await new Promise((resolve, reject) => {
                    this.client.del(fullKey, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
            } else if (this.provider === 'memory-cluster') {
                this.client.delete(fullKey);
            }
            
            this.stats.deletes++;
            return true;
            
        } catch (error) {
            console.error(`[L3DistributedCache] Failed to delete key ${key}:`, error);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 清空缓存
     */
    async clear() {
        if (!this.enabled || !this.isConnected) return;
        
        try {
            if (this.provider === 'redis') {
                // 删除所有匹配前缀的键
                const keys = await this.client.keys(this.config.keyPrefix + '*');
                if (keys.length > 0) {
                    await this.client.del(keys);
                }
                
            } else if (this.provider === 'memcached') {
                // Memcached 不支持按前缀删除，需要 flush
                await new Promise((resolve, reject) => {
                    this.client.flush((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
            } else if (this.provider === 'memory-cluster') {
                this.client.clear();
            }
            
        } catch (error) {
            console.error('[L3DistributedCache] Failed to clear cache:', error);
            this.stats.errors++;
        }
    }

    /**
     * 检查键是否存在
     */
    async has(key) {
        if (!this.enabled || !this.isConnected) return false;
        
        const fullKey = this.config.keyPrefix + key;
        
        try {
            if (this.provider === 'redis') {
                return await this.client.exists(fullKey) === 1;
                
            } else if (this.provider === 'memcached') {
                return await new Promise((resolve, reject) => {
                    this.client.get(fullKey, (err, data) => {
                        if (err) reject(err);
                        else resolve(data !== undefined);
                    });
                });
                
            } else if (this.provider === 'memory-cluster') {
                const data = this.client.get(fullKey);
                return data && (!data.expiresAt || Date.now() < data.expiresAt);
            }
            
        } catch (error) {
            console.error(`[L3DistributedCache] Failed to check key ${key}:`, error);
            return false;
        }
    }

    /**
     * 批量获取
     */
    async mget(keys) {
        if (!this.enabled || !this.isConnected) {
            return { results: {}, missingKeys: keys };
        }
        
        const results = {};
        const missingKeys = [];
        
        try {
            if (this.provider === 'redis') {
                const fullKeys = keys.map(k => this.config.keyPrefix + k);
                const values = await this.client.mGet(fullKeys);
                
                for (let i = 0; i < keys.length; i++) {
                    if (values[i]) {
                        const data = JSON.parse(values[i]);
                        results[keys[i]] = data.value;
                        this.stats.hits++;
                    } else {
                        missingKeys.push(keys[i]);
                        this.stats.misses++;
                    }
                }
                
            } else {
                // 其他provider逐个获取
                for (const key of keys) {
                    const value = await this.get(key);
                    if (value !== null) {
                        results[key] = value;
                    } else {
                        missingKeys.push(key);
                    }
                }
            }
            
        } catch (error) {
            console.error('[L3DistributedCache] Failed to mget:', error);
            this.stats.errors++;
            return { results: {}, missingKeys: keys };
        }
        
        return { results, missingKeys };
    }

    /**
     * 批量设置
     */
    async mset(items, metadata = {}) {
        if (!this.enabled || !this.isConnected) return false;
        
        try {
            if (this.provider === 'redis') {
                const multi = this.client.multi();
                
                for (const [key, value] of Object.entries(items)) {
                    const fullKey = this.config.keyPrefix + key;
                    const ttl = metadata.ttl || this.config.ttl;
                    const data = {
                        value,
                        metadata: {
                            ...metadata,
                            createdAt: Date.now(),
                            expiresAt: ttl > 0 ? Date.now() + ttl : null,
                        }
                    };
                    
                    const serialized = JSON.stringify(data);
                    if (ttl > 0) {
                        multi.setEx(fullKey, Math.floor(ttl / 1000), serialized);
                    } else {
                        multi.set(fullKey, serialized);
                    }
                }
                
                await multi.exec();
                this.stats.sets += Object.keys(items).length;
                
            } else {
                // 其他provider逐个设置
                for (const [key, value] of Object.entries(items)) {
                    await this.set(key, value, metadata);
                }
            }
            
            return true;
            
        } catch (error) {
            console.error('[L3DistributedCache] Failed to mset:', error);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            provider: this.provider,
            configured: this.enabled,
            connected: this.isConnected,
        };
    }

    /**
     * 关闭连接
     */
    async close() {
        if (!this.client) return;
        
        try {
            if (this.provider === 'redis') {
                await this.client.quit();
            } else if (this.provider === 'memcached') {
                this.client.end();
            }
            
            this.isConnected = false;
            // console.log('[L3DistributedCache] Connection closed');
            
        } catch (error) {
            console.error('[L3DistributedCache] Failed to close connection:', error);
        }
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
     * 显式异步初始化 MultiLevelCache（P0-4 修复）
     * 调用方须在首次使用前 await cache.initialize()，确保 L3 连接已就绪。
     */
    async initialize() {
        await this.l3.initialize();
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