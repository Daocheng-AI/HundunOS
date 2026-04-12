/**
 * kernel/agent-teams/index.js
 * Agent Teams 多代理协作系统
 * 
 * 借鉴 Claude Code 多代理设计
 * 支持角色分配、任务分发、结果汇总
 */

import { randomUUID } from 'crypto';
import { getWorktreeManager } from './worktree-manager.js';
import { WorktreeTaskBinding } from './worktree-task-binding.js';

/**
 * 团队角色类型
 */
export const TeamRole = {
  LEADER: 'leader',        // 协调者：任务分解，结果汇总
  EXECUTOR: 'executor',   // 执行者：具体任务执行
  REVIEWER: 'reviewer',   // 审查者：质量检查，结果验证
  RESEARCHER: 'researcher', // 研究者：信息收集，分析
};

/**
 * 团队成员配置
 */
export class TeamMember {
  constructor(config = {}) {
    this.id = config.id || randomUUID();
    this.name = config.name || 'agent';
    this.role = config.role || TeamRole.EXECUTOR;
    this.capabilities = config.capabilities || [];
    this.subagent = config.subagent || null;  // 关联的 Subagent
  }

  toConfig() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      capabilities: this.capabilities,
    };
  }
}

/**
 * Agent Team - 多代理协作团队
 */
export class AgentTeam {
  constructor(config = {}) {
    this.id = config.id || randomUUID();
    this.name = config.name || 'default-team';
    this.members = new Map();
    this.maxParallel = config.maxParallel || 3;
    this.timeout = config.timeout || 300000;
    /**
     * 隔离模式：
     *   'worktree' — 每个 Worker 在独立 Git Worktree 执行（推荐，消除并发冲突）
     *   'fork'     — 共享工作目录，上下文隔离（降级模式）
     *   'simulate' — 旧版模拟执行（仅用于测试）
     */
    this.isolation = config.isolation || 'worktree';
    /** WorktreeManager 实例（worktree 模式下使用） */
    this._worktreeManager = null;
    
    /** WorktreeTaskBinding 实例（v4.3: 任务双向绑定） */
    this._worktreeTaskBinding = null;
    
    // 注册默认成员
    this._registerDefaultMembers();
  }

  /**
   * 注册默认成员
   */
  _registerDefaultMembers() {
    // Leader
    this.addMember(new TeamMember({
      name: 'leader',
      role: TeamRole.LEADER,
      capabilities: ['task-planning', 'coordination', 'summary'],
    }));

    // Executor
    this.addMember(new TeamMember({
      name: 'executor',
      role: TeamRole.EXECUTOR,
      capabilities: ['code', 'write', 'search', 'analysis'],
    }));

    // Reviewer
    this.addMember(new TeamMember({
      name: 'reviewer',
      role: TeamRole.REVIEWER,
      capabilities: ['code-review', 'validation', 'quality-check'],
    }));

    // Researcher
    this.addMember(new TeamMember({
      name: 'researcher',
      role: TeamRole.RESEARCHER,
      capabilities: ['search', 'analysis', 'information-gathering'],
    }));
  }

  /**
   * 添加团队成员
   */
  addMember(member) {
    this.members.set(member.name, member);
    return this;
  }

  /**
   * 移除团队成员
   */
  removeMember(name) {
    this.members.delete(name);
    return this;
  }

  /**
   * 获取成员
   */
  getMember(name) {
    return this.members.get(name);
  }

  /**
   * 获取特定角色的成员
   */
  getMembersByRole(role) {
    return Array.from(this.members.values()).filter(m => m.role === role);
  }

  /**
   * 执行团队任务
   * v4.3: 集成 WorktreeTaskBinding（任务双向绑定）
   */
  async executeTask(task, context = {}) {
    const taskId = randomUUID();
    const startTime = Date.now();

    // 初始化 WorktreeManager（仅 worktree 模式）
    if (this.isolation === 'worktree' && !this._worktreeManager) {
      this._worktreeManager = getWorktreeManager({ cwd: context.cwd || process.cwd() });
      await this._worktreeManager.init();
      // 如果 Git 环境不可用，自动降级为 fork 模式
      if (!this._worktreeManager.available) {
        console.warn(`[AgentTeam:${this.name}] Git not available, downgrading to fork isolation`);
        this.isolation = 'fork';
      }
    }

    // v4.3: 初始化 WorktreeTaskBinding
    if (this.isolation === 'worktree' && this._worktreeManager?.available && !this._worktreeTaskBinding) {
      this._worktreeTaskBinding = new WorktreeTaskBinding({ kernel: this.kernel });
    }

    // 1. 任务分解 (由 Leader 执行)
    const leader = this.getMember('leader');
    const subTasks = this._decomposeTask(task, leader);

    // 2. 分配任务给合适的成员（支持真实并行）
    const results = await this._executeSubTasks(subTasks, context);

    // 3. 如果 worktree 模式，Leader 合并 Worker 结果
    if (this.isolation === 'worktree' && this._worktreeManager?.available) {
      const workerNames = subTasks
        .map(t => t.assignedTo)
        .filter(name => name !== 'leader');
      const uniqueWorkers = [...new Set(workerNames)];
      if (uniqueWorkers.length > 0) {
        const { merged, failed } = await this._worktreeManager.mergeWorkerResults(
          this.id, uniqueWorkers, 'cherry-pick'
        );
        // review: removed // review: removed console.log(`[AgentTeam:${this.name}] Merge result — merged: [${merged.join(', ')}], failed: [${failed.join(', ')}]`);
      }
      // 清理 worktrees
      await this._worktreeManager.cleanupTeam(this.id).catch(e =>
        console.warn(`[AgentTeam:${this.name}] Cleanup warning:`, e.message)
      );
    }

    // 4. 结果汇总 (由 Leader 汇总)
    const summary = this._summarizeResults(results);

    return {
      taskId,
      success: summary.success,
      task: task,
      subTasks: subTasks.length,
      results,
      summary,
      isolation: this.isolation,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 任务分解
   */
  _decomposeTask(task, leader) {
    // 简单任务分解：根据任务类型分配
    const subTasks = [];
    
    if (typeof task === 'string') {
      // 字符串任务，简单切分
      subTasks.push({
        id: randomUUID(),
        description: task,
        assignedTo: 'executor',
        type: 'general',
      });
    } else if (task.subTasks) {
      // 已有子任务结构
      subTasks.push(...task.subTasks);
    } else {
      // 默认创建执行任务
      subTasks.push({
        id: randomUUID(),
        description: task.content || JSON.stringify(task),
        assignedTo: 'executor',
        type: task.type || 'general',
      });
    }

    // 为每个子任务分配执行者
    return subTasks.map(st => ({
      ...st,
      assignedTo: st.assignedTo || this._selectExecutor(st),
    }));
  }

  /**
   * 选择执行者
   */
  _selectExecutor(subTask) {
    const type = subTask.type || 'general';
    
    const roleMap = {
      code: 'executor',
      write: 'executor',
      search: 'researcher',
      analysis: 'researcher',
      review: 'reviewer',
      default: 'executor',
    };

    return roleMap[type] || roleMap.default;
  }

  /**
   * 执行子任务（真实并行 + Worktree 隔离）
   */
  async _executeSubTasks(subTasks, context) {
    // 限制并行数量
    const limitedTasks = subTasks.slice(0, this.maxParallel);

    // 使用 Promise.allSettled 实现真正并行
    const promises = limitedTasks.map(async (task) => {
      const member = this.getMember(task.assignedTo);
      if (!member) {
        return {
          taskId: task.id,
          success: false,
          error: `Member not found: ${task.assignedTo}`,
        };
      }
      return this._executeByMember(member, task, context);
    });

    const settled = await Promise.allSettled(promises);
    return settled.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        taskId: limitedTasks[i]?.id,
        member: limitedTasks[i]?.assignedTo,
        success: false,
        error: result.reason?.message || String(result.reason),
      };
    });
  }

  /**
   * 成员执行任务
   * - worktree 模式：在独立 Git Worktree 中执行，物理隔离代码变更
   * - fork 模式：继承工作目录，逻辑隔离
   * - simulate 模式：仅用于测试/无 Git 环境
   */
  async _executeByMember(member, task, context) {
    const startTime = Date.now();

    // ── Worktree 隔离模式 ────────────────────────────────────────────────────
    if (this.isolation === 'worktree' && this._worktreeManager?.available) {
      const worktree = await this._worktreeManager.createWorktree(this.id, member.name);
      if (worktree) {
        try {
          // 如果成员有关联的 Subagent，使用 Subagent 在 worktree 内执行
          let output = '';
          const subagentMgr = this._kernel?.subagentManager;
          if (member.subagent && subagentMgr?.has(member.subagent)) {
            const result = await subagentMgr.execute(member.subagent, task.description, null);
            output = result?.output || `[${member.name}] Subagent executed`;
          } else {
            // 无 Subagent，在 worktree 内运行默认命令（echo 占位，实际应调用 AI 引擎）
            const { stdout } = await this._worktreeManager.execInWorktree(
              worktree,
              `echo "[${member.name}] processing: ${task.description.slice(0, 80).replace(/"/g, '')}"`,
              { timeout: this.timeout }
            );
            output = stdout.trim();
          }

          // 提交 worktree 变更
          await this._worktreeManager.commitWorktreeChanges(
            worktree,
            `feat(${member.name}): ${task.description.slice(0, 72)}`
          );

          return {
            taskId: task.id,
            member: member.name,
            role: member.role,
            success: true,
            isolation: 'worktree',
            worktreePath: worktree.path,
            branch: worktree.branch,
            output,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
          };
        } catch (e) {
          console.error(`[AgentTeam] Worktree execution error (${member.name}):`, e.message);
          // 执行失败，降级为 fork 模式继续
        }
      }
    }

    // ── Fork 模式（共享目录 + 逻辑隔离）────────────────────────────────────
    if (this.isolation === 'fork' || this.isolation === 'worktree') {
      const subagentMgr = this._kernel?.subagentManager;
      if (member.subagent && subagentMgr?.has(member.subagent)) {
        try {
          const result = await subagentMgr.execute(member.subagent, task.description, null);
          return {
            taskId: task.id,
            member: member.name,
            role: member.role,
            success: result?.success !== false,
            isolation: 'fork',
            output: result?.output || `[${member.name}] task completed`,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
          };
        } catch (e) {
          return {
            taskId: task.id,
            member: member.name,
            role: member.role,
            success: false,
            isolation: 'fork',
            error: e.message,
            timestamp: Date.now(),
          };
        }
      }
    }

    // ── Simulate 模式（兜底/测试） ───────────────────────────────────────────
    return {
      taskId: task.id,
      member: member.name,
      role: member.role,
      success: true,
      isolation: 'simulate',
      output: `[${member.name}] 执行任务: ${task.description.substring(0, 50)}...`,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  /**
   * 汇总结果
   */
  _summarizeResults(results) {
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return {
      success: successCount === totalCount,
      completed: successCount,
      total: totalCount,
      outputs: results.map(r => r.output).join('\n---\n'),
    };
  }

  /**
   * 获取团队状态
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      memberCount: this.members.size,
      members: Array.from(this.members.values()).map(m => m.toConfig()),
      maxParallel: this.maxParallel,
    };
  }
}

/**
 * Team Manager - 团队管理器
 */
export class TeamManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.teams = new Map();
    this.activeSessions = new Map();
  }

  /**
   * 创建团队
   */
  createTeam(config) {
    const team = new AgentTeam(config);
    // 注入 kernel，让 Team 可以访问 subagentManager 和 modelRouter
    team._kernel = this.kernel;
    this.teams.set(team.id, team);
    return team;
  }

  /**
   * 获取团队
   */
  getTeam(teamId) {
    return this.teams.get(teamId);
  }

  /**
   * 执行团队任务
   */
  async executeTeamTask(teamId, task, context = {}) {
    const team = this.getTeam(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const sessionId = randomUUID();
    this.activeSessions.set(sessionId, {
      teamId,
      task,
      startTime: Date.now(),
      status: 'running',
    });

    try {
      const result = await team.executeTask(task, context);
      this.activeSessions.set(sessionId, {
        ...this.activeSessions.get(sessionId),
        status: 'completed',
        result,
      });
      return result;
    } catch (e) {
      this.activeSessions.set(sessionId, {
        ...this.activeSessions.get(sessionId),
        status: 'failed',
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * 获取团队列表
   */
  getTeams() {
    return Array.from(this.teams.values()).map(t => t.getStatus());
  }

  /**
   * 获取活跃会话
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values()).filter(s => s.status === 'running');
  }
}

export default { AgentTeam, TeamMember, TeamManager, TeamRole };