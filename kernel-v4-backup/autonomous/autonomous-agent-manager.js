/**
 * HundunOS v4.3 - Autonomous Agent Manager 自主认领管理器
 * 参考 learn-claude-code s17 Autonomous Agents
 * 实现任务自动认领和调度
 */

import { randomUUID } from 'crypto';
import { PriorityQueue } from 'datastructures-js';

/**
 * ClaimPolicy - 任务认领策略
 * v4.3: 参考 learn-claude-code s17
 */
export const ClaimPolicy = {
  /**
   * 匹配能力
   */
  matchCapabilities(task, agent) {
    if (!task.requiredCapabilities || task.requiredCapabilities.length === 0) {
      return true;
    }
    return task.requiredCapabilities.every(cap => 
      agent.capabilities?.includes(cap)
    );
  },

  /**
   * 计算优先级分数
   */
  calculatePriority(task, agent) {
    let score = 0;

    // 优先级权重
    const priorityWeight = {
      'critical': 100,
      'high': 80,
      'normal': 50,
      'low': 20,
    };
    score += priorityWeight[task.priority] || priorityWeight.normal;

    // 能力匹配度
    if (task.requiredCapabilities?.length > 0) {
      const matched = task.requiredCapabilities.filter(cap => 
        agent.capabilities?.includes(cap)
      ).length;
      score += (matched / task.requiredCapabilities.length) * 30;
    }

    // 时间紧迫性
    if (task.dueAt) {
      const timeLeft = task.dueAt - Date.now();
      if (timeLeft < 3600000) score += 20; // 1小时内
      if (timeLeft < 86400000) score += 10; // 24小时内
    }

    return score;
  },
};

/**
 * AutonomyState - 自治状态
 * v4.3: 参考 learn-claude-code s17
 */
export const AutonomyState = {
  IDLE: 'idle',
  POLLING: 'polling',
  WORKING: 'working',
  WAITING: 'waiting',
  SHUTDOWN: 'shutdown',
};

/**
 * AutonomousAgentManager - 自主代理管理器
 * v4.3: 参考 learn-claude-code s17
 */
export class AutonomousAgentManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.agents = new Map();
    this.taskQueue = new PriorityQueue((a, b) => b.priority - a.priority);
    this.running = false;
    this.pollInterval = 5000; // 5秒轮询间隔
  }

  /**
   * 初始化
   */
  async initialize() {
    this.running = true;
    this._dispatchLoop();
  }

  /**
   * 注册代理
   * @param {Object} config - 代理配置
   * @returns {string} 代理 ID
   */
  registerAgent(config) {
    const agent = {
      id: config.id || randomUUID(),
      name: config.name || 'agent',
      capabilities: config.capabilities || [],
      currentTask: null,
      status: AutonomyState.IDLE,
      stats: {
        tasksCompleted: 0,
        tasksFailed: 0,
        totalDuration: 0,
      },
    };

    this.agents.set(agent.id, agent);
    return agent.id;
  }

  /**
   * 提交任务
   * @param {Object} task - 任务配置
   * @returns {string} 任务 ID
   */
  submitTask(task) {
    const taskWithPriority = {
      ...task,
      id: task.id || `task_${Date.now()}`,
      status: 'pending',
      submittedAt: Date.now(),
      priority: task.priority || 'normal',
      priorityScore: 0,
    };

    // 计算优先级分数
    taskWithPriority.priorityScore = this._calculatePriority(taskWithPriority);

    this.taskQueue.enqueue(taskWithPriority);
    this._tryDispatch();

    return taskWithPriority.id;
  }

  /**
   * 计算任务优先级分数
   */
  _calculatePriority(task) {
    let score = 0;

    // 优先级权重
    const priorityWeight = {
      'critical': 100,
      'high': 80,
      'normal': 50,
      'low': 20,
    };
    score += priorityWeight[task.priority] || priorityWeight.normal;

    // 时间紧迫性
    if (task.dueAt) {
      const timeLeft = task.dueAt - Date.now();
      if (timeLeft < 3600000) score += 20; // 1小时内
      if (timeLeft < 86400000) score += 10; // 24小时内
    }

    return score;
  }

  /**
   * 调度循环
   */
  async _dispatchLoop() {
    while (this.running) {
      await this._tryDispatch();
      await this._sleep(this.pollInterval);
    }
  }

  /**
   * 尝试调度任务
   */
  async _tryDispatch() {
    if (this.taskQueue.isEmpty()) {
      return;
    }

    const availableAgents = Array.from(this.agents.values()).filter(a => a.status === AutonomyState.IDLE);
    if (availableAgents.length === 0) {
      return;
    }

    for (const agent of availableAgents) {
      const task = this.taskQueue.dequeue();
      if (!task) {
        break;
      }

      const matched = ClaimPolicy.matchCapabilities(task, agent);
      if (!matched) {
        this.taskQueue.enqueue(task);
        continue;
      }

      await this._assignTask(agent, task);
    }
  }

  /**
   * 分配任务给代理
   */
  async _assignTask(agent, task) {
    agent.status = AutonomyState.WORKING;
    agent.currentTask = task;
    task.status = 'running';
    task.assignedTo = agent.id;
    task.startedAt = Date.now();

    try {
      const result = await this._executeTask(agent, task);

      task.status = 'completed';
      task.result = result;
      agent.stats.tasksCompleted++;
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      agent.stats.tasksFailed++;
    } finally {
      agent.currentTask = null;
      agent.status = AutonomyState.IDLE;
    }
  }

  /**
   * 执行任务
   */
  async _executeTask(agent, task) {
    // 使用 agent 的 system prompt 和工具执行任务
    const messages = [{ role: 'user', content: task.description }];
    const tools = this.kernel?.toolBridge?.list() || [];

    const response = await this.kernel?.modelRouter?.route({
      messages,
      tools,
      model: 'gpt-4o-mini',
      maxTokens: 4000,
      strategy: 'COST_OPTIMIZED',
    });

    return {
      success: response?.success !== false,
      content: response?.content,
      latency: Date.now() - task.startedAt,
    };
  }

  /**
   * 空闲轮询
   */
  async _idlePoll() {
    const availableAgents = Array.from(this.agents.values()).filter(a => a.status === AutonomyState.IDLE);
    if (availableAgents.length === 0) {
      return;
    }

    const unassignedTasks = Array.from(this.taskQueue.toArray()).filter(t => 
      t.status === 'pending' && !t.assignedTo
    );

    for (const agent of availableAgents) {
      if (unassignedTasks.length === 0) break;

      const task = unassignedTasks.shift();
      const matched = ClaimPolicy.matchCapabilities(task, agent);
      if (matched) {
        await this._assignTask(agent, task);
      }
    }
  }

  /**
   * 获取代理状态
   */
  getAgentStats(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return null;
    }

    return {
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities,
      status: agent.status,
      currentTask: agent.currentTask,
      stats: agent.stats,
    };
  }

  /**
   * 获取统计
   */
  getStats() {
    const agents = Array.from(this.agents.values());
    const tasks = Array.from(this.taskQueue.toArray());

    return {
      totalAgents: agents.length,
      idleAgents: agents.filter(a => a.status === AutonomyState.IDLE).length,
      workingAgents: agents.filter(a => a.status === AutonomyState.WORKING).length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      runningTasks: tasks.filter(t => t.status === 'running').length,
      completedTasks: agents.reduce((sum, a) => sum + a.stats.tasksCompleted, 0),
      failedTasks: agents.reduce((sum, a) => sum + a.stats.tasksFailed, 0),
    };
  }

  /**
   * 停止
   */
  async shutdown() {
    this.running = false;

    // 等待所有代理完成任务
    const tasks = [];
    for (const agent of this.agents.values()) {
      if (agent.status === AutonomyState.WORKING) {
        tasks.push(this._waitForAgentCompletion(agent));
      }
    }

    await Promise.allSettled(tasks);

    // 清空任务队列
    while (!this.taskQueue.isEmpty()) {
      this.taskQueue.dequeue();
    }
  }

  /**
   * 等待代理完成任务
   */
  async _waitForAgentCompletion(agent) {
    while (agent.status === AutonomyState.WORKING) {
      await this._sleep(1000);
    }
  }

  /**
   * 睡眠
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
