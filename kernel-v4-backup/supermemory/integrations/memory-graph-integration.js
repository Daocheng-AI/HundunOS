/**
 * Supermemory MemoryGraph 集成
 *
 * 将 Supermemory 与 HundunOS 的 MemoryGraph 模块集成，
 * 实现双层记忆架构和双向同步。
 */

/**
 * MemoryBridge - 连接本地记忆和云端记忆的桥接器
 */
class MemoryBridge {
  /**
   * 创建 MemoryBridge 实例
   * @param {Object} local - 本地 MemoryGraph 实例
   * @param {Object} adapter - Supermemory 适配器实例
   */
  constructor(local, adapter) {
    this.local = local;
    this.adapter = adapter;
    this.dualWriteEnabled = false;
    this.syncEnabled = false;
  }

  /**
   * 启用双写
   * @param {boolean} enabled - 是否启用
   */
  enableDualWrite(enabled) {
    this.dualWriteEnabled = enabled;
    // console.info(`[MemoryBridge] 双写已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 启用同步
   * @param {boolean} enabled - 是否启用
   */
  enableSync(enabled) {
    this.syncEnabled = enabled;
    // console.info(`[MemoryBridge] 同步已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 同步到云端
   * @param {Object} localMemory - 本地记忆
   * @returns {Promise<void>}
   */
  async syncToCloud(localMemory) {
    if (!this.dualWriteEnabled) {
      return;
    }

    try {
      // 转换为 Supermemory 格式
      const supermemoryFormat = this._convertToSupermemoryFormat(localMemory);

      // 添加到云端
      await this.adapter.addMemory(
        supermemoryFormat.content,
        supermemoryFormat.containerTag,
        supermemoryFormat.metadata
      );

      // console.debug('[MemoryBridge] 已同步到云端');
    } catch (error) {
      console.warn('[MemoryBridge] 同步到云端失败:', error.message);
      throw error;
    }
  }

  /**
   * 从云端同步
   * @param {string} containerTag - 容器标签
   * @returns {Promise<Array>} 同步的本地记忆
   */
  async syncFromCloud(containerTag) {
    if (!this.syncEnabled) {
      return [];
    }

    try {
      // 从云端获取记忆
      const results = await this.adapter.searchMemories({
        query: '',
        containerTag,
        searchMode: 'memories',
        limit: 100
      });

      const localMemories = [];

      // 转换为本地格式
      for (const memoryResult of results.memories || []) {
        const localMemory = this._convertToLocalFormat(memoryResult.memory);
        localMemories.push(localMemory);
      }

      // console.debug(`[MemoryBridge] 已从云端同步 ${localMemories.length} 条记忆`);
      return localMemories;
    } catch (error) {
      console.warn('[MemoryBridge] 从云端同步失败:', error.message);
      throw error;
    }
  }

  /**
   * 解决冲突
   * @param {Object} local - 本地记忆
   * @param {Object} cloud - 云端记忆
   * @param {'local'|'cloud'|'newest'|'longest'} [strategy='newest'] - 解决策略
   * @returns {Object} 解决后的记忆
   */
  resolveConflict(local, cloud, strategy = 'newest') {
    switch (strategy) {
      case 'local':
        return local;

      case 'cloud':
        return cloud;

      case 'newest':
        // 比较时间戳，保留最新的
        const localTime = local.updatedAt || local.createdAt;
        const cloudTime = cloud.updatedAt || cloud.createdAt;
        return localTime >= cloudTime ? local : cloud;

      case 'longest':
        // 比较内容长度，保留最长的
        const localLength = local.content?.length || 0;
        const cloudLength = cloud.content?.length || 0;
        return localLength >= cloudLength ? local : cloud;

      default:
        return cloud;
    }
  }

  /**
   * 转换为 Supermemory 格式
   * @param {Object} localMemory - 本地记忆
   * @returns {Object} Supermemory 格式的记忆
   */
  _convertToSupermemoryFormat(localMemory) {
    return {
      content: localMemory.content || localMemory.message || '',
      containerTag: localMemory.containerTag || 'default',
      metadata: {
        source: 'local',
        tags: localMemory.tags,
        importance: localMemory.importance,
        localId: localMemory.id,
        createdAt: localMemory.createdAt,
        updatedAt: localMemory.updatedAt
      }
    };
  }

  /**
   * 转换为本地格式
   * @param {Object} supermemoryMemory - Supermemory 记忆
   * @returns {Object} 本地格式的记忆
   */
  _convertToLocalFormat(supermemoryMemory) {
    return {
      id: supermemoryMemory.id,
      content: supermemoryMemory.content,
      message: supermemoryMemory.content,
      containerTag: supermemoryMemory.containerTag,
      tags: supermemoryMemory.metadata?.tags,
      importance: supermemoryMemory.metadata?.importance,
      source: 'cloud',
      cloudId: supermemoryMemory.id,
      createdAt: supermemoryMemory.createdAt,
      updatedAt: supermemoryMemory.updatedAt
    };
  }
}

/**
 * Supermemory MemoryGraph 集成类
 */
class SupermemoryMemoryGraphIntegration {
  /**
   * 创建集成实例
   * @param {Object} kernel - HundunOS 内核实例
   */
  constructor(kernel) {
    this.kernel = kernel;
    this.supermemory = kernel._modules.supermemory;
    this.memoryGraph = kernel._modules.memoryGraph;
    this.memoryBridge = null;
    this.enabled = false;
    this.config = {
      dualWrite: false,
      sync: false,
      syncInterval: 3600000, // 1 小时
      autoResolveConflicts: true,
      conflictStrategy: 'newest'
    };
    this.syncTimer = null;
  }

  /**
   * 初始化集成
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.supermemory || !this.memoryGraph) {
      console.warn('[SupermemoryMemoryGraph] Supermemory 或 MemoryGraph 未初始化，跳过集成');
      return;
    }

    // 创建 MemoryBridge
    this.memoryBridge = new MemoryBridge(
      this.memoryGraph,
      this.supermemory.getSupermemoryAdapter()
    );

    this.enabled = true;
    // console.info('[SupermemoryMemoryGraph] 初始化成功');

    // 如果启用同步，启动定时同步
    if (this.config.sync) {
      this.startSync();
    }
  }

  /**
   * 配置集成
   * @param {Object} config - 配置选项
   */
  configure(config) {
    this.config = {
      ...this.config,
      ...config
    };

    // 更新 MemoryBridge 配置
    if (this.memoryBridge) {
      this.memoryBridge.enableDualWrite(this.config.dualWrite);
      this.memoryBridge.enableSync(this.config.sync);
    }

    // 如果启用同步，启动定时同步
    if (this.config.sync && !this.syncTimer) {
      this.startSync();
    }
  }

  /**
   * 记录记忆（带双写）
   * @param {Object} message - 消息
   * @param {Object} intent - 意图
   * @param {Object} result - 结果
   * @returns {Promise<Object>} 本地记忆
   */
  async recordMemory(message, intent, result) {
    if (!this.enabled) {
      return await this._recordLocalOnly(message, intent, result);
    }

    try {
      // 记录到本地
      const localMemory = await this._recordLocalOnly(message, intent, result);

      // 双写到云端
      if (this.config.dualWrite && this.memoryBridge) {
        try {
          await this.memoryBridge.syncToCloud(localMemory);
        } catch (error) {
          console.warn('[SupermemoryMemoryGraph] 双写到云端失败:', error.message);
          // 不影响本地记录
        }
      }

      return localMemory;
    } catch (error) {
      console.error('[SupermemoryMemoryGraph] 记录记忆失败:', error.message);
      throw error;
    }
  }

  /**
   * 检索记忆（合并本地和云端）
   * @param {string} query - 查询字符串
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 记忆列表
   */
  async recallMemories(query, options = {}) {
    if (!this.enabled) {
      return await this._recallLocalOnly(query, options);
    }

    try {
      // 检索本地记忆
      const localResults = await this._recallLocalOnly(query, options);

      // 检索云端记忆
      let cloudResults = [];
      if (this.supermemory) {
        try {
          const containerTag = this.supermemory.getCurrentContainerTag();
          const searchResults = await this.supermemory.searchMemories(query, {
            containerTag,
            searchMode: 'memories',
            limit: options.limit || 20
          });

          cloudResults = searchResults.memories || [];
        } catch (error) {
          console.warn('[SupermemoryMemoryGraph] 检索云端记忆失败:', error.message);
        }
      }

      // 合并结果
      return this._mergeResults(localResults, cloudResults);
    } catch (error) {
      console.error('[SupermemoryMemoryGraph] 检索记忆失败:', error.message);
      throw error;
    }
  }

  /**
   * 仅记录到本地
   * @param {Object} message - 消息
   * @param {Object} intent - 意图
   * @param {Object} result - 结果
   * @returns {Promise<Object>} 本地记忆
   */
  async _recordLocalOnly(message, intent, result) {
    // 调用原有的 MemoryGraph 记录方法
    if (this.memoryGraph && typeof this.memoryGraph.record === 'function') {
      return await this.memoryGraph.record(message, intent, result);
    }

    // 如果 MemoryGraph 不可用，返回模拟记忆
    return {
      id: `local_${Date.now()}`,
      content: message,
      intent,
      result,
      createdAt: Date.now(),
      source: 'local'
    };
  }

  /**
   * 仅检索本地记忆
   * @param {string} query - 查询字符串
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 本地记忆列表
   */
  async _recallLocalOnly(query, options = {}) {
    // 调用原有的 MemoryGraph 检索方法
    if (this.memoryGraph && typeof this.memoryGraph.recall === 'function') {
      return await this.memoryGraph.recall(query, options);
    }

    // 如果 MemoryGraph 不可用，返回空数组
    return [];
  }

  /**
   * 合并本地和云端结果
   * @param {Array} localResults - 本地结果
   * @param {Array} cloudResults - 云端结果
   * @returns {Array} 合并后的结果
   */
  _mergeResults(localResults, cloudResults) {
    const merged = new Map();

    // 添加本地结果
    localResults.forEach(memory => {
      const key = memory.id || memory.content;
      merged.set(key, {
        ...memory,
        source: 'local'
      });
    });

    // 添加云端结果
    cloudResults.forEach(memoryResult => {
      const memory = memoryResult.memory || memoryResult;
      const key = memory.id || memory.content;

      // 如果已存在，检查是否需要解决冲突
      if (merged.has(key)) {
        const existing = merged.get(key);
        const resolved = this.memoryBridge.resolveConflict(
          existing,
          { ...memory, source: 'cloud' },
          this.config.conflictStrategy
        );
        merged.set(key, resolved);
      } else {
        merged.set(key, {
          ...memory,
          source: 'cloud'
        });
      }
    });

    // 转换为数组并按相关性排序
    return Array.from(merged.values()).sort((a, b) => {
      const scoreA = a.relevanceScore || 0;
      const scoreB = b.relevanceScore || 0;
      return scoreB - scoreA;
    });
  }

  /**
   * 启动定时同步
   */
  startSync() {
    if (this.syncTimer) {
      return;
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.sync();
      } catch (error) {
        console.error('[SupermemoryMemoryGraph] 定时同步失败:', error.message);
      }
    }, this.config.syncInterval);

    // console.info('[SupermemoryMemoryGraph] 定时同步已启动');
  }

  /**
   * 停止定时同步
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      // console.info('[SupermemoryMemoryGraph] 定时同步已停止');
    }
  }

  /**
   * 手动触发同步
   * @returns {Promise<Object>} 同步结果
   */
  async sync() {
    if (!this.enabled || !this.memoryBridge) {
      return {
        success: false,
        message: '集成未启用或 MemoryBridge 不可用'
      };
    }

    try {
      const containerTag = this.supermemory?.getCurrentContainerTag() || 'default';
      const cloudMemories = await this.memoryBridge.syncFromCloud(containerTag);

      return {
        success: true,
        syncedCount: cloudMemories.length,
        message: `成功同步 ${cloudMemories.length} 条记忆`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取同步状态
   * @returns {Object} 同步状态
   */
  getSyncStatus() {
    return {
      enabled: this.config.sync,
      dualWrite: this.config.dualWrite,
      syncInterval: this.config.syncInterval,
      syncTimerRunning: this.syncTimer !== null,
      conflictStrategy: this.config.conflictStrategy
    };
  }

  /**
   * 禁用集成
   */
  disable() {
    this.stopSync();
    this.enabled = false;
    // console.info('[SupermemoryMemoryGraph] 已禁用');
  }

  /**
   * 启用集成
   */
  enable() {
    this.enabled = true;
    if (this.config.sync) {
      this.startSync();
    }
    // console.info('[SupermemoryMemoryGraph] 已启用');
  }

  /**
   * 检查是否启用
   * @returns {boolean} 是否启用
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * 销毁集成
   */
  async destroy() {
    this.stopSync();
    this.memoryBridge = null;
    this.enabled = false;
    // console.info('[SupermemoryMemoryGraph] 已销毁');
  }
}

export {
  MemoryBridge,
  SupermemoryMemoryGraphIntegration
};
