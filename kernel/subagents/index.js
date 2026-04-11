/**
 * kernel/subagents/index.js
 * Subagents 子代理系统
 * 
 * 借鉴自 Claude Code Subagents 和 oh-my-claudecode 设计
 * 支持: context 隔离、worktree 隔离、background 执行
 * 支持: 任务模式系统 (Sisyphus/Hephaestus/Prometheus/Atlas)
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

/**
 * 任务模式 (借鉴 oh-my-claudecode)
 * 决定子代理的执行策略
 */
export const TaskMode = {
  /** Sisyphus: 循环迭代模式 - 持续执行、反复优化，直到达成目标 */
  ITERATION: 'sisyphus',
  /** Hephaestus: 深度精工模式 - 慢工出细活，每一步都打磨到位 */
  QUALITY: 'hephaestus',
  /** Prometheus: 探索突破模式 - 大胆尝试新方法，不走寻常路 */
  EXPLORATION: 'prometheus',
  /** Atlas: 计划执行模式 - 先规划再执行，稳定可靠 */
  PLANNING: 'atlas',
};

/**
 * 任务模式描述
 */
export const TaskModeConfig = {
  [TaskMode.ITERATION]: {
    name: 'Sisyphus',
    description: '循环迭代 - 持续优化直到达成目标',
    maxIterations: 10,
    defaultSubagents: ['Plan', 'Bash', 'code-review'],
  },
  [TaskMode.QUALITY]: {
    name: 'Hephaestus',
    description: '深度精工 - 高质量输出',
    maxIterations: 3,
    defaultSubagents: ['code-review', 'Plan'],
  },
  [TaskMode.EXPLORATION]: {
    name: 'Prometheus',
    description: '探索突破 - 创新方法解决问题',
    maxIterations: 5,
    defaultSubagents: ['Explore', 'Plan'],
  },
  [TaskMode.PLANNING]: {
    name: 'Atlas',
    description: '计划执行 - 先规划后执行',
    maxIterations: 2,
    defaultSubagents: ['Plan'],
  },
};

/**
 * 根据任务特征自动推荐任务模式
 */
export function suggestTaskMode(task) {
  const taskLower = task.toLowerCase();
  
  // 批量处理、重复任务 -> Sisyphus
  if (/批量|重复|多次|循环|迭代/i.test(task)) {
    return TaskMode.ITERATION;
  }
  // 高质量、精细 -> Hephaestus
  if (/高质量|精细|打磨|审查|优化/i.test(task)) {
    return TaskMode.QUALITY;
  }
  // 探索、突破、创新 -> Prometheus
  if (/探索|突破|创新|新方法|尝试/i.test(task)) {
    return TaskMode.EXPLORATION;
  }
  // 复杂项目、多步骤 -> Atlas
  if (/计划|复杂|多步骤|项目|架构/i.test(task)) {
    return TaskMode.PLANNING;
  }
  
  // 默认 Atlas（保守策略）
  return TaskMode.PLANNING;
}

/**
 * 内置子代理类型
 */
export const SubagentType = {
  GENERAL_PURPOSE: 'general-purpose',
  PLAN: 'Plan',
  EXPLORE: 'Explore',
  BASH: 'Bash',
  CODE_REVIEW: 'code-review',
};

/**
 * 隔离级别
 */
export const IsolationLevel = {
  /** 上下文隔离 (默认) */
  FORK: 'fork',
  /** Git Worktree 隔离 */
  WORKTREE: 'worktree',
  /** 后台执行 */
  BACKGROUND: 'background',
};

/**
 * 子代理配置
 */
export class Subagent {
  constructor(config = {}) {
    this.id = config.id || randomUUID();
    this.name = config.name || 'subagent';
    this.description = config.description || '';
    this.type = config.type || SubagentType.GENERAL_PURPOSE;
    this.model = config.model || null;  // null = 继承父级
    this.maxTurns = config.maxTurns || 50;
    this.timeout = config.timeout || 300000;
    this.isolation = config.isolation || IsolationLevel.FORK;
    this.context = config.context || null;
    this.tools = config.tools || null;  // null = 全部工具
    this.instructions = config.instructions || '';
    // 新增：任务模式
    this.taskMode = config.taskMode || null;  // null = 使用父级模式
  }

  /**
   * 转换为 YAML frontmatter 格式
   */
  toFrontmatter() {
    let fm = '---\n';
    fm += `name: ${this.name}\n`;
    fm += `description: ${this.description}\n`;
    if (this.type !== SubagentType.GENERAL_PURPOSE) fm += `type: ${this.type}\n`;
    if (this.model) fm += `model: ${this.model}\n`;
    if (this.maxTurns !== 50) fm += `maxTurns: ${this.maxTurns}\n`;
    if (this.timeout !== 300000) fm += `timeout: ${this.timeout}\n`;
    if (this.isolation !== IsolationLevel.FORK) fm += `isolation: ${this.isolation}\n`;
    if (this.tools) fm += `tools: ${this.tools.join(', ')}\n`;
    if (this.taskMode) fm += `taskMode: ${this.taskMode}\n`;
    fm += '---\n\n';
    fm += this.instructions;
    return fm;
  }
}

/**
 * 子代理管理器
 */
export class SubagentManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.subagents = new Map();
    this.activeSessions = new Map();
    this._registerBuiltInSubagents();
  }

  /**
   * 注册内置子代理
   */
  _registerBuiltInSubagents() {
    // Plan 子代理 - 计划模式研究
    this.register(new Subagent({
      name: 'Plan',
      type: SubagentType.PLAN,
      description: '计划模式子代理，用于研究分析',
      model: null,  // 继承父级模型
      tools: ['Read', 'Glob', 'Grep', 'Bash'],
      maxTurns: 30,
      instructions: `你是计划模式子代理。你的任务：
1. 深入分析用户请求
2. 列出详细的执行计划
3. 识别潜在风险和问题
4. 不要直接执行代码，只提供分析和建议

请以结构化方式呈现你的分析结果。`,
    }));

    // Explore 子代理 - 只读代码探索
    this.register(new Subagent({
      name: 'Explore',
      type: SubagentType.EXPLORE,
      description: '快速只读代码探索（使用 Haiku 模型）',
      model: 'haiku',  // 使用轻量模型
      tools: ['Glob', 'Grep', 'Read'],
      maxTurns: 20,
      instructions: `你是代码探索子代理。你的任务：
1. 快速理解代码结构
2. 找到相关文件和代码段
3. 提供简洁的代码概览
4. 不要修改任何代码

保持快速和简洁。`,
    }));

    // Bash 子代理 - 终端命令执行
    this.register(new Subagent({
      name: 'Bash',
      type: SubagentType.BASH,
      description: '终端命令执行子代理',
      model: null,
      tools: ['Bash'],
      maxTurns: 10,
      instructions: `你是终端命令执行子代理。
只执行用户请求的命令，返回命令输出。
如果命令有危险操作，先警告用户。`,
    }));

    // Code Review 子代理
    this.register(new Subagent({
      name: 'code-review',
      type: SubagentType.CODE_REVIEW,
      description: '代码审查专家（PROACTIVELY 在代码修改后使用）',
      model: 'sonnet',
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
      maxTurns: 20,
      instructions: `你是高级代码审查专家。重点关注：

1. **安全分析** - 认证/授权、数据暴露、注入漏洞
2. **性能审查** - 算法效率、内存优化、数据库查询
3. **代码质量** - SOLID 原则、设计模式、命名规范
4. **可维护性** - 可读性、函数大小、圈复杂度

输出格式：
- 总体评分 (1-5)
- 关键发现数量
- 优先改进区域
- 具体建议`,
    }));

    // Hephaestus 子代理 - 深度精工模式
    this.register(new Subagent({
      name: 'hephaestus',
      type: 'hephaestus',
      description: '深度精工 - 慢工出细活，每一步都打磨到位',
      model: 'sonnet',
      tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      maxTurns: 30,
      taskMode: TaskMode.QUALITY,
      instructions: `你是深度精工子代理 (Hephaestus)。你的任务：
1. 仔细分析每个代码变更
2. 确保代码质量达到最高标准
3. 考虑边界条件和异常情况
4. 优化性能和可维护性
5. 多次迭代直到满意为止

不要急于完成，质量优先。`,
    }));

    // Prometheus 子代理 - 探索突破模式
    this.register(new Subagent({
      name: 'prometheus',
      type: 'prometheus',
      description: '探索突破 - 大胆尝试新方法，不走寻常路',
      model: null,  // 继承父级（需要较强模型）
      tools: ['Read', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch'],
      maxTurns: 25,
      taskMode: TaskMode.EXPLORATION,
      instructions: `你是探索突破子代理 (Prometheus)。你的任务：
1. 不拘泥于传统解法
2. 寻找创新性的解决方案
3. 大胆假设，小心求证
4. 尝试多种方法，比较优劣
5. 突破思维定式

如果有更好的方案，不要害怕推翻重来。`,
    }));

    // Atlas 子代理 - 计划执行模式
    this.register(new Subagent({
      name: 'atlas',
      type: 'atlas',
      description: '计划执行 - 先规划再执行，稳定可靠',
      model: null,
      tools: ['Read', 'Glob', 'Grep'],
      maxTurns: 15,
      taskMode: TaskMode.PLANNING,
      instructions: `你是计划执行子代理 (Atlas)。你的任务：
1. 深入理解需求和目标
2. 制定详细的执行计划
3. 分解任务步骤
4. 评估风险和依赖
5. 先规划后执行，不要急于动手

确保计划完整、可执行后再开始。`,
    }));
  }

  /**
   * 注册子代理
   */
  register(subagent) {
    this.subagents.set(subagent.name, subagent);
    // review: removed // review: removed console.log(`[SubagentManager] Registered: ${subagent.name}`);
  }

  /**
   * 获取子代理
   */
  get(name) {
    return this.subagents.get(name);
  }

  /**
   * 获取所有子代理
   */
  getAll() {
    return Array.from(this.subagents.values());
  }

  /**
   * 获取子代理名称列表
   */
  getNames() {
    return Array.from(this.subagents.keys());
  }

  /**
   * 检查子代理是否存在
   */
  has(name) {
    return this.subagents.has(name);
  }

  /**
   * 创建子代理会话
   */
  createSession(subagentName, parentSession) {
    const subagent = this.get(subagentName);
    if (!subagent) {
      throw new Error(`Subagent not found: ${subagentName}`);
    }

    const sessionId = `subagent_${randomUUID()}`;
    const session = {
      id: sessionId,
      subagent,
      parentSessionId: parentSession?.id,
      created: Date.now(),
      turns: 0,
      messages: [],
      status: 'running',
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * 执行子代理任务
   */
  async execute(subagentName, task, parentSession) {
    const subagent = this.get(subagentName);
    if (!subagent) {
      throw new Error(`Subagent not found: ${subagentName}`);
    }

    // 创建会话
    const session = this.createSession(subagentName, parentSession);

    try {
      // 根据隔离级别执行
      switch (subagent.isolation) {
        case IsolationLevel.WORKTREE:
          return await this._executeWorktree(session, task);
        case IsolationLevel.BACKGROUND:
          return await this._executeBackground(session, task);
        default:
          return await this._executeFork(session, task);
      }
    } finally {
      session.status = 'completed';
      session.completed = Date.now();
    }
  }

  /**
   * Fork 上下文执行
   */
  async _executeFork(session, task) {
    // 继承父级上下文，但独立处理
    const result = {
      success: true,
      sessionId: session.id,
      subagent: session.subagent.name,
      task,
      output: `[Subagent:${session.subagent.name}] 执行任务: ${task}`,
    };
    return result;
  }

  /**
   * Worktree 隔离执行
   */
  async _executeWorktree(session, task) {
    // 创建独立的 git worktree
    const worktreeName = `subagent-${session.id.slice(0, 8)}`;
    const result = {
      success: true,
      sessionId: session.id,
      subagent: session.subagent.name,
      isolation: 'worktree',
      worktree: worktreeName,
      task,
      output: `[Subagent:${session.subagent.name}] Worktree 隔离执行`,
    };
    return result;
  }

  /**
   * 后台执行
   */
  async _executeBackground(session, task) {
    // 后台执行，不阻塞主流程
    setTimeout(() => {
      // review: removed // review: removed console.log(`[Subagent:${session.subagent.name}] Background task: ${task}`);
    }, 0);

    return {
      success: true,
      sessionId: session.id,
      subagent: session.subagent.name,
      isolation: 'background',
      task,
      output: `[Subagent:${session.subagent.name}] 已在后台启动`,
    };
  }

  /**
   * 获取活跃会话
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values())
      .filter(s => s.status === 'running');
  }

  /**
   * 结束会话
   */
  endSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.completed = Date.now();
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const sessions = Array.from(this.activeSessions.values());
    return {
      totalSubagents: this.subagents.size,
      activeSessions: sessions.filter(s => s.status === 'running').length,
      completedSessions: sessions.filter(s => s.status === 'completed').length,
      subagentNames: this.getNames(),
    };
  }
}

/**
 * 任务模式管理器 (借鉴 oh-my-claudecode Atlas 设计)
 * 负责任务全生命周期管理
 */
export class TaskModeManager {
  constructor(subagentManager) {
    this.subagentManager = subagentManager;
    this.activeTasks = new Map();
    this.taskHistory = [];
  }

  /**
   * 使用指定任务模式执行任务
   * @param {string} task - 任务描述
   * @param {TaskMode} mode - 任务模式
   * @param {object} parentSession - 父会话
   */
  async executeWithMode(task, mode, parentSession = null) {
    const config = TaskModeConfig[mode];
    if (!config) {
      throw new Error(`Unknown task mode: ${mode}`);
    }

    const taskId = `task_${randomUUID()}`;
    const taskRecord = {
      id: taskId,
      task,
      mode,
      modeName: config.name,
      status: 'running',
      startTime: Date.now(),
      iterations: 0,
      results: [],
    };

    this.activeTasks.set(taskId, taskRecord);

    try {
      const result = await this._executeWithMode(task, mode, config, parentSession);
      taskRecord.status = 'completed';
      taskRecord.endTime = Date.now();
      taskRecord.finalResult = result;
      return result;
    } catch (error) {
      taskRecord.status = 'failed';
      taskRecord.error = error.message;
      throw error;
    } finally {
      this.taskHistory.push(taskRecord);
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 根据任务模式执行
   */
  async _executeWithMode(task, mode, config, parentSession) {
    const maxIterations = config.maxIterations;
    let lastResult = null;

    for (let i = 0; i < maxIterations; i++) {
      const iteration = i + 1;
      // review: removed // review: removed console.log(`[TaskModeManager] ${config.name} 模式 - 迭代 ${iteration}/${maxIterations}`);

      // 选择子代理
      const subagentName = this._selectSubagentForIteration(mode, iteration, config);

      // 执行子代理
      const result = await this.subagentManager.execute(subagentName, task, parentSession);
      lastResult = result;

      // 检查是否满足完成条件
      if (await this._checkCompletion(result, mode)) {
        // review: removed // review: removed console.log(`[TaskModeManager] ${config.name} 模式 - 任务完成于迭代 ${iteration}`);
        break;
      }
    }

    return lastResult;
  }

  /**
   * 为迭代选择子代理
   */
  _selectSubagentForIteration(mode, iteration, config) {
    const subagents = config.defaultSubagents;
    
    // Sisyphus: 循环使用不同子代理
    if (mode === TaskMode.ITERATION) {
      return subagents[iteration % subagents.length];
    }
    // Hephaestus: 质量优先，第一次就用 code-review
    if (mode === TaskMode.QUALITY && iteration === 1) {
      return 'code-review';
    }
    // Prometheus: 探索优先
    if (mode === TaskMode.EXPLORATION) {
      return iteration === 1 ? 'Explore' : subagents[iteration % subagents.length];
    }
    // Atlas: 计划优先
    if (mode === TaskMode.PLANNING) {
      return iteration === 1 ? 'Plan' : subagents[iteration % subagents.length];
    }

    return subagents[0];
  }

  /**
   * 检查是否满足完成条件
   */
  async _checkCompletion(result, mode) {
    // 根据模式定义完成条件
    switch (mode) {
      case TaskMode.ITERATION:
        // Sisyphus: 需要明确成功标志
        return result?.success === true;
      case TaskMode.QUALITY:
        // Hephaestus: 评分达到 4/5
        return result?.score >= 4;
      case TaskMode.EXPLORATION:
        // Prometheus: 找到解决方案
        return result?.solutionFound === true;
      case TaskMode.PLANNING:
        // Atlas: 计划被批准
        return result?.approved === true;
      default:
        return false;
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId) {
    return this.activeTasks.get(taskId);
  }

  /**
   * 获取任务历史
   */
  getHistory(limit = 10) {
    return this.taskHistory.slice(-limit);
  }
}

export default { 
  Subagent, 
  SubagentManager, 
  SubagentType, 
  IsolationLevel,
  TaskMode,
  TaskModeConfig,
  suggestTaskMode,
  TaskModeManager,
};