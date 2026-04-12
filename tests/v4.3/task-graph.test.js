/**
 * HundunOS v4.3 - TaskGraph 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskGraph } from '../../kernel/task-graph.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('TaskGraph', () => {
  let taskGraph;
  let mockKernel;
  const storageDir = '.hundunos/test/tasks';

  beforeEach(() => {
    mockKernel = {
      config: {
        storageDir: '.hundunos/test',
      },
    };
    taskGraph = new TaskGraph(mockKernel);
    mkdirSync(storageDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a task', async () => {
      const task = await taskGraph.create('Fix bug', 'Fix the critical bug');
      
      expect(task.id).toBe(1);
      expect(task.subject).toBe('Fix bug');
      expect(task.description).toBe('Fix the critical bug');
      expect(task.status).toBe('pending');
      expect(task.blockedBy).toEqual([]);
      expect(task.blocks).toEqual([]);
      expect(task.owner).toBe('');
    });

    it('should create task with description', async () => {
      const task = await taskGraph.create('Write test', 'Write unit tests for auth module');
      
      expect(task.description).toBe('Write unit tests for auth module');
    });

    it('should increment task id', async () => {
      const task1 = await taskGraph.create('Task 1');
      const task2 = await taskGraph.create('Task 2');
      
      expect(task1.id).toBe(1);
      expect(task2.id).toBe(2);
    });
  });

  describe('get', () => {
    it('should return task by id', async () => {
      const created = await taskGraph.create('Fix bug');
      const task = await taskGraph.get(created.id);
      
      expect(task).not.toBeNull();
      expect(task.id).toBe(created.id);
      expect(task.subject).toBe('Fix bug');
    });

    it('should return null if task not found', async () => {
      const task = await taskGraph.get(999);
      
      expect(task).toBeNull();
    });
  });

  describe('update', () => {
    it('should update task status', async () => {
      const task = await taskGraph.create('Fix bug');
      const updated = await taskGraph.update(task.id, 'in_progress');
      
      expect(updated.status).toBe('in_progress');
    });

    it('should update task owner', async () => {
      const task = await taskGraph.create('Fix bug');
      const updated = await taskGraph.update(task.id, null, 'agent-1');
      
      expect(updated.owner).toBe('agent-1');
    });

    it('should add blockedBy dependency', async () => {
      const task1 = await taskGraph.create('Task 1');
      const task2 = await taskGraph.create('Task 2');
      
      await taskGraph.update(task2.id, null, null, [task1.id]);
      
      const updated = await taskGraph.get(task2.id);
      expect(updated.blockedBy).toContain(task1.id);
    });

    it('should add blocks dependency', async () => {
      const task1 = await taskGraph.create('Task 1');
      const task2 = await taskGraph.create('Task 2');
      
      await taskGraph.update(task1.id, null, null, null, [task2.id]);
      
      const updated = await taskGraph.get(task1.id);
      expect(updated.blocks).toContain(task2.id);
    });

    it('should add bidirectional dependency', async () => {
      const task1 = await taskGraph.create('Task 1');
      const task2 = await taskGraph.create('Task 2');
      
      await taskGraph.update(task1.id, null, null, null, [task2.id]);
      
      const updated1 = await taskGraph.get(task1.id);
      const updated2 = await taskGraph.get(task2.id);
      
      expect(updated1.blocks).toContain(task2.id);
      expect(updated2.blockedBy).toContain(task1.id);
    });

    it('should clear blockedBy when task completed', async () => {
      const task1 = await taskGraph.create('Task 1');
      const task2 = await taskGraph.create('Task 2');
      
      await taskGraph.update(task2.id, null, null, [task1.id]);
      await taskGraph.update(task1.id, 'completed');
      
      const updated = await taskGraph.get(task2.id);
      expect(updated.blockedBy).not.toContain(task1.id);
    });

    it('should throw error if task not found', async () => {
      await expect(taskGraph.update(999, 'in_progress')).rejects.toThrow('Task 999 not found');
    });

    it('should throw error if status is invalid', async () => {
      const task = await taskGraph.create('Task 1');
      
      await expect(taskGraph.update(task.id, 'invalid')).rejects.toThrow("Invalid status: invalid");
    });
  });

  describe('listAll', () => {
    it('should return empty list if no tasks', async () => {
      const tasks = await taskGraph.listAll();
      
      expect(tasks).toEqual([]);
    });

    it('should return all tasks', async () => {
      await taskGraph.create('Task 1');
      await taskGraph.create('Task 2');
      await taskGraph.create('Task 3');
      
      const tasks = await taskGraph.listAll();
      
      expect(tasks).toHaveLength(3);
      expect(tasks[0].subject).toBe('Task 1');
      expect(tasks[1].subject).toBe('Task 2');
      expect(tasks[2].subject).toBe('Task 3');
    });
  });

  describe('delete', () => {
    it('should delete task', async () => {
      const task = await taskGraph.create('Task 1');
      const result = await taskGraph.delete(task.id);
      
      expect(result).toBe(true);
      
      const deleted = await taskGraph.get(task.id);
      expect(deleted).toBeNull();
    });

    it('should return false if task not found', async () => {
      const result = await taskGraph.delete(999);
      
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats', async () => {
      await taskGraph.create('Task 1');
      const task2 = await taskGraph.create('Task 2');
      await taskGraph.update(task2.id, 'in_progress');
      const task3 = await taskGraph.create('Task 3');
      await taskGraph.update(task3.id, 'completed');
      const task4 = await taskGraph.create('Task 4');
      await taskGraph.update(task4.id, 'deleted');
      
      const stats = await taskGraph.getStats();
      
      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.deleted).toBe(1);
    });
  });

  describe('getDependencyGraph', () => {
    it('should return dependency graph', async () => {
      const task1 = await taskGraph.create('Task 1');
      const task2 = await taskGraph.create('Task 2');
      const task3 = await taskGraph.create('Task 3');
      
      await taskGraph.update(task1.id, null, null, null, [task2.id]);
      await taskGraph.update(task2.id, null, null, [task3.id]);
      
      const graph = await taskGraph.getDependencyGraph();
      
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);
      
      expect(graph.edges[0]).toMatchObject({
        from: task1.id,
        to: task2.id,
        type: 'blocks',
      });
      expect(graph.edges[1]).toMatchObject({
        from: task2.id,
        to: task3.id,
        type: 'blocks',
      });
    });
  });
});
