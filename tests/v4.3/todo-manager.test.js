/**
 * HundunOS v4.3 - TodoManager 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TodoManager } from '../../kernel/planning/todo-manager.js';

describe('TodoManager', () => {
  let todoManager;
  let mockKernel;

  beforeEach(() => {
    mockKernel = {
      config: {
        storageDir: '.hundunos/test',
      },
    };
    todoManager = new TodoManager(mockKernel);
  });

  describe('update', () => {
    it('should update todo list successfully', () => {
      const result = todoManager.update([
        { content: 'Task 1', status: 'pending' },
        { content: 'Task 2', status: 'in_progress', activeForm: 'Working on Task 2' },
        { content: 'Task 3', status: 'completed' },
      ]);

      expect(result).toContain('[ ] Task 1');
      expect(result).toContain('[>] Task 2 (Working on Task 2)');
      expect(result).toContain('[x] Task 3');
      expect(result).toContain('(1/3 completed)');
    });

    it('should throw error if items exceed max limit', () => {
      const items = Array.from({ length: 13 }, (_, i) => ({
        content: `Task ${i}`,
        status: 'pending',
      }));

      expect(() => todoManager.update(items)).toThrow('Keep the session plan short (max 12 items)');
    });

    it('should throw error if more than one item is in_progress', () => {
      expect(() => todoManager.update([
        { content: 'Task 1', status: 'in_progress' },
        { content: 'Task 2', status: 'in_progress' },
      ])).toThrow('Only one plan item can be in_progress');
    });

    it('should throw error if item has invalid status', () => {
      expect(() => todoManager.update([
        { content: 'Task 1', status: 'invalid' },
      ])).toThrow("Invalid status 'invalid'");
    });

    it('should throw error if item has no content', () => {
      expect(() => todoManager.update([
        { content: '', status: 'pending' },
      ])).toThrow('Item 0: content is required');
    });
  });

  describe('reminder', () => {
    it('should return null if no items', () => {
      const reminder = todoManager.reminder();
      expect(reminder).toBeNull();
    });

    it('should return null if rounds since update < interval', () => {
      todoManager.update([
        { content: 'Task 1', status: 'pending' },
      ]);

      const reminder = todoManager.reminder();
      expect(reminder).toBeNull();
    });

    it('should return reminder if rounds since update >= interval', () => {
      todoManager.update([
        { content: 'Task 1', status: 'pending' },
      ]);

      // Simulate 3 rounds without update
      todoManager.noteRoundWithoutUpdate();
      todoManager.noteRoundWithoutUpdate();
      todoManager.noteRoundWithoutUpdate();

      const reminder = todoManager.reminder();
      expect(reminder).toContain('<reminder>Refresh your current plan before continuing.</reminder>');
    });
  });

  describe('render', () => {
    it('should return "No session plan yet" if no items', () => {
      const result = todoManager.render();
      expect(result).toBe('No session plan yet.');
    });

    it('should render todo list', () => {
      todoManager.update([
        { content: 'Task 1', status: 'pending' },
        { content: 'Task 2', status: 'completed' },
      ]);

      const result = todoManager.render();
      expect(result).toContain('[ ] Task 1');
      expect(result).toContain('[x] Task 2');
      expect(result).toContain('(1/2 completed)');
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      todoManager.update([
        { content: 'Task 1', status: 'pending' },
        { content: 'Task 2', status: 'in_progress' },
        { content: 'Task 3', status: 'completed' },
      ]);

      const state = todoManager.getState();
      expect(state.items).toHaveLength(3);
      expect(state.itemCount).toBe(3);
      expect(state.completedCount).toBe(1);
      expect(state.roundsSinceUpdate).toBe(0);
    });
  });

  describe('hasOpenItems', () => {
    it('should return false if no items', () => {
      expect(todoManager.hasOpenItems()).toBe(false);
    });

    it('should return true if has pending items', () => {
      todoManager.update([
        { content: 'Task 1', status: 'pending' },
      ]);

      expect(todoManager.hasOpenItems()).toBe(true);
    });

    it('should return true if has in_progress items', () => {
      todoManager.update([
        { content: 'Task 1', status: 'in_progress' },
      ]);

      expect(todoManager.hasOpenItems()).toBe(true);
    });

    it('should return false if all items completed', () => {
      todoManager.update([
        { content: 'Task 1', status: 'completed' },
        { content: 'Task 2', status: 'completed' },
      ]);

      expect(todoManager.hasOpenItems()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats', () => {
      todoManager.update([
        { content: 'Task 1', status: 'pending' },
        { content: 'Task 2', status: 'in_progress' },
        { content: 'Task 3', status: 'completed' },
        { content: 'Task 4', status: 'completed' },
      ]);

      const stats = todoManager.getStats();
      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.completed).toBe(2);
    });
  });
});
