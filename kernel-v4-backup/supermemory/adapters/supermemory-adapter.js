/**
 * Supermemory 适配器
 *
 * 封装 Supermemory API 的所有功能，提供统一的接口给 HundunOS 使用。
 * P1-2 修复：将 CommonJS require() 改为 ESM import，与项目 "type":"module" 对齐，
 * 消除 CJS/ESM 混用导致的 SyntaxError: Unexpected token ':' 测试报错。
 */

import { SupermemoryApiClient } from './api-client.js';
import { ErrorHandler } from '../managers/error-handler.js';
import { CacheManager } from '../managers/cache-manager.js';

/**
 * Supermemory 适配器类
 */
class SupermemoryAdapter {
  /**
   * 创建 Supermemory 适配器实例
   * @param {Object} config - Supermemory 配置
   */
  constructor(config) {
    this.config = config;

    // 初始化 API 客户端
    this.apiClient = new SupermemoryApiClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeout: config.timeout
    });

    // 初始化错误处理器
    this.errorHandler = new ErrorHandler(config.retry);

    // 初始化缓存管理器
    this.cacheManager = new CacheManager(config.cache);

    // 初始化状态
    this.initialized = false;
  }

  /**
   * 初始化适配器
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // 健康检查
      await this.healthCheck();

      this.initialized = true;
      // console.info('[SupermemoryAdapter] 初始化成功');
    } catch (error) {
      console.error('[SupermemoryAdapter] 初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取用户画像
   * @param {string} containerTag - 容器标签
   * @returns {Promise<Object>} 用户画像
   */
  async getUserProfile(containerTag) {
    const cacheKey = `profile:${containerTag}`;

    // 尝试从缓存获取
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      // console.debug('[SupermemoryAdapter] 用户画像缓存命中');
      return cached;
    }

    // 调用 API
    return this.errorHandler.retry(async () => {
      try {
        const response = await this.apiClient.post('/profile', {
          containerTag
        });

        // 缓存结果
        await this.cacheManager.set(cacheKey, response);

        return response;
      } catch (error) {
        console.error('[SupermemoryAdapter] 获取用户画像失败:', error.message);
        throw error;
      }
    });
  }

  /**
   * 添加记忆
   * @param {string} content - 记忆内容
   * @param {string} containerTag - 容器标签
   * @param {Object} [metadata] - 元数据
   * @returns {Promise<Object>} 创建的记忆
   */
  async addMemory(content, containerTag, metadata = {}) {
    return this.errorHandler.retry(async () => {
      try {
        const response = await this.apiClient.post('/documents', {
          content,
          containerTag,
          metadata
        });

        // 使相关缓存失效
        await this.invalidateRelatedCaches(containerTag);

        return response;
      } catch (error) {
        console.error('[SupermemoryAdapter] 添加记忆失败:', error.message);
        throw error;
      }
    });
  }

  /**
   * 搜索记忆
   * @param {Object} query - 搜索查询
   * @param {string} query.query - 查询字符串
   * @param {string} query.containerTag - 容器标签
   * @param {string} [query.searchMode='memories'] - 搜索模式
   * @param {number} [query.limit=20] - 结果数量限制
   * @param {Object} [query.filters] - 过滤器
   * @returns {Promise<Object>} 搜索结果
   */
  async searchMemories(query) {
    const cacheKey = `search:${JSON.stringify(query)}`;

    // 尝试从缓存获取
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      // console.debug('[SupermemoryAdapter] 搜索结果缓存命中');
      return cached;
    }

    // 调用 API
    return this.errorHandler.retry(async () => {
      try {
        const response = await this.apiClient.post('/search', query);

        // 缓存结果（较短的 TTL）
        await this.cacheManager.set(cacheKey, response, this.config.cache.ttl / 2);

        return response;
      } catch (error) {
        console.error('[SupermemoryAdapter] 搜索记忆失败:', error.message);
        throw error;
      }
    });
  }

  /**
   * 混合搜索
   * @param {string} query - 查询字符串
   * @param {string} containerTag - 容器标签
   * @param {Object} [options] - 搜索选项
   * @returns {Promise<Object>} 混合搜索结果
   */
  async hybridSearch(query, containerTag, options = {}) {
    return this.searchMemories({
      query,
      containerTag,
      searchMode: 'hybrid',
      ...options
    });
  }

  /**
   * 批量添加记忆
   * @param {Array} memories - 记忆数组
   * @returns {Promise<Object>} 批量结果
   */
  async batchAddMemories(memories) {
    // 暂时逐个添加，待 Supermemory API 支持批量操作后优化
    const results = {
      successCount: 0,
      failCount: 0,
      errors: []
    };

    for (const memory of memories) {
      try {
        await this.addMemory(memory.content, memory.containerTag, memory.metadata);
        results.successCount++;
      } catch (error) {
        results.failCount++;
        results.errors.push({
          error: error.message,
          data: memory
        });
      }
    }

    return results;
  }

  /**
   * 批量搜索记忆
   * @param {Array} queries - 搜索查询数组
   * @returns {Promise<Object>} 批量搜索结果
   */
  async batchSearchMemories(queries) {
    const results = [];

    for (const query of queries) {
      try {
        const result = await this.searchMemories(query);
        results.push(result);
      } catch (error) {
        console.error('[SupermemoryAdapter] 批量搜索失败:', error.message);
        results.push({ error: error.message });
      }
    }

    return { results };
  }

  /**
   * 删除记忆
   * @param {string} memoryId - 记忆 ID
   * @returns {Promise<void>}
   */
  async deleteMemory(memoryId) {
    return this.errorHandler.retry(async () => {
      try {
        await this.apiClient.delete(`/documents/${memoryId}`);

        // 使相关缓存失效
        await this.invalidateRelatedCaches();
      } catch (error) {
        console.error('[SupermemoryAdapter] 删除记忆失败:', error.message);
        throw error;
      }
    });
  }

  /**
   * 更新记忆
   * @param {string} memoryId - 记忆 ID
   * @param {Object} updates - 更新内容
   * @returns {Promise<Object>} 更新后的记忆
   */
  async updateMemory(memoryId, updates) {
    return this.errorHandler.retry(async () => {
      try {
        const response = await this.apiClient.patch(`/documents/${memoryId}`, updates);

        // 使相关缓存失效
        await this.invalidateRelatedCaches();

        return response;
      } catch (error) {
        console.error('[SupermemoryAdapter] 更新记忆失败:', error.message);
        throw error;
      }
    });
  }

  /**
   * 健康检查
   * @returns {Promise<Object>} 健康状态
   */
  async healthCheck() {
    try {
      const response = await this.apiClient.get('/health', {
        timeout: this.config.timeout.connect
      });

      return {
        healthy: true,
        status: 'ok',
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'unhealthy',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Promise<Object>} 缓存统计信息
   */
  async getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * 清除缓存
   * @param {string} [pattern] - 缓存键模式
   * @returns {Promise<void>}
   */
  async clearCache(pattern) {
    if (pattern) {
      await this.cacheManager.invalidatePattern(pattern);
    } else {
      await this.cacheManager.clear();
    }
  }

  /**
   * 使相关缓存失效
   * @param {string} [containerTag] - 容器标签
   * @returns {Promise<void>}
   */
  async invalidateRelatedCaches(containerTag) {
    // 使用户画像缓存失效
    if (containerTag) {
      await this.cacheManager.invalidate(`profile:${containerTag}`);
    }

    // 使搜索结果缓存失效
    await this.cacheManager.invalidatePattern('search:');
  }

  /**
   * 启用离线模式
   */
  enableOfflineMode() {
    this.errorHandler.enableOfflineMode();
  }

  /**
   * 禁用离线模式
   */
  disableOfflineMode() {
    this.errorHandler.disableOfflineMode();
  }

  /**
   * 检查是否为离线模式
   * @returns {boolean} 是否为离线模式
   */
  isOfflineMode() {
    return this.errorHandler.isOfflineMode();
  }

  /**
   * 销毁适配器
   */
  async destroy() {
    // 清理缓存
    await this.cacheManager.clear();

    // 重置状态
    this.initialized = false;

    // console.info('[SupermemoryAdapter] 已销毁');
  }
}

export { SupermemoryAdapter };
