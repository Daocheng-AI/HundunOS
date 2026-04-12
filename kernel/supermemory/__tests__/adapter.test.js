/**
 * Supermemory 适配器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SupermemoryAdapter } from '../adapters/supermemory-adapter.js';
import { SupermemoryApiClient } from '../adapters/api-client.js';
import { ErrorHandler } from '../managers/error-handler.js';
import { CacheManager } from '../managers/cache-manager.js';

// Mock 依赖
vi.mock('../adapters/api-client.js');
vi.mock('../managers/error-handler.js');
vi.mock('../managers/cache-manager.js');

describe('SupermemoryAdapter', () => {
  let adapter;
  let mockApiClient;
  let mockErrorHandler;
  let mockCacheManager;

  beforeEach(() => {
    // 创建 mock 实例
    mockApiClient = {
      post: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn()
    };

    mockErrorHandler = {
      retry: vi.fn(),
      classifyError: vi.fn()
    };

    mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
      invalidatePattern: vi.fn()
    };

    // 设置 mock 返回值
    SupermemoryApiClient.mockImplementation(() => mockApiClient);
    ErrorHandler.mockImplementation(() => mockErrorHandler);
    CacheManager.mockImplementation(() => mockCacheManager);

    // 创建适配器实例
    adapter = new SupermemoryAdapter({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.test.com',
      cache: {
        enabled: true,
        ttl: 600000,
        maxSize: 1000
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('应该成功初始化', async () => {
      const result = await adapter.initialize();
      expect(result.success).toBe(true);
    });

    it('初始化失败时应该返回错误', async () => {
      mockErrorHandler.classifyError.mockReturnValue({ type: 'NetworkError', retryable: true });
      mockErrorHandler.retry.mockRejectedValue(new Error('Network error'));

      const result = await adapter.initialize();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getUserProfile', () => {
    it('应该从缓存获取用户画像', async () => {
      const cachedProfile = { static: ['developer'], dynamic: ['working on AI'] };
      mockCacheManager.get.mockResolvedValue(cachedProfile);

      const result = await adapter.getUserProfile('test-container');

      expect(result).toEqual(cachedProfile);
      expect(mockCacheManager.get).toHaveBeenCalledWith('profile:test-container');
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('缓存未命中时应该从 API 获取', async () => {
      const apiProfile = { static: ['developer'], dynamic: ['working on AI'] };
      mockCacheManager.get.mockResolvedValue(null);
      mockErrorHandler.retry.mockResolvedValue(apiProfile);

      const result = await adapter.getUserProfile('test-container');

      expect(result).toEqual(apiProfile);
      expect(mockCacheManager.get).toHaveBeenCalledWith('profile:test-container');
      expect(mockErrorHandler.retry).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalledWith('profile:test-container', apiProfile, 600000);
    });

    it('API 调用失败时应该返回 null', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockErrorHandler.retry.mockRejectedValue(new Error('API error'));

      const result = await adapter.getUserProfile('test-container');

      expect(result).toBeNull();
      expect(mockErrorHandler.retry).toHaveBeenCalled();
    });
  });

  describe('addMemory', () => {
    it('应该成功添加记忆', async () => {
      const memory = { id: 'mem-123', content: 'Test memory' };
      mockErrorHandler.retry.mockResolvedValue(memory);

      const result = await adapter.addMemory('test-container', 'Test memory', { tag: 'test' });

      expect(result).toEqual(memory);
      expect(mockErrorHandler.retry).toHaveBeenCalled();
      expect(mockCacheManager.invalidatePattern).toHaveBeenCalledWith('search:');
    });

    it('添加记忆失败时应该返回 null', async () => {
      mockErrorHandler.retry.mockRejectedValue(new Error('API error'));

      const result = await adapter.addMemory('test-container', 'Test memory');

      expect(result).toBeNull();
    });
  });

  describe('searchMemories', () => {
    it('应该从缓存获取搜索结果', async () => {
      const cachedResults = { memories: [{ id: 'mem-1', content: 'Test' }] };
      const cacheKey = 'search:query-test-container-{"q":"test"}';
      mockCacheManager.get.mockResolvedValue(cachedResults);

      const result = await adapter.searchMemories('test', 'test-container');

      expect(result).toEqual(cachedResults);
      expect(mockCacheManager.get).toHaveBeenCalledWith(cacheKey);
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('缓存未命中时应该从 API 搜索', async () => {
      const apiResults = { memories: [{ id: 'mem-1', content: 'Test' }] };
      const cacheKey = 'search:query-test-container-{"q":"test"}';
      mockCacheManager.get.mockResolvedValue(null);
      mockErrorHandler.retry.mockResolvedValue(apiResults);

      const result = await adapter.searchMemories('test', 'test-container');

      expect(result).toEqual(apiResults);
      expect(mockCacheManager.get).toHaveBeenCalledWith(cacheKey);
      expect(mockErrorHandler.retry).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalledWith(cacheKey, apiResults, 600000);
    });
  });

  describe('deleteMemory', () => {
    it('应该成功删除记忆', async () => {
      mockErrorHandler.retry.mockResolvedValue({ success: true });

      const result = await adapter.deleteMemory('mem-123');

      expect(result.success).toBe(true);
      expect(mockErrorHandler.retry).toHaveBeenCalled();
      expect(mockCacheManager.invalidate).toHaveBeenCalledWith('memory:mem-123');
      expect(mockCacheManager.invalidatePattern).toHaveBeenCalledWith('search:');
    });

    it('删除记忆失败时应该返回错误', async () => {
      mockErrorHandler.retry.mockRejectedValue(new Error('API error'));

      const result = await adapter.deleteMemory('mem-123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getHealth', () => {
    it('应该返回健康状态', async () => {
      const health = await adapter.getHealth();

      expect(health).toHaveProperty('api');
      expect(health).toHaveProperty('cache');
      expect(health).toHaveProperty('status');
    });

    it('API 正常时应该显示 healthy', async () => {
      mockErrorHandler.retry.mockResolvedValue({ status: 'ok' });

      const health = await adapter.getHealth();

      expect(health.api).toBe('healthy');
    });

    it('API 异常时应该显示 unhealthy', async () => {
      mockErrorHandler.retry.mockRejectedValue(new Error('API error'));

      const health = await adapter.getHealth();

      expect(health.api).toBe('unhealthy');
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      mockCacheManager.getStats.mockReturnValue({
        hits: 100,
        misses: 50,
        hitRate: 0.6667
      });

      const stats = adapter.getStats();

      expect(stats).toHaveProperty('cache');
      expect(stats.cache).toEqual(mockCacheManager.getStats());
    });
  });
});
