/**
 * 批量操作器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BulkOperator } from '../managers/bulk-operator.js';

describe('BulkOperator', () => {
  let bulkOperator;
  let mockAdapter;

  beforeEach(() => {
    mockAdapter = {
      addMemory: vi.fn(),
      searchMemories: vi.fn(),
      deleteMemory: vi.fn(),
      getUserProfile: vi.fn()
    };

    bulkOperator = new BulkOperator(mockAdapter, {
      maxBatchSize: 10,
      maxConcurrentBatches: 3
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const defaultBulk = new BulkOperator(mockAdapter);
      expect(defaultBulk.config.maxBatchSize).toBe(100);
      expect(defaultBulk.config.maxConcurrentBatches).toBe(5);
    });

    it('应该使用自定义配置', () => {
      const customBulk = new BulkOperator(mockAdapter, {
        maxBatchSize: 50,
        maxConcurrentBatches: 2
      });
      expect(customBulk.config.maxBatchSize).toBe(50);
      expect(customBulk.config.maxConcurrentBatches).toBe(2);
    });
  });

  describe('batchAdd', () => {
    it('应该成功批量添加记忆', async () => {
      const memories = Array(5).fill(null).map((_, i) => ({
        id: `mem-${i}`,
        content: `Memory ${i}`
      }));

      mockAdapter.addMemory.mockResolvedValue({ id: 'test', content: 'test' });

      const result = await bulkOperator.batchAdd(memories, {
        containerTag: 'test-container'
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(5);
      expect(result.successCount).toBe(5);
      expect(result.failCount).toBe(0);
    });

    it('应该正确处理空数组', async () => {
      const result = await bulkOperator.batchAdd([], {
        containerTag: 'test-container'
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(0);
    });

    it('应该正确处理部分失败', async () => {
      const memories = [
        { id: 'mem-1', content: 'Memory 1' },
        { id: 'mem-2', content: 'Memory 2' },
        { id: 'mem-3', content: 'Memory 3' }
      ];

      mockAdapter.addMemory
        .mockResolvedValueOnce({ id: 'mem-1', content: 'Memory 1' })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ id: 'mem-3', content: 'Memory 3' });

      const result = await bulkOperator.batchAdd(memories, {
        containerTag: 'test-container'
      });

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(1);
      expect(result.errors.length).toBe(1);
    });

    it('应该正确分批处理', async () => {
      const memories = Array(15).fill(null).map((_, i) => ({
        id: `mem-${i}`,
        content: `Memory ${i}`
      }));

      mockAdapter.addMemory.mockResolvedValue({ id: 'test', content: 'test' });

      await bulkOperator.batchAdd(memories, {
        containerTag: 'test-container'
      });

      // 应该分 2 批处理 (15 / 10 = 1.5 -> 2)
      expect(mockAdapter.addMemory).toHaveBeenCalledTimes(15);
    });

    it('应该支持进度回调', async () => {
      const memories = Array(5).fill(null).map((_, i) => ({
        id: `mem-${i}`,
        content: `Memory ${i}`
      }));

      const progressCallback = vi.fn();
      mockAdapter.addMemory.mockResolvedValue({ id: 'test', content: 'test' });

      await bulkOperator.batchAdd(memories, {
        containerTag: 'test-container',
        onProgress: progressCallback
      });

      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('batchDelete', () => {
    it('应该成功批量删除记忆', async () => {
      const memoryIds = ['mem-1', 'mem-2', 'mem-3'];

      mockAdapter.deleteMemory.mockResolvedValue({ success: true });

      const result = await bulkOperator.batchDelete(memoryIds);

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failCount).toBe(0);
    });

    it('应该正确处理部分失败', async () => {
      const memoryIds = ['mem-1', 'mem-2', 'mem-3'];

      mockAdapter.deleteMemory
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ success: true });

      const result = await bulkOperator.batchDelete(memoryIds);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(1);
    });
  });

  describe('batchSearch', () => {
    it('应该成功批量搜索记忆', async () => {
      const queries = ['query 1', 'query 2', 'query 3'];

      mockAdapter.searchMemories.mockResolvedValue({
        memories: [{ id: 'mem-1', content: 'result' }]
      });

      const result = await bulkOperator.batchSearch(queries, 'test-container');

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
      expect(result.results.length).toBe(3);
    });

    it('应该正确处理搜索失败', async () => {
      const queries = ['query 1', 'query 2'];

      mockAdapter.searchMemories
        .mockResolvedValueOnce({ memories: [] })
        .mockRejectedValueOnce(new Error('Failed'));

      const result = await bulkOperator.batchSearch(queries, 'test-container');

      expect(result.success).toBe(true);
      expect(result.failCount).toBe(1);
    });
  });

  describe('cancelTask', () => {
    it('应该取消正在进行的任务', async () => {
      const memories = Array(100).fill(null).map((_, i) => ({
        id: `mem-${i}`,
        content: `Memory ${i}`
      }));

      mockAdapter.addMemory.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ id: 'test' }), 100))
      );

      const taskPromise = bulkOperator.batchAdd(memories, {
        containerTag: 'test-container'
      });

      // 等待任务开始
      await new Promise(resolve => setTimeout(resolve, 50));

      // 取消任务
      const cancelResult = await bulkOperator.cancelTask(taskPromise.taskId);

      expect(cancelResult.success).toBe(true);
    });

    it('取消不存在的任务应该返回错误', async () => {
      const result = await bulkOperator.cancelTask('non-existent-task');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getTaskStatus', () => {
    it('应该返回任务状态', async () => {
      const memories = Array(5).fill(null).map((_, i) => ({
        id: `mem-${i}`,
        content: `Memory ${i}`
      }));

      mockAdapter.addMemory.mockResolvedValue({ id: 'test', content: 'test' });

      const taskPromise = bulkOperator.batchAdd(memories, {
        containerTag: 'test-container'
      });

      const status = await bulkOperator.getTaskStatus(taskPromise.taskId);

      expect(status).toHaveProperty('taskId');
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('progress');
    });

    it('不存在的任务应该返回 null', async () => {
      const status = await bulkOperator.getTaskStatus('non-existent-task');
      expect(status).toBeNull();
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', async () => {
      const memories = Array(5).fill(null).map((_, i) => ({
        id: `mem-${i}`,
        content: `Memory ${i}`
      }));

      mockAdapter.addMemory.mockResolvedValue({ id: 'test', content: 'test' });

      await bulkOperator.batchAdd(memories, {
        containerTag: 'test-container'
      });

      const stats = bulkOperator.getStats();

      expect(stats).toHaveProperty('totalTasks');
      expect(stats).toHaveProperty('completedTasks');
      expect(stats).toHaveProperty('failedTasks');
      expect(stats).toHaveProperty('activeTasks');
    });
  });

  describe('cleanup', () => {
    it('应该清理已完成的任务', async () => {
      const memories = Array(5).fill(null).map((_, i) => ({
        id: `mem-${i}`,
        content: `Memory ${i}`
      }));

      mockAdapter.addMemory.mockResolvedValue({ id: 'test', content: 'test' });

      const taskPromise = await bulkOperator.batchAdd(memories, {
        containerTag: 'test-container'
      });

      // 等待任务完成
      await taskPromise;

      // 清理已完成任务
      const result = await bulkOperator.cleanup();

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBeGreaterThan(0);
    });
  });
});
