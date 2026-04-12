/**
 * HundunOS v4.3 - 缓存管理器
 * 实现 LRU 缓存、Redis 缓存
 */

import { LRUCache } from 'lru-cache';

/**
 * 内存缓存管理器
 */
export class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 3600000; // 1小时
    this.cache = new LRUCache({
      max: this.maxSize,
      ttl: this.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }

  /**
   * 获取缓存
   */
  get(key) {
    return this.cache.get(key);
  }

  /**
   * 设置缓存
   */
  set(key, value, ttl) {
    this.cache.set(key, value, ttl);
  }

  /**
   * 删除缓存
   */
  del(key) {
    this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    };
  }
}

/**
 * Redis 缓存管理器
 */
export class RedisCacheManager {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  /**
   * 获取缓存
   */
  async get(key) {
    try {
      const value = await this.redis.get(key);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    } catch (e) {
      console.error('[RedisCache] Get failed:', e.message);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  async set(key, value, ttl = 3600) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[RedisCache] Set failed:', e.message);
      return false;
    }
  }

  /**
   * 删除缓存
   */
  async del(key) {
    try {
      await this.redis.del(key);
      return true;
    } catch (e) {
      console.error('[RedisCache] Delete failed:', e.message);
      return false;
    }
  }

  /**
   * 清空缓存
   */
  async clear() {
    try {
      await this.redis.flushdb();
      return true;
    } catch (e) {
      console.error('[RedisCache] Clear failed:', e.message);
      return false;
    }
  }

  /**
   * 获取统计
   */
  async getStats() {
    try {
      const info = await this.redis.info('stats');
      return {
        keys: info.keyspace_hits,
        hits: info.keyspace_hits,
        misses: info.keyspace_misses,
      };
    } catch (e) {
      console.error('[RedisCache] Get stats failed:', e.message);
      return null;
    }
  }
}

export default { CacheManager, RedisCacheManager };
