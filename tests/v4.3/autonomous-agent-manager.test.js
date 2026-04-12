/**
 * HundunOS v4.3 - AutonomousAgentManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutonomousAgentManager } from '../../kernel/autonomous/autonomous-agent-manager.js';

describe('AutonomousAgentManager', () => {
  let agentManager;
  let mockKernel;

  beforeEach(() => {
    mockKernel = {
      config: {
        storageDir: '.hundunos/test',
      },
      modelRouter: {
        route: vi.fn().mockResolvedValue({
          success: true,
          content: [{ text: 'Task completed' }],
        }),
      },
    };
    agentManager = new AutonomousAgentManager(mockKernel);
  });

  afterEach(() => {
    agentManager.running = false;
  });

  describe('registerAgent', () => {
    it('should register an agent', () => {
      const agentId = agentManager.registerAgent({
        name: 'code-reviewer',
        capabilities: ['code', 'review'],
      });

      expect(agentId).toBeDefined();
      expect(agentManager.agents.has(agentId)).toBe(true);
    });

    it('should generate agent id if not provided', () => {
      const agentId = agentManager.registerAgent({
        name: 'agent-1',
      });

      expect(agentId).toBeDefined();
      expect(typeof agentId).toBe('string');
    });

    it('should set default values', () => {
      const agentId = agentManager.registerAgent({
        name: 'agent-1',
      });

      const agent = agentManager.agents.get(agentId);
      expect(agent.capabilities).toEqual([]);
      expect(agent.status).toBe('idle');
      expect(agent.currentTask).toBeNull();
      expect(agent.stats).toMatchObject({
        tasksCompleted: 0,
        tasksFailed: 0,
        totalDuration: 0,
      });
    });
  });

  describe('submitTask', () => {
    it('should submit a task', () => {
      const taskId = agentManager.submitTask({
        subject: 'Review PR',
        description: 'Review pull request #123',
        priority: 'high',
      });

      expect(taskId).toBeDefined();
      expect(agentManager.taskQueue.size()).toBe(1);
    });

    it('should generate task id if not provided', () => {
      const taskId = agentManager.submitTask({
        subject: 'Task 1',
      });

      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^task_\d+$/);
    });

    it('should calculate priority score', () => {
      agentManager.submitTask({
        subject: 'Task 1',
        priority: 'critical',
      });

      const task = agentManager.taskQueue.toArray()[0];
      expect(task.priorityScore).toBeGreaterThan(0);
    });
  });

  describe('getAgentStats', () => {
    it('should return null if agent not found', () => {
      const stats = agentManager.getAgentStats('non-existent');
      expect(stats).toBeNull();
    });

    it('should return agent stats', () => {
      const agentId = agentManager.registerAgent({
        name: 'agent-1',
        capabilities: ['code'],
      });

      const stats = agentManager.getAgentStats(agentId);
      expect(stats).toMatchObject({
        id: agentId,
        name: 'agent-1',
        capabilities: ['code'],
        status: 'idle',
        currentTask: null,
      });
    });
  });

  describe('getStats', () => {
    it('should return stats', () => {
      agentManager.registerAgent({ name: 'agent-1' });
      agentManager.registerAgent({ name: 'agent-2' });
      agentManager.submitTask({ subject: 'Task 1' });
      agentManager.submitTask({ subject: 'Task 2' });

      const stats = agentManager.getStats();
      expect(stats).toMatchObject({
        totalAgents: 2,
        idleAgents: 2,
        workingAgents: 0,
        pendingTasks: 2,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
      });
    });
  });

  describe('initialize', () => {
    it('should start dispatch loop', async () => {
      await agentManager.initialize();
      expect(agentManager.running).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should stop dispatch loop', async () => {
      await agentManager.initialize();
      await agentManager.shutdown();
      expect(agentManager.running).toBe(false);
    });

    it('should clear task queue', async () => {
      agentManager.submitTask({ subject: 'Task 1' });
      agentManager.submitTask({ subject: 'Task 2' });

      await agentManager.shutdown();

      expect(agentManager.taskQueue.size()).toBe(0);
    });
  });
});
