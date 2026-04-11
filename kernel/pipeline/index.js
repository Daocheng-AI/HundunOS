/**
 * kernel/pipeline/index.js
 * HundunOS 声明式工作流 Pipeline
 *
 * 借鉴 OMX $deep-interview → $ralplan → $ralph 流水线模式
 * 支持顺序执行、条件分支、错误处理、重试策略
 *
 * 使用示例：
 *   await kernel.pipeline([
 *     '$deep-interview',          // 意图澄清
 *     '$ralplan',                 // 规划共识
 *     { type: 'exec', team: 3 }, // 3个Worker并行执行
 *     '$verify',                  // 验证
 *     '$fix',                     // 自动修复（验证失败时触发）
 *   ]);
 */

import { randomUUID } from 'crypto';

/**
 * Pipeline 阶段类型
 */
export const StageType = {
  INTERVIEW:   'interview',   // $deep-interview: 意图澄清
  PLAN:        'plan',        // $ralplan: 规划共识
  EXEC:        'exec',        // $exec: 执行（支持并行团队）
  VERIFY:      'verify',      // $verify: 验证
  FIX:         'fix',         // $fix: 修复
  CUSTOM:      'custom',      // 自定义阶段
};

/**
 * Pipeline 执行结果
 */
export class PipelineResult {
  constructor(pipelineId, stages) {
    this.pipelineId = pipelineId;
    this.stages = stages; // StageResult[]
    this.startedAt = null;
    this.completedAt = null;
    this.success = false;
  }
}

/**
 * 单阶段执行结果
 */
export class StageResult {
  constructor(stageName, stageType) {
    this.id = randomUUID();
    this.name = stageName;
    this.type = stageType;
    this.startedAt = null;
    this.completedAt = null;
    this.success = false;
    this.output = null;
    this.error = null;
    this.warnings = [];
    this.metadata = {};
  }
}

/**
 * Pipeline Orchestrator — 声明式工作流执行引擎
 */
export class PipelineOrchestrator {
  constructor(kernel, config = {}) {
    this.kernel = kernel;
    this.config = {
      stopOnError: config.stopOnError ?? true,    // 遇错停止
      maxRetries: config.maxRetries ?? 2,          // 最多重试次数
      retryDelay: config.retryDelay ?? 2000,      // 重试间隔 ms
      verbose: config.verbose ?? false,            // 详细日志
      ...config,
    };
    this._activeStage = null;
    this._abortController = null;
  }

  /**
   * 执行声明式流水线
   *
   * @param {Array<string|Object>} stages - 阶段定义
   *   字符串：'$deep-interview' | '$ralplan' | '$verify' | '$fix'
   *   对象：  { type: 'exec', team: 3, task: '...', isolation: 'worktree' }
   * @param {Object} context - 跨阶段共享上下文
   * @returns {Promise<PipelineResult>}
   */
  async run(stages, context = {}) {
    const pipelineId = randomUUID();
    const result = new PipelineResult(pipelineId, []);
    result.startedAt = new Date().toISOString();

    // 广播 pipeline:start 事件
    this._emit('pipeline:start', { pipelineId, stageCount: stages.length, context });

    // 标准化阶段定义
    const normalized = stages.map(s => this._normalizeStage(s));

    for (let i = 0; i < normalized.length; i++) {
      const stage = normalized[i];

      // 尝试执行（含重试）
      const stageResult = await this._runStage(stage, context, i);
      result.stages.push(stageResult);

      if (!stageResult.success) {
        // 查找是否有 $fix 后续阶段
        const fixIdx = normalized.findIndex(
          (s, j) => j > i && (s.type === StageType.FIX || s.name === '$fix')
        );

        if (fixIdx !== -1) {
          // 跳到 $fix 阶段
          if (this.config.verbose) {
            // review: removed // review: removed console.log(`[Pipeline:${pipelineId}] Stage "${stage.name}" failed, jumping to $fix`);
          }
          const fixStage = normalized[fixIdx];
          const fixResult = await this._runStage(fixStage, context, fixIdx);
          result.stages.push(fixResult);
          if (!fixResult.success && this.config.stopOnError) break;
        } else if (this.config.stopOnError) {
          if (this.config.verbose) {
            console.warn(`[Pipeline:${pipelineId}] Stage "${stage.name}" failed, stopping`);
          }
          break;
        }
      }

      // 将阶段输出注入上下文，供后续阶段使用
      if (stageResult.output) {
        context[`_${stage.type}Output`] = stageResult.output;
      }
    }

    result.completedAt = new Date().toISOString();
    result.success = result.stages.every(s => s.success);

    this._emit('pipeline:complete', { pipelineId, result });
    return result;
  }

  /**
   * 规范化阶段定义
   */
  _normalizeStage(raw) {
    if (typeof raw === 'string') {
      const name = raw.trim();
      switch (name) {
        case '$deep-interview': return { name, type: StageType.INTERVIEW, description: '意图澄清' };
        case '$ralplan':         return { name, type: StageType.PLAN,       description: '规划共识' };
        case '$verify':          return { name, type: StageType.VERIFY,    description: '结果验证' };
        case '$fix':             return { name, type: StageType.FIX,      description: '自动修复' };
        default:
          // 可能是 $skill-name，映射为 CUSTOM
          return { name, type: StageType.CUSTOM, description: name };
      }
    }
    // 对象形式
    if (raw.type === 'exec') {
      return {
        name: raw.name || `$exec team:${raw.team || 1}`,
        type: StageType.EXEC,
        team: raw.team || 1,
        task: raw.task || (context => context.currentTask || 'Execute pipeline task'),
        isolation: raw.isolation || 'worktree',
        cwd: raw.cwd,
      };
    }
    return { name: raw.name || 'custom', type: StageType.CUSTOM, ...raw };
  }

  /**
   * 执行单个阶段（含重试）
   */
  async _runStage(stage, context, index) {
    const result = new StageResult(stage.name, stage.type);
    result.startedAt = new Date().toISOString();
    this._activeStage = stage;

    this._emit('stage:start', { pipelineId: this._randomId, stage, index });

    if (this.config.verbose) {
      // review: removed // review: removed console.log(`[Pipeline] ▶ Stage ${index + 1}: ${stage.name} (${stage.description || stage.type})`);
    }

    let attempt = 0;
    const maxAttempts = stage.retries ?? this.config.maxRetries + 1;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const output = await this._executeStage(stage, context);
        result.output = output;
        result.success = true;
        result.completedAt = new Date().toISOString();

        if (this.config.verbose) {
          // review: removed // review: removed console.log(`[Pipeline]   ✓ ${stage.name} (attempt ${attempt})`);
        }

        this._emit('stage:complete', { stage, result, attempt });
        return result;

      } catch (e) {
        result.error = e.message;
        result.warnings.push(`Attempt ${attempt} failed: ${e.message}`);

        if (this.config.verbose) {
          console.warn(`[Pipeline]   ✗ attempt ${attempt}: ${e.message}`);
        }

        if (attempt < maxAttempts) {
          await this._sleep(this.config.retryDelay);
        }
      }
    }

    // 所有重试均失败
    result.completedAt = new Date().toISOString();
    result.metadata.retries = attempt;
    this._emit('stage:error', { stage, result });

    return result;
  }

  /**
   * 阶段类型 → 具体执行逻辑
   */
  async _executeStage(stage, context) {
    switch (stage.type) {
      case StageType.INTERVIEW:
        return this._executeInterview(stage, context);

      case StageType.PLAN:
        return this._executePlan(stage, context);

      case StageType.EXEC:
        return this._executeExec(stage, context);

      case StageType.VERIFY:
        return this._executeVerify(stage, context);

      case StageType.FIX:
        return this._executeFix(stage, context);

      default:
        return this._executeCustom(stage, context);
    }
  }

  /**
   * $deep-interview: 意图澄清
   * 通过 IntentEngine + ModelRouter 与用户多轮对话，明确真实需求
   */
  async _executeInterview(stage, context) {
    const modelRouter = this.kernel?.modelRouter;
    const intentEngine = this.kernel?.intentEngine;

    const initialQuery = context.originalQuery || context.currentTask || '';

    const systemPrompt =
      'You are a requirements clarification specialist. Ask targeted questions to uncover the ' +
      'real user intent behind ambiguous requests. Focus on: scope, constraints, priorities, ' +
      'success criteria, edge cases, and stakeholders. Respond in Chinese.';

    const userMessages = [
      { role: 'user', content: `原始需求：${initialQuery}\n\n请通过提问明确需求：目标是？约束条件？优先级？` },
    ];

    if (modelRouter) {
      const response = await modelRouter.route({
        messages: userMessages,
        systemPrompt,
        strategy: 'QUALITY',
      });
      const answer = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';

      // 将澄清结果注入上下文
      context.clarifiedIntent = answer;
      return {
        type: 'interview',
        questions: answer,
        summary: this._summarizeInterview(answer),
      };
    }

    // 无 ModelRouter，回退
    return { type: 'interview', questions: initialQuery, summary: initialQuery };
  }

  /**
   * $ralplan: 规划共识
   * 基于澄清后的意图，生成结构化任务分解计划
   */
  async _executePlan(stage, context) {
    const modelRouter = this.kernel?.modelRouter;

    const clarified = context.clarifiedIntent || context.currentTask || '';
    const relevantPrompts = await this._getRelevantPrompts(context);

    const systemPrompt =
      'You are a technical project planner. Based on the clarified requirements, generate a ' +
      'detailed task breakdown plan in structured format.\n\n' +
      relevantPrompts + '\n\n' +
      'Respond in JSON format: {"tasks": [{"id","description","assignedTo","priority","estimatedComplexity"}], "strategy":"<execution approach>"}';

    if (modelRouter) {
      const response = await modelRouter.route({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `需求：${clarified}\n\n生成任务分解计划（JSON）：` },
        ],
        strategy: 'QUALITY',
      });

      const text = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const plan = jsonMatch ? JSON.parse(jsonMatch[0]) : { tasks: [], strategy: clarified };

      context.currentPlan = plan;
      context.currentTask = clarified;
      return plan;
    }

    return { tasks: [], strategy: clarified };
  }

  /**
   * $exec: 并行团队执行
   */
  async _executeExec(stage, context) {
    const teamManager = this.kernel?.teamManager;
    const subagentMgr = this.kernel?.subagentManager;

    const teamSize = stage.team || 1;
    const task = typeof stage.task === 'function' ? stage.task(context) : stage.task || context.currentTask || 'Pipeline task';

    if (!teamManager) {
      // 无团队管理器，降级为 SubagentManager 单代理执行
      if (subagentMgr?.has('Plan')) {
        const result = await subagentMgr.execute('Plan', task, null);
        return { type: 'exec', teamSize: 1, isolation: 'simulate', output: result?.output };
      }
      return { type: 'exec', teamSize: 1, output: task };
    }

    // 创建并行团队
    const team = teamManager.createTeam({
      name: `pipeline-${randomUUID().slice(0, 8)}`,
      maxParallel: teamSize,
      isolation: stage.isolation || 'worktree',
    });

    // 注册 pipeline 成员（复用已有 prompts）
    this._registerPipelineMembers(team);

    // 注入 kernel（Phase A 完成后需要）
    team._kernel = this.kernel;

    // 执行任务
    const teamResult = await team.executeTask(task, {
      cwd: stage.cwd || this.kernel?.config?.workspace || process.cwd(),
      pipeline: true,
    });

    context.teamResult = teamResult;
    return {
      type: 'exec',
      teamSize,
      isolation: team.isolation,
      success: teamResult.success,
      summary: teamResult.summary,
      duration: teamResult.duration,
    };
  }

  /**
   * $verify: 验证执行结果
   */
  async _executeVerify(stage, context) {
    const modelRouter = this.kernel?.modelRouter;
    const teamResult = context.teamResult;
    const clarified = context.clarifiedIntent || '';

    const verificationCriteria = `
    检查项：
    1. 功能正确性 — 代码是否实现预期功能
    2. 代码质量 — 是否符合项目规范
    3. 安全性 — 是否有潜在安全风险
    4. 可测试性 — 是否有对应的测试覆盖
    5. 文档完整 — API/README 是否更新
    `;

    if (modelRouter) {
      const systemPrompt =
        'You are a quality verification engineer. Evaluate whether the execution results meet the requirements.\n' +
        verificationCriteria + '\n' +
        'Respond ONLY with valid JSON: {"passed":true|false,"issues":["issue1",...],"score":0-100}';

      const execSummary = teamResult?.summary?.message || JSON.stringify(teamResult || {});

      const response = await modelRouter.route({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `需求：${clarified}\n执行结果：${execSummary}` },
        ],
        strategy: 'COST_OPTIMIZED',
      });

      const text = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const verification = jsonMatch ? JSON.parse(jsonMatch[0]) : { passed: false, issues: [], score: 0 };

      context.verification = verification;
      return verification;
    }

    return { passed: teamResult?.success ?? false, issues: [], score: 80 };
  }

  /**
   * $fix: 自动修复
   */
  async _executeFix(stage, context) {
    const verification = context.verification || {};
    const issues = verification.issues || [];
    const teamResult = context.teamResult;

    if (issues.length === 0) {
      return { type: 'fix', fixed: 0, message: 'No issues to fix' };
    }

    const subagentMgr = this.kernel?.subagentManager;
    const modelRouter = this.kernel?.modelRouter;

    const fixPrompt = `The following issues were detected and need to be fixed:\n${
      issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')
    }\n\nTeam execution summary: ${teamResult?.summary?.message || ''}`;

    if (subagentMgr?.has('Refactor')) {
      const result = await subagentMgr.execute('Refactor', fixPrompt, null);
      context.fixOutput = result?.output;
      return { type: 'fix', fixed: issues.length, output: result?.output };
    }

    if (modelRouter) {
      const response = await modelRouter.route({
        messages: [
          { role: 'system', content: 'You are an expert code fixer. Fix the issues described and explain what you changed.' },
          { role: 'user', content: fixPrompt },
        ],
        strategy: 'QUALITY',
      });
      const answer = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';
      context.fixOutput = answer;
      return { type: 'fix', fixed: issues.length, output: answer };
    }

    return { type: 'fix', fixed: 0, issues };
  }

  /**
   * 自定义阶段：执行 skill 或直接调用子代理
   */
  async _executeCustom(stage, context) {
    const skillLoader = this.kernel?.skillLoader;
    const skillName = stage.name?.replace(/^\$/, '') || stage.skill;

    if (skillLoader && skillName) {
      // 加载并执行 skill
      const instruction = await skillLoader.loadInstruction(skillName);
      if (instruction) {
        // Skill 有指令，但实际执行需要 AI 引擎，这里用 ModelRouter 执行
        const modelRouter = this.kernel?.modelRouter;
        if (modelRouter) {
          const result = await modelRouter.route({
            messages: [
              { role: 'system', content: instruction },
              { role: 'user', content: `Context: ${JSON.stringify(context)}` },
            ],
            strategy: 'QUALITY',
          });
          return { type: 'skill', skill: skillName, output: result?.content?.[0]?.text };
        }
      }
    }

    return { type: 'custom', stage: stage.name, output: null };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 辅助方法
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * 注册 Pipeline 默认成员（Leader + Worker 角色）
   */
  _registerPipelineMembers(team) {
    const promptDir = this.kernel?.config?.promptDir || './kernel/prompts';

    if (!team.getMember('leader')) {
      team.addMember({ name: 'leader', role: 'leader', capabilities: ['plan', 'coordinate'] });
    }
    if (!team.getMember('executor')) {
      team.addMember({ name: 'executor', role: 'executor', capabilities: ['implement'], subagent: 'Plan' });
    }
    if (!team.getMember('reviewer')) {
      team.addMember({ name: 'reviewer', role: 'reviewer', capabilities: ['verify'], subagent: 'CodeReviewer' });
    }
    if (!team.getMember('researcher')) {
      team.addMember({ name: 'researcher', role: 'researcher', capabilities: ['research'], subagent: 'Researcher' });
    }
  }

  /**
   * 获取与上下文相关的 prompts（用于 Plan 阶段）
   */
  async _getRelevantPrompts(context) {
    const promptDir = this.kernel?.config?.promptDir;
    if (!promptDir) return '';

    const promptFiles = [
      'prompts/architect.md',
      'prompts/test-engineer.md',
      'prompts/code-reviewer.md',
    ];

    // 动态加载（避免每次都读文件）
    if (!this._promptCache) this._promptCache = new Map();

    const loaded = [];
    for (const file of promptFiles) {
      if (this._promptCache.has(file)) {
        loaded.push(this._promptCache.get(file));
      }
    }

    return loaded.join('\n---\n');
  }

  /**
   * 简化 interview 输出为摘要
   */
  _summarizeInterview(text) {
    if (!text) return '';
    return text.split('\n').slice(0, 3).join(' ').slice(0, 200);
  }

  /**
   * 向内核广播事件（Pipeline 运行状态）
   */
  _emit(event, data) {
    if (this.kernel?.emit) {
      this.kernel.emit(event, { source: 'pipeline', ...data });
    }
    if (this.config.verbose) {
      // review: removed // review: removed console.log(`[Pipeline Event] ${event}`, JSON.stringify(data).slice(0, 120));
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get _randomId() {
    return randomUUID().slice(0, 8);
  }
}

/**
 * 便捷入口：kernel.pipeline(stages, context)
 */
export function createPipeline(kernel, config) {
  return new PipelineOrchestrator(kernel, config);
}
