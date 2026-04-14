// hundunos/kernel/task-scientist.js — HundunOS Task Scientist v1.0 (Phase 5)
// BFTS (Best-First Tree Search) 智能任务编排 — Rust engine + JS 降级层
//
// Phase 4: kernel.rustScientist (adapters/rust-modules/task-scientist.js)
// Phase 5: 本模块 — BFTS 编排、意图检测、JS Fallback、kernel 集成
//
// Rust engine capabilities:
//   TaskJournal: 节点树、stage 演进（Analysis→Planning→Execution→Verification→Refinement）
//   BFTS:       多路径并行探索、指标驱动最优解选择
//
// JS fallback: 当 Rust 不可用时，使用 JS 实现简化的 BFTS（单路径、基础评估）

import { EventEmitter } from 'events';

// ================================================================
// JS Fallback — 简化的 BFTS（Rust 不可用时使用）
// ================================================================

export class JSFallbackOrchestrator extends EventEmitter {
  /**
   * @param {Object} config
   * @param {Object} [memoryTool] - TaskScientistMemoryTool 实例（可选）
   */
  constructor(config = {}, memoryTool = null) {
    super();
    this.tasks = new Map();
    this.memoryTool = memoryTool;
    this.config = {
      maxSteps:      config.maxSteps      || 21,
      numWorkers:    config.numWorkers    || 3,
      numSeeds:      config.numSeeds      || 3,
      maxRetries:    config.maxRetries    || 3,
    };
  }

  /**
   * 注入/替换 memoryTool（core.js 初始化后调用）
   * @param {Object} memoryTool
   */
  setMemoryTool(memoryTool) {
    this.memoryTool = memoryTool;
  }

  _genId() {
    return `js_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 创建任务（JS fallback 简化版：单路径执行）
   * FIX-R0: 向种子节点注入 memoryTool 历史上下文
   * @param {string} task
   * @param {Object} context - { taskId?, initialCode?, memoryContext? }
   * @returns {Promise<{taskId: string, nodeId: string, stage: string, journal: Object}>}
   */
  async createTask(task, context = {}) {
    // FIX-R0: 从 memoryTool 异步获取历史上下文
    let memoryContext = context.memoryContext || null;
    if (!memoryContext && this.memoryTool) {
      try {
        memoryContext = await this.memoryTool.getContextForTask(task);
      } catch (_) { /* memoryTool 不可用时静默跳过 */ }
    }
    return this._createTaskSync(task, { ...context, memoryContext });
  }

  /**
   * 同步创建任务（内部方法，测试直接使用）
   * @param {string} task
   * @param {Object} context
   * @returns {{taskId: string, nodeId: string, stage: string, journal: Object}}
   */
  _createTaskSync(task, context = {}) {
    const taskId = context.taskId || this._genId();
    const nodeId = `node_${this._genId()}`;
    const memoryContext = context.memoryContext || null;

    const seedNode = {
      id:          nodeId,
      stage:       'analysis',
      step:        0,
      plan:        task,
      code:        context.initialCode || '',
      parent:      null,
      children:    [],
      ctime:       Date.now(),
      exec_result: null,
      analysis:    null,
      is_buggy:    false,
      metric:      null,
      stage_name:  'draft',
      is_seed_node: true,
      // FIX-R0: 记忆上下文注入（相似任务路径建议）
      memory: memoryContext ? {
        available:      memoryContext.available ?? true,
        recent:         memoryContext.recent || [],
        semantic:       memoryContext.semantic || [],
        episodic:       memoryContext.episodic || [],
        injectedAt:     memoryContext.injectedAt || Date.now(),
        suggestions:    memoryContext.semanticSearch || [],
      } : null,
    };

    const journal = {
      task_id:           taskId,
      root_nodes:        [nodeId],
      nodes: {
        [nodeId]: seedNode,
      },
      best_node:          nodeId,
      stage_transitions:  [],
      completed_stages:   [],
      current_stage:      'analysis',
      created_at:         Date.now(),
      updated_at:         Date.now(),
      memory_injected:    !!memoryContext,
    };
    this.tasks.set(taskId, journal);
    return { taskId, nodeId, stage: 'analysis', journal };
  }

  /**
   * JS BFTS：顺序执行节点（简化为单路径搜索）
   * FIX-R0: 节点执行前调用 memoryTool.enhanceNodePrompt() 注入记忆增强提示
   * @param {string} taskId
   * @returns {Promise<{journal, bestNode, iterations}>}
   */
  async runBFTS(taskId) {
    const journal = this.tasks.get(taskId);
    if (!journal) throw new Error(`Task not found: ${taskId}`);

    const stages = ['analysis', 'planning', 'execution', 'verification', 'refinement'];
    let iterations = 0;
    let bestNodeId = journal.best_node;

    for (let step = 0; step < this.config.maxSteps && iterations < this.config.maxSteps; step++) {
      iterations++;

      // 获取当前最优节点
      const leafNodes = Object.values(journal.nodes)
        .filter(n => n.children.length === 0 && !n.is_buggy);

      if (leafNodes.length === 0) break;

      // 选最优
      const scored = leafNodes
        .filter(n => n.exec_result)
        .map(n => ({
          id:    n.id,
          score: n.metric?.value ?? (n.is_buggy ? -1 : 1),
        }))
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) bestNodeId = scored[0].id;
      journal.best_node = bestNodeId;

      // 找当前节点
      const currentNode = journal.nodes[bestNodeId];
      const currentStageIdx = stages.indexOf(journal.current_stage);

      // 阶段演进
      if (currentNode.exec_result && currentStageIdx < stages.length - 1) {
        const nextStage = stages[currentStageIdx + 1];
        journal.stage_transitions.push({
          from_stage: journal.current_stage,
          to_stage:   nextStage,
          reason:     `Stage complete after ${iterations} iterations`,
          timestamp:  Date.now(),
        });
        journal.completed_stages.push(journal.current_stage);
        journal.current_stage = nextStage;
      }

      // FIX-R0: 生成子节点前，用 memoryTool 增强执行计划
      let enhancedPlan = `${currentNode.plan} → step ${step + 1}`;
      let memoryHints = null;
      if (this.memoryTool && currentNode.plan) {
        try {
          // 生成增强提示（含历史路径建议）
          const enhancedPrompt = await this.memoryTool.enhanceNodePrompt(currentNode);
          if (enhancedPrompt) {
            memoryHints = { enhancedPrompt, enhancedAt: Date.now() };
          }
          // 查找相似任务路径作为优先级参考
          const similarPaths = await this.memoryTool.findSimilarTaskPaths(
            currentNode.plan, { maxResults: 2, successfulOnly: true }
          );
          if (similarPaths.length > 0) {
            memoryHints = memoryHints || {};
            memoryHints.similarPaths = similarPaths;
            memoryHints.priorityBoost = 0.1; // 相似成功路径 +0.1 分
          }
        } catch (_) { /* memoryTool 调用失败时静默跳过 */ }
      }

      // 模拟执行：生成子节点并评估
      const childId = `node_${this._genId()}`;
      const isSuccessful = Math.random() > 0.2; // 模拟 80% 成功率
      let score = isSuccessful
        ? 0.6 + Math.random() * 0.4  // 0.6-1.0
        : 0.1 + Math.random() * 0.3; // 0.1-0.4

      // FIX-R0: 相似成功路径提供分数加成
      if (memoryHints?.priorityBoost) {
        score = Math.min(1, score + memoryHints.priorityBoost);
      }

      const childNode = {
        id:           childId,
        stage:        journal.current_stage,
        step:         step + 1,
        plan:         enhancedPlan,
        code:         currentNode.code,
        parent:       bestNodeId,
        children:     [],
        ctime:        Date.now(),
        exec_result:  {
          stdout:     `JS BFTS step ${step + 1}: ${journal.current_stage}`,
          stderr:     '',
          exit_code:  isSuccessful ? 0 : 1,
          exec_time_ms: 5 + Math.floor(Math.random() * 20),
          exc_type:   isSuccessful ? null : 'SimulationError',
          exc_info:   null,
          exc_stack:  null,
          truncated:  false,
          metric:     isSuccessful ? {
            name:           'js_bfts_score',
            value:          score,
            lower_is_better: false,
            description:   'JS fallback simulation score',
          } : null,
        },
        analysis:     isSuccessful ? 'OK' : 'Simulated failure',
        is_buggy:     !isSuccessful,
        metric:       isSuccessful ? {
          name:           'js_bfts_score',
          value:          score,
          lower_is_better: false,
          description:   'JS fallback simulation score',
        } : null,
        stage_name:   currentNode.is_seed_node ? 'seed' : 'child',
        is_seed_node: false,
        // FIX-R0: 子节点携带记忆增强元数据（用于后续阶段参考）
        memory: memoryHints ? {
          enhancedPrompt: memoryHints.enhancedPrompt || null,
          similarPaths:    memoryHints.similarPaths || [],
          priorityBoost:   memoryHints.priorityBoost || 0,
          enhancedAt:      memoryHints.enhancedAt || Date.now(),
        } : null,
      };

      currentNode.children.push(childId);
      journal.nodes[childId] = childNode;
      bestNodeId = childId;
      journal.best_node = childId;
      journal.updated_at = Date.now();

      // 触发事件（供 UI 实时更新）
      this.emit('node_executed', { taskId, nodeId: childId, metric: childNode.metric });
    }

    return {
      journal,
      bestNode: journal.nodes[journal.best_node],
      iterations,
    };
  }

  /**
   * 获取任务 Journal
   * @param {string} taskId
   */
  getJournal(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 获取任务统计
   * @param {string} taskId
   */
  getStats(taskId) {
    const j = this.tasks.get(taskId);
    if (!j) return null;
    const leafNodes = Object.values(j.nodes).filter(n => n.children.length === 0);
    return {
      task_id:         j.task_id,
      total_nodes:     Object.keys(j.nodes).length,
      root_nodes:      j.root_nodes.length,
      leaf_nodes:      leafNodes.length,
      completed_stages: j.completed_stages.length,
      best_node:       j.best_node,
      created_at:      j.created_at,
      updated_at:      j.updated_at,
    };
  }

  /**
   * 全局统计
   */
  getGlobalStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      total_tasks:     tasks.length,
      total_nodes:     tasks.reduce((acc, j) => acc + Object.keys(j.nodes).length, 0),
      active_tasks:    tasks.filter(j => j.current_stage !== 'refinement').length,
    };
  }

  listTasks() {
    return Array.from(this.tasks.keys());
  }

  deleteTask(taskId) {
    return this.tasks.delete(taskId);
  }
}

// ================================================================
// Main TaskScientist — Phase 5 集成层
// ================================================================

export class TaskScientist extends EventEmitter {
  /**
   * @param {CoreKernel} kernel - HundunOS 内核引用
   */
  constructor(kernel) {
    super();
    this.kernel = kernel;

    // Phase 4 rustScientist（来自 adapters/rust-modules/index.js 初始化）
    this.rustAdapter = kernel?.rustScientist || null;
    this.rustAvailable = false;

    // Phase 7: MemoryGraph 集成（延迟注入，由 core.js 传入）
    // memoryTool 通过 setMemoryTool() 注入到 JS fallback 编排器
    this.memoryTool = null;

    // JS 降级编排器（Rust 不可用时使用）
    // FIX-R0: 构造函数不再传入 memoryTool，由 setMemoryTool() 统一注入
    this.jsFallback = new JSFallbackOrchestrator({
      maxSteps:   kernel?.config?.system?.taskScientist?.maxSteps   || 21,
      numWorkers: kernel?.config?.system?.taskScientist?.numWorkers || 3,
      numSeeds:   kernel?.config?.system?.taskScientist?.numSeeds   || 3,
    });

    // 配置
    this.config = {
      enabled:        kernel?.config?.system?.taskScientist?.enabled        ?? true,
      useRust:        kernel?.config?.system?.taskScientist?.useRust          ?? true,
      autoDetect:     kernel?.config?.system?.taskScientist?.autoDetect       ?? true,
      maxSteps:       kernel?.config?.system?.taskScientist?.maxSteps         || 21,
      complexityThreshold: kernel?.config?.system?.taskScientist?.complexityThreshold || 0.6,
    };

    // 运行时状态
    this._activeTasks = new Map(); // taskId → { taskId, created, status }
    this._history     = [];        // 最近完成的任务记录

    // 绑定 JS fallback 事件（穿透到 kernel）
    this.jsFallback.on('node_executed', (data) => {
      this.emit('node_executed', data);
    });
  }

  /**
   * 异步初始化 — 检测 Rust engine 可用性
   * FIX-R0: 自动从 kernel 注入 memoryTool 到 JS fallback
   */
  async initialize() {
    if (!this.config.enabled) {
      // console.log('[TaskScientist] Disabled by configuration');
      return;
    }

    // FIX-R0: 自动注入 memoryTool（从 kernel.taskScientistMemoryTool）
    if (!this.memoryTool && this.kernel?.taskScientistMemoryTool) {
      this.setMemoryTool(this.kernel.taskScientistMemoryTool);
    }

    // 尝试 Rust engine 健康检查
    if (this.rustAdapter && this.config.useRust) {
      try {
        const stats = await this.rustAdapter.getStats().catch(() => null);
        if (stats !== null) {
          this.rustAvailable = true;
          const rustConfig = await this.rustAdapter.getConfig().catch(() => null);
          // console.log(`[TaskScientist] ✅ Rust BFTS engine available (config: ${JSON.stringify(rustConfig || {}).slice(0, 80)})`);
        } else {
          this._warnRustUnavailable();
        }
      } catch (e) {
        this._warnRustUnavailable(e.message);
      }
    } else {
      // console.log('[TaskScientist] ⚠️  Using JS fallback (no Rust engine)');
    }

    // 注册内核快捷访问器（Phase 5 新增：rustScientist）
    if (this.kernel) {
      this.kernel.taskScientist = this;
    }
  }

  /**
   * FIX-R0: 注入 TaskScientistMemoryTool（传播到 JS fallback 编排器）
   * 由 core.js 在 TaskScientistMemoryTool 初始化后调用
   * @param {Object} memoryTool - TaskScientistMemoryTool 实例
   */
  setMemoryTool(memoryTool) {
    this.memoryTool = memoryTool;
    this.jsFallback.setMemoryTool(memoryTool);
    // console.log('[TaskScientist] memoryTool injected into JS fallback orchestrator');
  }

  _warnRustUnavailable(reason = '') {
    this.rustAvailable = false;
    console.warn(`[TaskScientist] ⚠️  Rust BFTS engine unavailable${reason ? ` (${reason})` : ''} — using JS fallback`);
  }

  // ================================================================
  // Public API — 任务管理
  // ================================================================

  /**
   * 创建 BFTS 任务
   * @param {string} task - 任务描述
   * @param {Object} context - { title?, description?, initialCode?, stages? }
   * @returns {Promise<{taskId: string, stage: string, engine: 'rust'|'js'}>}
   */
  async createTask(task, context = {}) {
    const engine = this.rustAvailable ? 'rust' : 'js';
    let result;

    if (engine === 'rust') {
      const rustResult = await this.rustAdapter.createTask(task, context);
      result = { taskId: rustResult.task_id, stage: rustResult.stage || 'analysis' };
    } else {
      // FIX-R0: jsFallback.createTask() 现在是 async（memoryTool 注入历史上下文）
      result = await this.jsFallback.createTask(task, context);
    }

    this._activeTasks.set(result.taskId, {
      taskId:   result.taskId,
      engine,
      created:  Date.now(),
      status:   'created',
    });

    this.emit('task_created', result);
    return { ...result, engine };
  }

  /**
   * 运行 BFTS 搜索（核心方法）
   * @param {string} taskId
   * @param {Object} options - { maxSteps?, waitMs? }
   * @returns {Promise<{journal, bestNode, iterations, engine}>}
   */
  async runBFTS(taskId, options = {}) {
    const meta = this._activeTasks.get(taskId);
    if (!meta) throw new Error(`Task not found: ${taskId}`);

    const engine = meta.engine;
    let result;

    if (engine === 'rust') {
      result = await this.rustAdapter.runBFTS(taskId);
    } else {
      result = await this.jsFallback.runBFTS(taskId);
    }

    // 记录到历史
    this._recordCompletion(taskId, result);

    this.emit('bfts_complete', { taskId, engine, iterations: result.iterations ?? 1 });
    return { ...result, engine };
  }

  /**
   * 完整任务执行：创建 + BFTS（便捷方法）
   * Phase 7: 注入 MemoryContextTool 相似路径建议
   * @param {string} task - 任务描述
   * @param {Object} context
   * @returns {Promise<{taskId, journal, bestNode, iterations, stats, engine, memoryContext}>}
   */
  async runTask(task, context = {}) {
    // Phase 7: 获取记忆上下文（相似任务路径建议）
    let memoryContext = null;
    if (this.memoryTool) {
      memoryContext = await this.memoryTool.getContextForTask(task).catch(() => null);
    }

    const { taskId, stage, engine } = await this.createTask(task, context);

    // 运行 BFTS
    const bftsResult = await this.runBFTS(taskId);

    // 获取统计
    const stats = await this.getStats(taskId);

    // Phase 7: 记录任务结果到记忆（成功后异步记录）
    if (this.memoryTool && bftsResult.bestNode) {
      this.memoryTool.recordTaskResult(task, {
        success: bftsResult.bestNode.metric?.value > 0.5,
        nodes: Object.keys(bftsResult.journal.nodes),
        steps: bftsResult.iterations,
        engine,
      }).catch(() => {});
    }

    // 获取树可视化（Rust only）
    let visualization = null;
    if (engine === 'rust') {
      visualization = await this.rustAdapter.visualizeTree(taskId).catch(() => null);
    }

    return {
      taskId,
      journal:      bftsResult.journal,
      bestNode:     bftsResult.bestNode,
      iterations:   bftsResult.iterations,
      stage,
      stats,
      visualization,
      engine,
      memoryContext,
    };
  }

  /**
   * 获取任务 Journal
   * @param {string} taskId
   */
  async getJournal(taskId) {
    const meta = this._activeTasks.get(taskId);
    if (meta?.engine === 'rust') {
      return this.rustAdapter.getJournal(taskId);
    }
    return this.jsFallback.getJournal(taskId);
  }

  /**
   * 获取任务统计
   * @param {string} taskId
   */
  async getStats(taskId) {
    const meta = this._activeTasks.get(taskId);
    if (meta?.engine === 'rust') {
      return this.rustAdapter.getStats(taskId);
    }
    return this.jsFallback.getStats(taskId);
  }

  /**
   * 全局统计
   */
  async getGlobalStats() {
    if (this.rustAvailable) {
      return this.rustAdapter.getStats();
    }
    return this.jsFallback.getGlobalStats();
  }

  /**
   * 列出活跃任务
   */
  listTasks() {
    return Array.from(this._activeTasks.entries()).map(([id, m]) => ({
      taskId:   id,
      engine:   m.engine,
      created:  m.created,
      status:   m.status,
    }));
  }

  /**
   * 删除任务
   * @param {string} taskId
   */
  async deleteTask(taskId) {
    this._activeTasks.delete(taskId);
    if (this.rustAvailable) {
      await this.rustAdapter.deleteTask(taskId).catch(() => {});
    } else {
      this.jsFallback.deleteTask(taskId);
    }
    this.emit('task_deleted', { taskId });
  }

  // ================================================================
  // 智能任务检测（Phase 5 核心）
  // ================================================================

  /**
   * 判断任务是否适合 BFTS（复杂度阈值）
   * 用于 kernel 编排决策
   *
   * 适合 BFTS 的任务特征：
   * - 包含多个子目标（代码实现+测试+部署）
   * - 复杂软件工程任务（多文件、跨模块）
   * - 涉及探索/实验的任务
   *
   * 不适合 BFTS：
   * - 简单问答、文件查找
   * - 单步操作
   * @param {string} task - 任务描述
   * @returns {{suitable: boolean, reason: string, confidence: number}}
   */
  analyzeTask(task) {
    const text = (task || '').toLowerCase();

    // 高置信度信号（适合 BFTS）
    const strongSignals = [
      /实现|构建|开发|创建.*系统|重构|优化.*性能/i,
      /多.*模块|微服务|完整.*功能|端到端|全栈/i,
      /写.*测试|单元测试|集成测试|测试用例/i,
      /部署|发布|pipeline|ci\/cd/i,
      /设计.*架构|数据库.*迁移|api.*开发/i,
      /修复.*bug|调试|性能分析/i,
    ];

    // 中等置信度信号
    const mediumSignals = [
      /多个文件|跨文件|批量|循环.*处理/i,
      /数据分析|数据处理|报告生成/i,
      /网页.*爬虫|自动化.*脚本/i,
    ];

    // 低置信度信号（不适合 BFTS）
    const weakSignals = [
      /是什么|如何|帮我|请问/i,
      /查找|搜索|列出|显示/i,
      /翻译|总结|解释/i,
      /^简?单/i,
    ];

    let score = 0;
    const reasons = [];

    for (const re of strongSignals) {
      if (re.test(text)) { score += 0.4; reasons.push(re.toString().slice(0, 20)); }
    }
    for (const re of mediumSignals) {
      if (re.test(text)) { score += 0.2; reasons.push(re.toString().slice(0, 20)); }
    }
    for (const re of weakSignals) {
      if (re.test(text)) { score -= 0.3; }
    }

    const confidence = Math.max(0, Math.min(1, score));

    return {
      suitable:   confidence >= this.config.complexityThreshold,
      confidence,
      threshold:  this.config.complexityThreshold,
      reasons:    reasons.slice(0, 3),
      engine:     this.rustAvailable ? 'rust' : 'js',
      recommendation: confidence >= this.config.complexityThreshold
        ? 'BFTS recommended (complex task)'
        : 'Direct execution recommended (simple task)',
    };
  }

  /**
   * Kernel 编排入口 — 判断是否应使用 BFTS
   * 由 kernel.process() 在路由阶段调用
   * @param {string} task
   * @param {Object} intent
   */
  shouldUseBFTS(task, intent = {}) {
    if (!this.config.enabled) return { use: false, reason: 'TaskScientist disabled' };

    const analysis = this.analyzeTask(task);
    if (!analysis.suitable) {
      return { use: false, confidence: analysis.confidence, reason: analysis.recommendation };
    }

    return {
      use:        true,
      confidence: analysis.confidence,
      engine:     analysis.engine,
      reason:     analysis.recommendation,
      taskId:     null, // 任务 ID 在 runTask 时分配
    };
  }

  // ================================================================
  // 辅助方法
  // ================================================================

  _recordCompletion(taskId, result) {
    const meta = this._activeTasks.get(taskId);
    if (meta) meta.status = 'completed';

    this._history.push({
      taskId,
      engine:     meta?.engine || 'unknown',
      completed:  Date.now(),
      iterations: result.iterations ?? 1,
      bestNode:   result.bestNode?.id || result.best_node || null,
    });

    // 保留最近 50 条历史
    if (this._history.length > 50) this._history.shift();
  }

  /**
   * 获取完整状态（供 kernel getStatus() / REST API 使用）
   */
  getStatus() {
    return {
      enabled:       this.config.enabled,
      rustAvailable: this.rustAvailable,
      engine:         this.rustAvailable ? 'rust' : 'js',
      activeTasks:    this._activeTasks.size,
      historySize:    this._history.length,
      recentHistory:  this._history.slice(-10).map(h => ({
        taskId:     h.taskId,
        engine:     h.engine,
        completed:  new Date(h.completed).toISOString(),
        iterations: h.iterations,
      })),
      memory: this.memoryTool ? this.memoryTool.getStats() : null,
    };
  }

  /**
   * shutdown
   */
  async shutdown() {
    // console.log('[TaskScientist] Shutting down...');
    this.removeAllListeners();
  }
}

export default TaskScientist;
