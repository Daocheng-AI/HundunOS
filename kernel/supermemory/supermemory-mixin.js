/**
 * Supermemory Mixin
 *
 * 将 Supermemory 的能力集成到 HundunOS 的 Mixin 架构中，
 * 提供统一的接口给 HundunOS 内核和其他模块使用。
 */

const { SupermemoryAdapter } = require('./adapters/supermemory-adapter.js');
const { getSupermemoryConfig, isSupermemoryEnabled } = require('./config-loader.js');

/**
 * Supermemory Mixin 类
 */
class SupermemoryMixin {
  /**
   * 创建 SupermemoryMixin 实例
   */
  constructor() {
    this.adapter = null;
    this.config = null;
    this.initialized = false;
    this.kernel = null;
  }

  /**
   * 初始化 Supermemory
   * @param {Object} kernel - HundunOS 内核实例
   * @returns {Promise<void>}
   */
  async init_supermemory(kernel) {
    if (this.initialized) {
      console.warn('[SupermemoryMixin] 已经初始化，跳过');
      return;
    }

    this.kernel = kernel;

    try {
      // 检查是否启用
      if (!isSupermemoryEnabled(kernel)) {
        console.info('[SupermemoryMixin] Supermemory 未启用，跳过初始化');
        return;
      }

      // 加载配置
      this.config = getSupermemoryConfig(kernel);

      console.info('[SupermemoryMixin] 开始初始化...');

      // 初始化适配器
      this.adapter = new SupermemoryAdapter(this.config);
      await this.adapter.initialize();

      // 注册到内核
      kernel._modules.supermemory = this;

      // 发布初始化完成事件
      kernel.messageBus.publish('supermemory:ready', {
        timestamp: Date.now()
      });

      this.initialized = true;
      console.info('[SupermemoryMixin] 初始化成功');
    } catch (error) {
      console.error('[SupermemoryMixin] 初始化失败:', error.message);
      // 不抛出错误，允许 HundunOS 继续启动
    }
  }

  /**
   * 获取适配器实例
   * @returns {SupermemoryAdapter} 适配器实例
   * @throws {Error} 如果未初始化
   */
  getSupermemoryAdapter() {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }
    return this.adapter;
  }

  /**
   * 获取配置
   * @returns {Object} Supermemory 配置
   * @throws {Error} 如果未加载配置
   */
  getSupermemoryConfig() {
    if (!this.config) {
      throw new Error('Supermemory 配置未加载');
    }
    return this.config;
  }

  /**
   * 健康检查
   * @returns {Promise<Object>} 健康状态
   */
  async checkSupermemoryHealth() {
    if (!this.adapter) {
      return {
        healthy: false,
        status: 'not_initialized',
        timestamp: Date.now()
      };
    }

    return await this.adapter.healthCheck();
  }

  /**
   * 获取当前容器标签
   * @returns {string} 容器标签
   */
  getCurrentContainerTag() {
    const strategy = this.config.containerTagStrategy;

    switch (strategy) {
      case 'user':
        // 使用用户 ID
        return `user_${this.kernel.userId || 'default'}`;

      case 'project':
        // 使用项目名称
        return `project_${this.kernel.projectName || 'default'}`;

      case 'custom':
        // 使用自定义标签
        return this.config.customContainerTag || 'default';

      default:
        return 'default';
    }
  }

  /**
   * 获取用户画像
   * @param {string} [containerTag] - 容器标签，默认使用当前标签
   * @returns {Promise<Object>} 用户画像
   */
  async getUserProfile(containerTag) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    const tag = containerTag || this.getCurrentContainerTag();
    return await this.adapter.getUserProfile(tag);
  }

  /**
   * 刷新用户画像
   * @param {string} [containerTag] - 容器标签，默认使用当前标签
   * @returns {Promise<Object>} 用户画像
   */
  async refreshUserProfile(containerTag) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    const tag = containerTag || this.getCurrentContainerTag();

    // 清除缓存
    await this.adapter.clearCache(`profile:${tag}`);

    // 重新获取
    return await this.adapter.getUserProfile(tag);
  }

  /**
   * 清除用户画像缓存
   * @param {string} [containerTag] - 容器标签，默认使用当前标签
   * @returns {Promise<void>}
   */
  async clearUserProfileCache(containerTag) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    const tag = containerTag || this.getCurrentContainerTag();
    await this.adapter.clearCache(`profile:${tag}`);
  }

  /**
   * 添加记忆
   * @param {string} content - 记忆内容
   * @param {Object} [options] - 记忆选项
   * @param {string} [options.containerTag] - 容器标签
   * @param {Object} [options.metadata] - 元数据
   * @returns {Promise<Object>} 创建的记忆
   */
  async addMemory(content, options = {}) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    const containerTag = options.containerTag || this.getCurrentContainerTag();
    return await this.adapter.addMemory(content, containerTag, options.metadata);
  }

  /**
   * 批量添加记忆
   * @param {Array} memories - 记忆数组
   * @returns {Promise<Object>} 批量结果
   */
  async batchAddMemories(memories) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    return await this.adapter.batchAddMemories(memories);
  }

  /**
   * 搜索记忆
   * @param {string} query - 查询字符串
   * @param {Object} [options] - 搜索选项
   * @param {string} [options.containerTag] - 容器标签
   * @param {string} [options.searchMode] - 搜索模式
   * @param {number} [options.limit] - 结果数量限制
   * @param {Object} [options.filters] - 过滤器
   * @returns {Promise<Object>} 搜索结果
   */
  async searchMemories(query, options = {}) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    const containerTag = options.containerTag || this.getCurrentContainerTag();
    return await this.adapter.searchMemories({
      query,
      containerTag,
      searchMode: options.searchMode || 'memories',
      limit: options.limit,
      filters: options.filters
    });
  }

  /**
   * 混合搜索
   * @param {string} query - 查询字符串
   * @param {Object} [options] - 搜索选项
   * @param {string} [options.containerTag] - 容器标签
   * @param {number} [options.limit] - 结果数量限制
   * @param {boolean} [options.includeFullDocs] - 是否包含完整文档
   * @param {Object} [options.filters] - 过滤器
   * @returns {Promise<Object>} 混合搜索结果
   */
  async hybridSearch(query, options = {}) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    const containerTag = options.containerTag || this.getCurrentContainerTag();
    return await this.adapter.hybridSearch(query, containerTag, options);
  }

  /**
   * 删除记忆
   * @param {string} memoryId - 记忆 ID
   * @returns {Promise<void>}
   */
  async deleteMemory(memoryId) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    return await this.adapter.deleteMemory(memoryId);
  }

  /**
   * 批量删除记忆
   * @param {Array} memoryIds - 记忆 ID 数组
   * @returns {Promise<Object>} 批量结果
   */
  async batchDeleteMemories(memoryIds) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    const results = {
      successCount: 0,
      failCount: 0,
      errors: []
    };

    for (const memoryId of memoryIds) {
      try {
        await this.adapter.deleteMemory(memoryId);
        results.successCount++;
      } catch (error) {
        results.failCount++;
        results.errors.push({
          error: error.message,
          data: { memoryId }
        });
      }
    }

    return results;
  }

  /**
   * 获取缓存统计信息
   * @returns {Promise<Object>} 缓存统计信息
   */
  async getCacheStats() {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    return await this.adapter.getCacheStats();
  }

  /**
   * 清除缓存
   * @param {string} [pattern] - 缓存键模式
   * @returns {Promise<void>}
   */
  async clearCache(pattern) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    await this.adapter.clearCache(pattern);
  }

  /**
   * 预热缓存
   * @param {string} [containerTag] - 容器标签
   * @returns {Promise<void>}
   */
  async warmupCache(containerTag) {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    const tag = containerTag || this.getCurrentContainerTag();

    try {
      // 预加载用户画像
      await this.adapter.getUserProfile(tag);

      // 预加载最近记忆
      await this.adapter.searchMemories({
        query: '',
        containerTag: tag,
        searchMode: 'memories',
        limit: 10
      });

      console.info('[SupermemoryMixin] 缓存预热完成');
    } catch (error) {
      console.warn('[SupermemoryMixin] 缓存预热失败:', error.message);
    }
  }

  /**
   * 启用离线模式
   */
  enableOfflineMode() {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    this.adapter.enableOfflineMode();
  }

  /**
   * 禁用离线模式
   */
  disableOfflineMode() {
    if (!this.adapter) {
      throw new Error('Supermemory 适配器未初始化');
    }

    this.adapter.disableOfflineMode();
  }

  /**
   * 检查是否为离线模式
   * @returns {boolean} 是否为离线模式
   */
  isOfflineMode() {
    if (!this.adapter) {
      return false;
    }

    return this.adapter.isOfflineMode();
  }

  /**
   * 销毁 Supermemory
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this.adapter) {
      await this.adapter.destroy();
      this.adapter = null;
    }

    this.config = null;
    this.initialized = false;
    this.kernel = null;

    console.info('[SupermemoryMixin] 已销毁');
  }
}

module.exports = { SupermemoryMixin };
