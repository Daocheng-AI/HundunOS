/**
 * 同步管理器
 *
 * 管理本地记忆和云端记忆的同步，支持定时同步、增量同步、冲突解决
 */

import { EventEmitter } from 'events';

/**
 * 冲突类型
 */
const ConflictType = {
  SAME_ID_DIFFERENT_CONTENT: 'SAME_ID_DIFFERENT_CONTENT',
  SAME_CONTENT_DIFFERENT_ID: 'SAME_CONTENT_DIFFERENT_ID',
  TIMESTAMP_CONFLICT: 'TIMESTAMP_CONFLICT',
  DELETED_CONFLICT: 'DELETED_CONFLICT'
};

/**
 * 冲突解决策略
 */
const ConflictResolution = {
  LOCAL_WINS: 'LOCAL_WINS',           // 本地优先
  CLOUD_WINS: 'CLOUD_WINS',           // 云端优先
  NEWEST_WINS: 'NEWEST_WINS',         // 最新的优先
  LONGEST_WINS: 'LONGEST_WINS',       // 最长的优先
  MANUAL: 'MANUAL'                    // 手动解决
};

/**
 * 同步状态
 */
const SyncStatus = {
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  CONFLICT: 'CONFLICT',
  ERROR: 'ERROR',
  COMPLETED: 'COMPLETED'
};

/**
 * 冲突记录
 */
class ConflictRecord {
  constructor(localMemory, cloudMemory, type) {
    this.id = this.generateId();
    this.localMemory = localMemory;
    this.cloudMemory = cloudMemory;
    this.type = type;
    this.detectedAt = Date.now();
    this.resolvedAt = null;
    this.resolution = null;
    this.autoResolved = false;
  }

  generateId() {
    return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  resolve(resolution, memory) {
    this.resolvedAt = Date.now();
    this.resolution = resolution;
    this.resolvedMemory = memory;
    this.autoResolved = resolution !== ConflictResolution.MANUAL;
  }
}

/**
 * 同步任务
 */
class SyncTask {
  constructor(id, type, options = {}) {
    this.id = id;
    this.type = type; // 'full', 'incremental', 'conflict'
    this.status = SyncStatus.IDLE;
    this.startedAt = null;
    this.completedAt = null;
    this.options = options;

    this.stats = {
      total: 0,
      synced: 0,
      failed: 0,
      conflicted: 0,
      skipped: 0
    };

    this.errors = [];
    this.conflicts = [];
  }

  start() {
    this.status = SyncStatus.SYNCING;
    this.startedAt = Date.now();
  }

  complete() {
    this.status = SyncStatus.COMPLETED;
    this.completedAt = Date.now();
  }

  fail(error) {
    this.status = SyncStatus.ERROR;
    this.completedAt = Date.now();
    this.errors.push({
      message: error.message,
      timestamp: Date.now()
    });
  }

  addConflict(conflict) {
    this.conflicts.push(conflict);
    this.stats.conflicted++;
  }

  getDuration() {
    if (!this.startedAt) return 0;
    const end = this.completedAt || Date.now();
    return end - this.startedAt;
  }
}

/**
 * 同步管理器
 */
export class SyncManager extends EventEmitter {
  constructor(adapter, memoryGraph, options = {}) {
    super();

    this.adapter = adapter;
    this.memoryGraph = memoryGraph;

    this.config = {
      enabled: false,
      interval: 3600000, // 1 小时
      autoResolveConflicts: false,
      defaultResolution: ConflictResolution.NEWEST_WINS,
      maxRetries: 3,
      retryDelay: 5000,
      ...options
    };

    this.currentTask = null;
    this.syncTimer = null;
    this.lastSyncTime = null;

    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      conflictsDetected: 0,
      conflictsResolved: 0
    };

    this.conflictHistory = [];
  }

  /**
   * 启动同步管理器
   */
  async start() {
    if (!this.config.enabled) {
      // console.log('[SyncManager] 同步管理器未启用');
      return { success: true };
    }

    // console.log('[SyncManager] 启动同步管理器');

    // 启动定时同步
    if (this.config.interval > 0) {
      this.startPeriodicSync();
    }

    // 立即执行一次全量同步
    await this.sync();

    return { success: true };
  }

  /**
   * 停止同步管理器
   */
  async stop() {
    // console.log('[SyncManager] 停止同步管理器');

    // 停止定时同步
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // 等待当前任务完成
    if (this.currentTask && this.currentTask.status === SyncStatus.SYNCING) {
      // console.log('[SyncManager] 等待当前同步任务完成...');
      // 这里可以添加取消逻辑
    }

    return { success: true };
  }

  /**
   * 启动定时同步
   */
  startPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      this.sync().catch(error => {
        console.error('[SyncManager] 定时同步失败:', error);
      });
    }, this.config.interval);

    // console.log(`[SyncManager] 定时同步已启用，间隔: ${this.config.interval}ms`);
  }

  /**
   * 执行同步
   */
  async sync(options = {}) {
    const syncOptions = {
      type: options.type || 'full',
      autoResolve: options.autoResolve ?? this.config.autoResolveConflicts,
      containerTag: options.containerTag,
      ...options
    };

    const taskId = this.generateTaskId();
    const task = new SyncTask(taskId, syncOptions.type, syncOptions);
    this.currentTask = task;
    this.emit('sync:start', task);

    try {
      task.start();

      // 获取本地和云端记忆
      const [localMemories, cloudMemories] = await Promise.all([
        this.getLocalMemories(syncOptions.containerTag),
        this.getCloudMemories(syncOptions.containerTag)
      ]);

      task.stats.total = localMemories.length + cloudMemories.length;

      // 检测冲突
      const conflicts = this.detectConflicts(localMemories, cloudMemories);

      // 处理冲突
      for (const conflict of conflicts) {
        task.addConflict(conflict);
        this.conflictHistory.push(conflict);

        if (syncOptions.autoResolve) {
          await this.resolveConflict(conflict, syncOptions.defaultResolution);
        } else {
          this.emit('conflict:detected', conflict);
        }
      }

      // 同步本地到云端
      for (const localMemory of localMemories) {
        const conflict = conflicts.find(c =>
          c.localMemory?.id === localMemory.id ||
          c.cloudMemory?.id === localMemory.id
        );

        if (conflict && !conflict.resolvedMemory) {
          task.stats.skipped++;
          continue;
        }

        try {
          const cloudMemory = conflict?.resolvedMemory || localMemory;
          await this.syncToCloud(cloudMemory, syncOptions.containerTag);
          task.stats.synced++;
        } catch (error) {
          task.stats.failed++;
          task.errors.push({ memory: localMemory, error: error.message });
        }
      }

      // 同步云端到本地
      for (const cloudMemory of cloudMemories) {
        const conflict = conflicts.find(c =>
          c.localMemory?.id === cloudMemory.id ||
          c.cloudMemory?.id === cloudMemory.id
        );

        if (conflict && !conflict.resolvedMemory) {
          continue; // 已在本地同步中处理
        }

        // 检查是否已经存在
        const exists = localMemories.find(l => l.id === cloudMemory.id);
        if (exists) {
          continue;
        }

        try {
          await this.syncToLocal(cloudMemory);
          task.stats.synced++;
        } catch (error) {
          task.stats.failed++;
          task.errors.push({ memory: cloudMemory, error: error.message });
        }
      }

      task.complete();
      this.lastSyncTime = Date.now();
      this.stats.totalSyncs++;
      this.stats.successfulSyncs++;

      this.emit('sync:complete', task);
      return { success: true, task };

    } catch (error) {
      task.fail(error);
      this.stats.failedSyncs++;
      this.emit('sync:error', task);

      return { success: false, error: error.message, task };
    } finally {
      if (this.currentTask === task) {
        this.currentTask = null;
      }
    }
  }

  /**
   * 检测冲突
   */
  detectConflicts(localMemories, cloudMemories) {
    const conflicts = [];
    const localMap = new Map(localMemories.map(m => [m.id, m]));
    const cloudMap = new Map(cloudMemories.map(m => [m.id, m]));

    // 检查相同 ID 的记忆
    for (const [id, localMemory] of localMap) {
      const cloudMemory = cloudMap.get(id);
      if (cloudMemory) {
        if (this.isContentDifferent(localMemory, cloudMemory)) {
          conflicts.push(new ConflictRecord(
            localMemory,
            cloudMemory,
            ConflictType.SAME_ID_DIFFERENT_CONTENT
          ));
        }
      }
    }

    // 检查相同内容的记忆（不同 ID）
    const cloudContentMap = new Map();
    for (const cloudMemory of cloudMemories) {
      const contentKey = this.getContentKey(cloudMemory);
      cloudContentMap.set(contentKey, cloudMemory);
    }

    for (const localMemory of localMemories) {
      const contentKey = this.getContentKey(localMemory);
      const cloudMemory = cloudContentMap.get(contentKey);
      if (cloudMemory && cloudMemory.id !== localMemory.id) {
        conflicts.push(new ConflictRecord(
          localMemory,
          cloudMemory,
          ConflictType.SAME_CONTENT_DIFFERENT_ID
        ));
      }
    }

    return conflicts;
  }

  /**
   * 解决冲突
   */
  async resolveConflict(conflict, strategy) {
    let resolvedMemory;

    switch (strategy) {
      case ConflictResolution.LOCAL_WINS:
        resolvedMemory = conflict.localMemory;
        break;

      case ConflictResolution.CLOUD_WINS:
        resolvedMemory = conflict.cloudMemory;
        break;

      case ConflictResolution.NEWEST_WINS:
        resolvedMemory = this.getNewestMemory(conflict.localMemory, conflict.cloudMemory);
        break;

      case ConflictResolution.LONGEST_WINS:
        resolvedMemory = this.getLongestMemory(conflict.localMemory, conflict.cloudMemory);
        break;

      case ConflictResolution.MANUAL:
        resolvedMemory = null; // 等待手动解决
        break;

      default:
        resolvedMemory = this.getNewestMemory(conflict.localMemory, conflict.cloudMemory);
    }

    conflict.resolve(strategy, resolvedMemory);
    this.stats.conflictsResolved++;

    this.emit('conflict:resolved', conflict);

    return { success: true, resolvedMemory };
  }

  /**
   * 同步到云端
   */
  async syncToCloud(memory, containerTag) {
    const result = await this.adapter.addMemory(
      containerTag,
      memory.content,
      {
        ...memory.metadata,
        localId: memory.id,
        syncedAt: Date.now()
      }
    );

    if (!result) {
      throw new Error('同步到云端失败');
    }

    return result;
  }

  /**
   * 同步到本地
   */
  async syncToLocal(memory) {
    // 这里需要实现将云端记忆添加到本地存储
    // 具体实现取决于 HundunOS 的记忆存储机制
    const result = await this.memoryGraph?.addMemory?.({
      content: memory.content,
      metadata: {
        ...memory.metadata,
        cloudId: memory.id,
        syncedAt: Date.now()
      }
    });

    if (!result) {
      throw new Error('同步到本地失败');
    }

    return result;
  }

  /**
   * 获取本地记忆
   */
  async getLocalMemories(containerTag) {
    // 这里需要实现从本地存储获取记忆
    // 具体实现取决于 HundunOS 的记忆存储机制
    try {
      const memories = await this.memoryGraph?.getMemories?.(containerTag) || [];
      return memories;
    } catch (error) {
      console.error('[SyncManager] 获取本地记忆失败:', error);
      return [];
    }
  }

  /**
   * 获取云端记忆
   */
  async getCloudMemories(containerTag) {
    try {
      const result = await this.adapter.searchMemories('*', containerTag);
      return result?.memories || [];
    } catch (error) {
      console.error('[SyncManager] 获取云端记忆失败:', error);
      return [];
    }
  }

  /**
   * 工具方法
   */
  generateTaskId() {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  isContentDifferent(mem1, mem2) {
    return mem1.content !== mem2.content;
  }

  getContentKey(memory) {
    return `${memory.content}_${JSON.stringify(memory.metadata || {})}`;
  }

  getNewestMemory(mem1, mem2) {
    const time1 = mem1.updatedAt || mem1.createdAt || 0;
    const time2 = mem2.updatedAt || mem2.createdAt || 0;
    return time1 >= time2 ? mem1 : mem2;
  }

  getLongestMemory(mem1, mem2) {
    return mem1.content.length >= mem2.content.length ? mem1 : mem2;
  }

  /**
   * 获取同步状态
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      status: this.currentTask?.status || SyncStatus.IDLE,
      lastSyncTime: this.lastSyncTime,
      nextSyncTime: this.lastSyncTime
        ? this.lastSyncTime + this.config.interval
        : null,
      currentTask: this.currentTask,
      stats: this.stats
    };
  }

  /**
   * 获取冲突历史
   */
  getConflictHistory(options = {}) {
    const { limit = 100, resolved = null } = options;

    let conflicts = [...this.conflictHistory];

    if (resolved !== null) {
      conflicts = conflicts.filter(c =>
        (resolved && c.resolvedAt) || (!resolved && !c.resolvedAt)
      );
    }

    return conflicts.slice(-limit);
  }

  /**
   * 手动解决冲突
   */
  async manualResolveConflict(conflictId, resolution, memory) {
    const conflict = this.conflictHistory.find(c => c.id === conflictId);
    if (!conflict) {
      return { success: false, error: 'Conflict not found' };
    }

    conflict.resolve(resolution, memory);
    this.stats.conflictsResolved++;

    this.emit('conflict:resolved', conflict);

    return { success: true, conflict };
  }
}

export { ConflictType, ConflictResolution, SyncStatus };
export default SyncManager;
