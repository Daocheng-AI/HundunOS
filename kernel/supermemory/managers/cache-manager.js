/**
 * Supermemory 缓存管理器
 *
 * 实现多层缓存机制，减少 API 调用次数，提升响应速度。
 */

import { PersistentCacheManager } from './persistent-cache-manager.js';

/**
 * 缓存条目类
 */
class CacheEntry {
  /**
   * 创建缓存条目
   * @param {any} value - 缓存值
   * @param {number} ttl - 过期时间（毫秒）
   */
  constructor(value, ttl) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttl;
    this.accessCount = 0;
    this.lastAccessedAt = this.createdAt;
  }

  /**
   * 检查是否过期
   * @returns {boolean} 是否过期
   */
  isExpired() {
    return Date.now() > this.expiresAt;
  }

  /**
   * 访问缓存
   */
  access() {
    this.accessCount++;
    this.lastAccessedAt = Date.now();
  }
}

/**
 * 缓存管理器类
 */
class CacheManager {
  /**
   * 创建缓存管理器实例
   * @param {Object} config - 缓存配置
   * @param {boolean} config.enabled - 是否启用缓存
   * @param {number} config.ttl - 缓存过期时间（毫秒）
   * @param {number} config.maxSize - 最大缓存条目数
   * @param {boolean} config.persistent - 是否持久化到数据库
   */
  constructor(config = {}) {
    this.config = {
      enabled: true,
      ttl: 600000, // 10 分钟
      maxSize: 1000,
      persistent: false,
      ...config
    };

    this.memoryCache = new Map();
    this.db = null;

    // 统计信息
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      prunes: 0
    };

    // 初始化缓存（非持久化模式立即完成）
    this._initPromise = null;
    if (this.config.persistent) {
      this._initPromise = this.initPersistentCache();
    }
  }

  /**
   * 确保缓存已初始化（持久化模式需 await）
   */
  async ensureInit() {
    if (this._initPromise) {
      await this._initPromise;
      this._initPromise = null;
    }
  }

  /**
   * 初始化持久化缓存
   */
  async initPersistentCache() {
    try {
      this.persistentCache = new PersistentCacheManager({
        ttl: this.config.ttl,
        maxSize: this.config.maxSize * 10, // 持久化缓存可以存储更多
        dbPath: this.config.dbPath
      });

      const result = await this.persistentCache.initialize();
      if (result.success) {
        console.log('[CacheManager] 持久化缓存已启用');
      } else {
        console.warn('[CacheManager] 持久化缓存初始化失败:', result.error);
        this.persistentCache = null;
      }
    } catch (error) {
      console.warn('[CacheManager] 持久化缓存初始化失败:', error.message);
      this.persistentCache = null;
    }
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {Promise<any|null>} 缓存值，不存在或过期返回 null
   */
  async get(key) {
    // 如果未启用缓存，直接返回 null
    if (!this.config.enabled) {
      return null;
    }

    // 检查内存缓存
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      if (!memoryEntry.isExpired()) {
        memoryEntry.access();
        this.stats.hits++;
        return memoryEntry.value;
      } else {
        // 过期，删除
        this.memoryCache.delete(key);
      }
    }

    // 检查持久化缓存（如果启用）
    if (this.persistentCache) {
      const persistentValue = await this.persistentCache.get(key);
      if (persistentValue) {
        // 加载到内存缓存
        this.memoryCache.set(key, new CacheEntry(persistentValue, this.config.ttl));
        this.stats.hits++;
        return persistentValue;
      }
    }

    // 未命中
    this.stats.misses++;
    return null;
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} [ttl] - 过期时间（毫秒），默认使用配置的 TTL
   * @returns {Promise<void>}
   */
  async set(key, value, ttl) {
    // 如果未启用缓存，直接返回
    if (!this.config.enabled) {
      return;
    }

    const actualTtl = ttl || this.config.ttl;
    const entry = new CacheEntry(value, actualTtl);

    // 存储到内存缓存
    this.memoryCache.set(key, entry);
    this.stats.sets++;

    // 存储到持久化缓存（如果启用）
    if (this.persistentCache) {
      await this.persistentCache.set(key, value, actualTtl);
    }

    // 检查缓存大小，必要时清理
    this.pruneIfNeeded();
  }

  /**
   * 使缓存失效
   * @param {string} key - 缓存键
   * @returns {Promise<void>}
   */
  async invalidate(key) {
    // 从内存缓存删除
    this.memoryCache.delete(key);
    this.stats.deletes++;

    // 从持久化缓存删除（如果启用）
    if (this.persistentCache) {
      await this.persistentCache.delete(key);
    }
  }

  /**
   * 按模式使缓存失效
   * @param {string} pattern - 正则表达式模式
   * @returns {Promise<void>}
   */
  async invalidatePattern(pattern) {
    await this.ensureInit();
    const regex = new RegExp(pattern);

    // 清除内存缓存
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
        this.stats.deletes++;
      }
    }

    // 清除持久化缓存（如果启用）
    if (this.db) {
      await this.deleteFromDatabasePattern(pattern);
    }
  }

  /**
   * 清空所有缓存
   * @returns {Promise<void>}
   */
  async clear() {
    this.memoryCache.clear();

    if (this.persistentCache) {
      await this.persistentCache.clear();
    }
  }

  /**
   * 清理过期缓存
   * @returns {Promise<void>}
   */
  async prune() {
    await this.ensureInit();
    const now = Date.now();

    // 清理过期的内存缓存
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.isExpired()) {
        this.memoryCache.delete(key);
        this.stats.prunes++;
      }
    }

    // 清理过期的持久化缓存（如果启用）
    if (this.db) {
      await this.pruneDatabase(now);
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计信息
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    const stats = {
      size: this.memoryCache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      prunes: this.stats.prunes,
      persistentEnabled: !!this.persistentCache
    };

    // 如果启用了持久化缓存，添加持久化缓存的统计信息
    if (this.persistentCache) {
      stats.persistentStats = this.persistentCache.getStats();
    }

    return stats;
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      prunes: 0
    };
  }

  /**
   * 检查是否需要清理缓存
   */
  pruneIfNeeded() {
    if (this.memoryCache.size > this.config.maxSize) {
      // LRU 淘汰策略
      const sorted = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

      const toRemove = sorted.slice(0, sorted.length - this.config.maxSize);
      for (const [key] of toRemove) {
        this.memoryCache.delete(key);
        this.stats.prunes++;
      }
    }
  }

  /**
   * 从数据库获取缓存
   * @param {string} key - 缓存键
   * @returns {Promise<CacheEntry|null>} 缓存条目
   */
  async getFromDatabase(key) {
    // 暂未实现
    return null;
  }

  /**
   * 设置缓存到数据库
   * @param {string} key - 缓存键
   * @param {CacheEntry} entry - 缓存条目
   * @returns {Promise<void>}
   */
  async setToDatabase(key, entry) {
    // 暂未实现
  }

  /**
   * 从数据库删除缓存
   * @param {string} key - 缓存键
   * @returns {Promise<void>}
   */
  async deleteFromDatabase(key) {
    // 暂未实现
  }

  /**
   * 按模式从数据库删除缓存
   * @param {string} pattern - 正则表达式模式
   * @returns {Promise<void>}
   */
  async deleteFromDatabasePattern(pattern) {
    // 暂未实现
  }

  /**
   * 清空数据库
   * @returns {Promise<void>}
   */
  async clearDatabase() {
    // 暂未实现
  }

  /**
   * 清理数据库中的过期缓存
   * @param {number} now - 当前时间戳
   * @returns {Promise<void>}
   */
  async pruneDatabase(now) {
    // 暂未实现
  }
}

export { CacheManager, CacheEntry };
