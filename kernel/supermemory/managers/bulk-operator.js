/**
 * Supermemory 批量操作器
 *
 * 优化批量操作，减少 API 调用次数，提升性能。
 */

/**
 * 批量进度类
 */
class BatchProgress {
  /**
   * 创建批量进度实例
   * @param {string} taskId - 任务 ID
   * @param {number} total - 总数
   */
  constructor(taskId, total) {
    this.taskId = taskId;
    this.total = total;
    this.completed = 0;
    this.failed = 0;
    this.status = 'pending';
    this.startTime = Date.now();
    this.endTime = null;
    this.errors = [];
  }

  /**
   * 更新进度
   * @param {number} completed - 完成数
   * @param {number} failed - 失败数
   */
  update(completed, failed) {
    this.completed = completed;
    this.failed = failed;
  }

  /**
   * 完成任务
   */
  complete() {
    this.status = 'completed';
    this.endTime = Date.now();
  }

  /**
   * 取消任务
   */
  cancel() {
    this.status = 'cancelled';
    this.endTime = Date.now();
  }

  /**
   * 标记为进行中
   */
  start() {
    this.status = 'in_progress';
  }

  /**
   * 添加错误
   * @param {Error} error - 错误对象
   */
  addError(error) {
    this.errors.push({
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
    this.failed++;
  }

  /**
   * 获取进度百分比
   * @returns {number} 进度百分比
   */
  getProgress() {
    if (this.total === 0) return 0;
    return Math.round(((this.completed + this.failed) / this.total) * 100);
  }

  /**
   * 获取耗时
   * @returns {number} 耗时（毫秒）
   */
  getDuration() {
    const endTime = this.endTime || Date.now();
    return endTime - this.startTime;
  }
}

/**
 * 批量操作器类
 */
class BulkOperator {
  /**
   * 创建批量操作器实例
   * @param {Object} adapter - Supermemory 适配器实例
   * @param {Object} config - 批量操作配置
   */
  constructor(adapter, config = {}) {
    this.adapter = adapter;
    this.config = {
      enabled: true,
      maxBatchSize: 100,
      maxConcurrentBatches: 5,
      ...config
    };

    // 进度跟踪
    this.progressMap = new Map();
    this.cleanupInterval = setInterval(() => this.cleanupOldTasks(), 3600000); // 每小时清理一次
  }

  /**
   * 批量添加记忆
   * @param {Array} memories - 记忆数组
   * @param {Object} [options] - 批量选项
   * @returns {Promise<Object>} 批量结果
   */
  async batchAdd(memories, options = {}) {
    if (!this.config.enabled) {
      // 降级到逐个添加
      return this._addIndividually(memories);
    }

    const maxBatchSize = options.maxBatchSize || this.config.maxBatchSize;
    const maxConcurrentBatches = options.maxConcurrentBatches || this.config.maxConcurrentBatches;

    // 生成任务 ID
    const taskId = this._generateTaskId();
    const progress = new BatchProgress(taskId, memories.length);
    this.progressMap.set(taskId, progress);

    try {
      progress.start();

      // 分批
      const batches = this._splitIntoBatches(memories, maxBatchSize);

      // 并发执行
      const results = await this._executeBatchesConcurrently(
        batches,
        maxConcurrentBatches,
        progress
      );

      progress.complete();

      return {
        taskId,
        total: memories.length,
        successCount: results.successCount,
        failCount: results.failCount,
        errors: results.errors,
        duration: progress.getDuration()
      };
    } catch (error) {
      progress.addError(error);
      progress.complete();

      return {
        taskId,
        total: memories.length,
        successCount: progress.completed,
        failCount: progress.failed,
        errors: progress.errors,
        error: error.message,
        duration: progress.getDuration()
      };
    }
  }

  /**
   * 批量搜索记忆
   * @param {Array} queries - 搜索查询数组
   * @param {Object} [options] - 批量选项
   * @returns {Promise<Object>} 批量搜索结果
   */
  async batchSearch(queries, options = {}) {
    const maxConcurrentBatches = options.maxConcurrentBatches || this.config.maxConcurrentBatches;

    // 生成任务 ID
    const taskId = this._generateTaskId();
    const progress = new BatchProgress(taskId, queries.length);
    this.progressMap.set(taskId, progress);

    try {
      progress.start();

      // 并发执行搜索
      const results = await this._executeSearchesConcurrently(
        queries,
        maxConcurrentBatches,
        progress
      );

      progress.complete();

      // 合并结果
      const mergedResults = this._mergeSearchResults(results);

      return {
        taskId,
        total: queries.length,
        results: mergedResults,
        duration: progress.getDuration()
      };
    } catch (error) {
      progress.addError(error);
      progress.complete();

      return {
        taskId,
        total: queries.length,
        results: [],
        error: error.message,
        duration: progress.getDuration()
      };
    }
  }

  /**
   * 批量删除记忆
   * @param {Array} memoryIds - 记忆 ID 数组
   * @param {Object} [options] - 批量选项
   * @returns {Promise<Object>} 批量结果
   */
  async batchDelete(memoryIds, options = {}) {
    const maxConcurrentBatches = options.maxConcurrentBatches || this.config.maxConcurrentBatches;

    // 生成任务 ID
    const taskId = this._generateTaskId();
    const progress = new BatchProgress(taskId, memoryIds.length);
    this.progressMap.set(taskId, progress);

    try {
      progress.start();

      // 并发执行删除
      const results = await this._executeDeletesConcurrently(
        memoryIds,
        maxConcurrentBatches,
        progress
      );

      progress.complete();

      return {
        taskId,
        total: memoryIds.length,
        successCount: results.successCount,
        failCount: results.failCount,
        errors: results.errors,
        duration: progress.getDuration()
      };
    } catch (error) {
      progress.addError(error);
      progress.complete();

      return {
        taskId,
        total: memoryIds.length,
        successCount: progress.completed,
        failCount: progress.failed,
        errors: progress.errors,
        error: error.message,
        duration: progress.getDuration()
      };
    }
  }

  /**
   * 获取批量操作进度
   * @param {string} taskId - 任务 ID
   * @returns {Object|null} 批量进度
   */
  getProgress(taskId) {
    const progress = this.progressMap.get(taskId);
    if (!progress) {
      return null;
    }

    return {
      taskId: progress.taskId,
      total: progress.total,
      completed: progress.completed,
      failed: progress.failed,
      status: progress.status,
      progress: progress.getProgress(),
      duration: progress.getDuration(),
      errors: progress.errors
    };
  }

  /**
   * 取消批量操作
   * @param {string} taskId - 任务 ID
   * @returns {boolean} 是否成功取消
   */
  cancelTask(taskId) {
    const progress = this.progressMap.get(taskId);
    if (!progress || progress.status === 'completed') {
      return false;
    }

    progress.cancel();
    return true;
  }

  /**
   * 清理旧任务
   */
  cleanupOldTasks() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const [taskId, progress] of this.progressMap.entries()) {
      if (progress.endTime && progress.endTime < oneHourAgo) {
        this.progressMap.delete(taskId);
      }
    }

    console.debug('[BulkOperator] 已清理旧任务');
  }

  /**
   * 生成任务 ID
   * @returns {string} 任务 ID
   */
  _generateTaskId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 分批
   * @param {Array} items - 项目数组
   * @param {number} batchSize - 批次大小
   * @returns {Array} 批次数组
   */
  _splitIntoBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 并发执行批次
   * @param {Array} batches - 批次数组
   * @param {number} maxConcurrentBatches - 最大并发批数
   * @param {BatchProgress} progress - 进度对象
   * @returns {Promise<Object>} 执行结果
   */
  async _executeBatchesConcurrently(batches, maxConcurrentBatches, progress) {
    const results = {
      successCount: 0,
      failCount: 0,
      errors: []
    };

    let currentIndex = 0;

    const processBatch = async () => {
      while (currentIndex < batches.length) {
        const batch = batches[currentIndex++];
        
        try {
          // 调用适配器的批量添加方法
          const batchResult = await this.adapter.batchAddMemories(batch);
          
          results.successCount += batchResult.successCount;
          results.failCount += batchResult.failCount;
          results.errors.push(...batchResult.errors);

          progress.update(results.successCount, results.failCount);
        } catch (error) {
          progress.addError(error);
          results.failCount += batch.length;
          results.errors.push({
            error: error.message,
            data: batch
          });
        }
      }
    };

    // 创建并发任务
    const workers = [];
    for (let i = 0; i < Math.min(maxConcurrentBatches, batches.length); i++) {
      workers.push(processBatch());
    }

    // 等待所有任务完成
    await Promise.all(workers);

    return results;
  }

  /**
   * 并发执行搜索
   * @param {Array} queries - 查询数组
   * @param {number} maxConcurrentBatches - 最大并发批数
   * @param {BatchProgress} progress - 进度对象
   * @returns {Promise<Array>} 搜索结果
   */
  async _executeSearchesConcurrently(queries, maxConcurrentBatches, progress) {
    const results = [];
    let currentIndex = 0;

    const processQuery = async () => {
      while (currentIndex < queries.length) {
        const query = queries[currentIndex++];
        
        try {
          const result = await this.adapter.searchMemories(query);
          results.push(result);
          progress.update(results.length, 0);
        } catch (error) {
          progress.addError(error);
          results.push({ error: error.message, query });
        }
      }
    };

    // 创建并发任务
    const workers = [];
    for (let i = 0; i < Math.min(maxConcurrentBatches, queries.length); i++) {
      workers.push(processQuery());
    }

    // 等待所有任务完成
    await Promise.all(workers);

    return results;
  }

  /**
   * 并发执行删除
   * @param {Array} memoryIds - 记忆 ID 数组
   * @param {number} maxConcurrentBatches - 最大并发批数
   * @param {BatchProgress} progress - 进度对象
   * @returns {Promise<Object>} 执行结果
   */
  async _executeDeletesConcurrently(memoryIds, maxConcurrentBatches, progress) {
    const results = {
      successCount: 0,
      failCount: 0,
      errors: []
    };

    let currentIndex = 0;

    const processDelete = async () => {
      while (currentIndex < memoryIds.length) {
        const memoryId = memoryIds[currentIndex++];
        
        try {
          await this.adapter.deleteMemory(memoryId);
          results.successCount++;
          progress.update(results.successCount, results.failCount);
        } catch (error) {
          progress.addError(error);
          results.failCount++;
          results.errors.push({
            error: error.message,
            data: { memoryId }
          });
        }
      }
    };

    // 创建并发任务
    const workers = [];
    for (let i = 0; i < Math.min(maxConcurrentBatches, memoryIds.length); i++) {
      workers.push(processDelete());
    }

    // 等待所有任务完成
    await Promise.all(workers);

    return results;
  }

  /**
   * 合并搜索结果
   * @param {Array} results - 搜索结果数组
   * @returns {Array} 合并后的结果
   */
  _mergeSearchResults(results) {
    const merged = {
      memories: [],
      documents: []
    };

    for (const result of results) {
      if (result.memories) {
        merged.memories.push(...result.memories);
      }
      if (result.documents) {
        merged.documents.push(...result.documents);
      }
    }

    // 去重（根据记忆 ID）
    const memoryMap = new Map();
    for (const memory of merged.memories) {
      const key = memory.memory?.id || memory.content;
      if (!memoryMap.has(key)) {
        memoryMap.set(key, memory);
      }
    }
    merged.memories = Array.from(memoryMap.values());

    // 按相关性排序
    merged.memories.sort((a, b) => {
      const scoreA = a.relevanceScore || 0;
      const scoreB = b.relevanceScore || 0;
      return scoreB - scoreA;
    });

    merged.documents.sort((a, b) => {
      const scoreA = a.relevanceScore || 0;
      const scoreB = b.relevanceScore || 0;
      return scoreB - scoreA;
    });

    return merged;
  }

  /**
   * 逐个添加（降级方案）
   * @param {Array} memories - 记忆数组
   * @returns {Promise<Object>} 批量结果
   */
  async _addIndividually(memories) {
    const results = {
      successCount: 0,
      failCount: 0,
      errors: []
    };

    for (const memory of memories) {
      try {
        await this.adapter.addMemory(memory.content, memory.containerTag, memory.metadata);
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
   * 销毁批量操作器
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.progressMap.clear();
    console.info('[BulkOperator] 已销毁');
  }
}

module.exports = { BulkOperator, BatchProgress };
