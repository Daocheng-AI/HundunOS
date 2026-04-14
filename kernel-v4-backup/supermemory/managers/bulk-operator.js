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
    this.cleanupInterval = globalThis.setInterval(() => this.cleanupOldTasks(), 3600000); // 每小时清理一次
    // 统计信息
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      activeTasks: 0,
    };
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务 ID
   * @returns {Promise<Object|null>} 任务状态
   */
  async getTaskStatus(taskId) {
    const progress = this.progressMap.get(taskId);
    if (!progress) return null;
    return {
      taskId: progress.taskId,
      status: progress.status,
      progress: progress.getProgress(),
    };
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 清理已完成的任务
   * @returns {Promise<Object>} 清理结果
   */
  async cleanup() {
    let cleanedCount = 0;
    for (const [taskId, progress] of this.progressMap) {
      if (progress.status === 'completed' || progress.status === 'cancelled' || progress.status === 'failed') {
        this.progressMap.delete(taskId);
        cleanedCount++;
      }
    }
    return { success: true, cleanedCount };
  }

  /**
   * 批量添加记忆
   * @param {Array} memories - 记忆数组
   * @param {Object} [options] - 批量选项
   * @returns {Promise<Object>} 批量结果（附加 taskId 属性）
   */
  async batchAdd(memories, options = {}) {
    if (!this.config.enabled) {
      // 降级到逐个添加
      const result = await this._addIndividually(memories);
      return Object.assign(Promise.resolve(result), { taskId: null });
    }

    const maxBatchSize = options.maxBatchSize || this.config.maxBatchSize;
    const maxConcurrentBatches = options.maxConcurrentBatches || this.config.maxConcurrentBatches;
    const onProgress = options.onProgress;

    // 生成任务 ID
    const taskId = this._generateTaskId();
    const progress = new BatchProgress(taskId, memories.length);
    this.progressMap.set(taskId, progress);
    this.stats.totalTasks++;
    this.stats.activeTasks++;

    let result;
    try {
      progress.start();

      // 分批
      const batches = this._splitIntoBatches(memories, maxBatchSize);

      // 并发执行（带进度回调）
      const results = await this._executeBatchesConcurrently(
        batches,
        maxConcurrentBatches,
        progress,
        onProgress
      );

      progress.complete();
      this.stats.completedTasks++;
      this.stats.activeTasks--;

      result = {
        success: true,
        total: memories.length,
        successCount: results.successCount,
        failCount: results.failCount,
        errors: results.errors,
        duration: progress.getDuration()
      };
    } catch (error) {
      progress.addError(error);
      progress.complete();
      this.stats.failedTasks++;
      this.stats.activeTasks--;

      result = {
        success: false,
        total: memories.length,
        successCount: progress.completed,
        failCount: progress.failed,
        errors: progress.errors,
        error: error.message,
        duration: progress.getDuration()
      };
    }

    // T-01 修复：将 taskId 直接放入 result 对象，确保 await 后仍可访问
    result.taskId = taskId;
    return result;
  }

  /**
   * 批量搜索记忆
   * @param {Array} queries - 搜索查询数组
   * @param {string} [containerTag] - 容器标签（T-01 修复：移至第二参数）
   * @param {Object} [options] - 批量选项
   * @returns {Promise<Object>} 批量搜索结果
   */
  async batchSearch(queries, containerTag, options = {}) {
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
        success: true,
        taskId,
        total: queries.length,
        results: mergedResults.memories || [],
        // T-01 修复：使用 progress.failed 而非硬编码 0，正确反映失败查询数
        failCount: progress.failed,
        duration: progress.getDuration()
      };
    } catch (error) {
      progress.addError(error);
      progress.complete();

      return {
        success: false,
        taskId,
        total: queries.length,
        results: [],
        failCount: queries.length,
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
        success: true,
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
        success: false,
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
  async cancelTask(taskId) {
    const progress = this.progressMap.get(taskId);
    if (!progress) {
      return { success: false, error: 'Task not found' };
    }
    if (progress.status === 'completed' || progress.status === 'cancelled' || progress.status === 'failed') {
      return { success: false, error: 'Task already completed or cancelled' };
    }

    // T-01 修复：直接标记 status = 'cancelled'（batchProgress.cancel() 的等价操作）
    progress.status = 'cancelled';
    return { success: true, message: 'Task cancellation requested' };
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

    // console.debug('[BulkOperator] 已清理旧任务');
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
   * @param {Function} [onProgress] - 进度回调
   * @returns {Promise<Object>} 执行结果
   */
  async _executeBatchesConcurrently(batches, maxConcurrentBatches, progress, onProgress) {
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
          // 逐个添加批次中的记忆 — T-01 修复：每个 item 前检查取消状态
          for (const memory of batch) {
            if (progress.status === 'cancelled') {
              throw new Error('Task cancelled by user');
            }
            try {
              const result = await this.adapter.addMemory(memory);
              if (result && result.id) {
                results.successCount++;
              } else {
                results.failCount++;
                results.errors.push({ error: 'Add failed', data: memory });
              }
            } catch (itemError) {
              // T-01 修复：逐项捕获错误，不影响同批次其他 item
              results.failCount++;
              results.errors.push({ error: itemError.message, data: memory });
            }
            progress.update(results.successCount, results.failCount);
            if (onProgress) {
              onProgress({
                taskId: progress.taskId,
                completed: progress.completed,
                failed: progress.failed,
                total: progress.total,
                progress: progress.getProgress()
              });
            }
          }
        } catch (error) {
          // 仅捕获外层取消错误（已在内层循环处理逐项错误）
          progress.addError(error);
          results.errors.push({ error: error.message, data: batch });
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
          // T-01 修复：处理 adapter 返回 undefined/null 的边界情况
          if (result == null) {
            throw new Error(`searchMemories returned ${result} for query: ${query}`);
          }
          results.push(result);
          progress.update(results.filter(r => !r.error).length, results.filter(r => r.error).length);
        } catch (error) {
          progress.addError(error);
          results.push({ error: error.message, query });
          progress.update(results.filter(r => !r.error).length, results.filter(r => r.error).length);
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
    // console.info('[BulkOperator] 已销毁');
  }
}

export { BulkOperator, BatchProgress };
