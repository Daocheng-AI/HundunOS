/**
 * 缓存管理器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from '../managers/cache-manager.js';

describe('CacheManager', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager({
      enabled: true,
      ttl: 600000,
      maxSize: 1000
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const defaultCache = new CacheManager();
      expect(defaultCache.config.enabled).toBe(true);
      expect(defaultCache.config.ttl).toBe(600000);
      expect(defaultCache.config.maxSize).toBe(1000);
    });

    it('应该使用自定义配置', () => {
      const customCache = new CacheManager({
        enabled: false,
        ttl: 300000,
        maxSize: 500
      });
      expect(customCache.config.enabled).toBe(false);
      expect(customCache.config.ttl).toBe(300000);
      expect(customCache.config.maxSize).toBe(500);
    });
  });

  describe('get', () => {
    it('应该返回缓存的值', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('缓存未命中时应该返回 null', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeNull();
    });

    it('过期的缓存应该返回 null', async () => {
      await cache.set('key1', 'value1', 1); // 1ms TTL
      await new Promise(resolve => setTimeout(resolve, 10)); // 等待过期
      const value = await cache.get('key1');
      expect(value).toBeNull();
    });

    it('禁用缓存时应该返回 null', async () => {
      const disabledCache = new CacheManager({ enabled: false });
      await disabledCache.set('key1', 'value1');
      const value = await disabledCache.get('key1');
      expect(value).toBeNull();
    });

    it('应该增加命中计数', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
    });

    it('应该增加未命中计数', async () => {
      await cache.get('nonexistent');
      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });
  });

  describe('set', () => {
    it('应该成功设置缓存', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('应该使用自定义 TTL', async () => {
      await cache.set('key1', 'value1', 1000); // 1s TTL
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('禁用缓存时不应该设置缓存', async () => {
      const disabledCache = new CacheManager({ enabled: false });
      await disabledCache.set('key1', 'value1');
      const value = await disabledCache.get('key1');
      expect(value).toBeNull();
    });

    it('应该增加设置计数', async () => {
      await cache.set('key1', 'value1');
      const stats = cache.getStats();
      expect(stats.sets).toBe(1);
    });

    it('应该更新已存在的缓存', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key1', 'value2');
      const value = await cache.get('key1');
      expect(value).toBe('value2');
    });
  });

  describe('invalidate', () => {
    it('应该删除指定的缓存', async () => {
      await cache.set('key1', 'value1');
      await cache.invalidate('key1');
      const value = await cache.get('key1');
      expect(value).toBeNull();
    });

    it('应该增加删除计数', async () => {
      await cache.set('key1', 'value1');
      await cache.invalidate('key1');
      const stats = cache.getStats();
      expect(stats.deletes).toBe(1);
    });

    it('删除不存在的缓存不应该报错', async () => {
      await expect(cache.invalidate('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('invalidatePattern', () => {
    it('应该删除匹配模式的所有缓存', async () => {
      await cache.set('user:1', 'value1');
      await cache.set('user:2', 'value2');
      await cache.set('product:1', 'value3');

      await cache.invalidatePattern('user:');

      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('product:1')).toBe('value3');
    });

    it('应该正确处理不匹配的缓存', async () => {
      await cache.set('user:1', 'value1');
      await cache.set('admin:1', 'value2');

      await cache.invalidatePattern('user:');

      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('admin:1')).toBe('value2');
    });
  });

  describe('clear', () => {
    it('应该清空所有缓存', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.clear();

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });

    it('清空后缓存大小应该为 0', async () => {
      await cache.set('key1', 'value1');
      await cache.clear();
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('prune', () => {
    it('应该清理过期的缓存', async () => {
      await cache.set('key1', 'value1', 1); // 1ms TTL
      await cache.set('key2', 'value2', 10000); // 10s TTL
      await new Promise(resolve => setTimeout(resolve, 10)); // 等待第一个过期

      await cache.prune();

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBe('value2');
    });

    it('应该增加清理计数', async () => {
      await cache.set('key1', 'value1', 1);
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.prune();

      const stats = cache.getStats();
      expect(stats.prunes).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.get('nonexistent');

      const stats = cache.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.deletes).toBe(0);
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(1000);
      expect(stats.hitRate).toBe(0.5);
    });

    it('命中率应该正确计算', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('nonexistent');

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.6666666666666666);
    });

    it('没有请求时命中率应该为 0', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('应该重置所有统计信息', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.invalidate('key1');

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
      expect(stats.deletes).toBe(0);
      expect(stats.prunes).toBe(0);
    });

    it('重置后缓存应该仍然可用', async () => {
      await cache.set('key1', 'value1');
      cache.resetStats();

      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });
  });

  describe('LRU 清理', () => {
    it('应该清理最久未访问的缓存', async () => {
      const smallCache = new CacheManager({
        enabled: true,
        ttl: 600000,
        maxSize: 2
      });

      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3');

      // key1 应该被清理
      expect(await smallCache.get('key1')).toBeNull();
      expect(await smallCache.get('key2')).toBe('value2');
      expect(await smallCache.get('key3')).toBe('value3');
    });

    it('最近访问的缓存不应该被清理', async () => {
      const smallCache = new CacheManager({
        enabled: true,
        ttl: 600000,
        maxSize: 2
      });

      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.get('key1'); // 访问 key1
      await smallCache.set('key3', 'value3');

      // key2 应该被清理（最久未访问）
      expect(await smallCache.get('key1')).toBe('value1');
      expect(await smallCache.get('key2')).toBeNull();
      expect(await smallCache.get('key3')).toBe('value3');
    });
  });
});
