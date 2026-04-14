/**
 * kernel/agent-teams/worktree-manager.js
 * Git Worktree 隔离管理器
 *
 * 借鉴 oh-my-codex 的多 Worker 并行隔离设计：
 * 每个 Agent Team Worker 在独立的 Git Worktree 中执行，消除并发代码冲突。
 *
 * 架构：
 *   .hundunos/
 *   └── teams/
 *       └── {teamId}/
 *           ├── worker-leader/      ← git worktree
 *           ├── worker-executor/    ← git worktree
 *           ├── worker-reviewer/    ← git worktree
 *           └── worker-researcher/  ← git worktree
 */

import { execSync, exec } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Worktree 根目录，相对于 Git 仓库根 */
const WORKTREE_BASE = '.hundunos/teams';

/**
 * 判断当前目录是否在 Git 仓库中
 * @param {string} cwd
 * @returns {boolean}
 */
function isGitRepo(cwd) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 Git 仓库根目录
 * @param {string} cwd
 * @returns {string}
 */
function getGitRoot(cwd) {
  return execSync('git rev-parse --show-toplevel', { cwd, stdio: 'pipe' })
    .toString()
    .trim();
}

/**
 * Worktree 信息
 * v4.3: 添加任务双向绑定（参考 learn-claude-code s18）
 */
export class WorktreeInfo {
  constructor({ teamId, memberName, path, branch, created, taskId }) {
    this.teamId = teamId;
    this.memberName = memberName;
    this.path = path;
    this.branch = branch;
    this.created = created || Date.now();
    
    // v4.3: 任务绑定字段
    this.taskId = taskId || null;
    this.worktreeState = 'active'; // active | kept | removed | unbound
    this.closeout = null; // { action: 'keep'|'remove', reason: string, timestamp }
    this.lastEnteredAt = null;
    this.lastCommandAt = null;
    this.lastCommandPreview = null;
  }
}

/**
 * Git Worktree 管理器
 * 负责创建、使用、合并和清理 Worktrees
 */
export class WorktreeManager {
  constructor(options = {}) {
    /** 工作目录（Git 仓库根） */
    this.cwd = options.cwd || process.cwd();
    /** 是否可用（非 Git 环境降级为 false） */
    this.available = false;
    /** Git 仓库根绝对路径 */
    this.gitRoot = null;
    /** 已注册的 worktrees，key = `${teamId}/${memberName}` */
    this.worktrees = new Map();
    /** 初始化状态 */
    this._initialized = false;
  }

  /**
   * 初始化（检查 Git 环境）
   */
  async init() {
    if (this._initialized) return this;

    if (!isGitRepo(this.cwd)) {
      console.warn('[WorktreeManager] Not inside a Git repository — Worktree isolation disabled');
      this._initialized = true;
      return this;
    }

    this.gitRoot = getGitRoot(this.cwd);
    this.available = true;
    this._initialized = true;

    // 确保 worktree 根目录存在
    const base = join(this.gitRoot, WORKTREE_BASE);
    if (!existsSync(base)) {
      mkdirSync(base, { recursive: true });
    }

    // console.log(`[WorktreeManager] Initialized. Git root: ${this.gitRoot}`);
    return this;
  }

  /**
   * 为 Agent Team 的某个 Worker 创建独立 Worktree
   * @param {string} teamId
   * @param {string} memberName
   * @returns {Promise<WorktreeInfo|null>}
   */
  async createWorktree(teamId, memberName) {
    if (!this.available) return null;

    const key = `${teamId}/${memberName}`;
    // 已存在则直接返回
    if (this.worktrees.has(key)) {
      return this.worktrees.get(key);
    }

    const worktreePath = join(this.gitRoot, WORKTREE_BASE, teamId, `worker-${memberName}`);
    const branchName = `hundunos/team-${teamId.slice(0, 8)}/worker-${memberName}`;

    try {
      // 确保父目录存在
      mkdirSync(join(this.gitRoot, WORKTREE_BASE, teamId), { recursive: true });

      // 如果 worktree 路径已存在，先清理
      if (existsSync(worktreePath)) {
        await this._removeWorktreePath(worktreePath);
      }

      // 创建新 worktree（自动基于当前 HEAD 创建新分支）
      await execAsync(
        `git worktree add -b "${branchName}" "${worktreePath}" HEAD`,
        { cwd: this.gitRoot }
      );

      const info = new WorktreeInfo({
        teamId,
        memberName,
        path: worktreePath,
        branch: branchName,
      });

      this.worktrees.set(key, info);
      // console.log(`[WorktreeManager] Created worktree: ${worktreePath} (branch: ${branchName})`);
      return info;
    } catch (e) {
      console.error(`[WorktreeManager] Failed to create worktree for ${key}:`, e.message);
      return null;
    }
  }

  /**
   * 在指定 Worktree 中执行 shell 命令
   * @param {WorktreeInfo} worktree
   * @param {string} command
   * @param {object} options
   * @returns {Promise<{stdout:string, stderr:string}>}
   */
  async execInWorktree(worktree, command, options = {}) {
    if (!worktree?.path) throw new Error('Invalid worktree');
    return execAsync(command, {
      cwd: worktree.path,
      timeout: options.timeout || 120000,
      ...options,
    });
  }

  /**
   * 将 Worker Worktree 的变更提交
   * @param {WorktreeInfo} worktree
   * @param {string} message
   * @returns {Promise<string|null>} commit hash
   */
  async commitWorktreeChanges(worktree, message) {
    if (!worktree?.path) return null;

    try {
      await execAsync('git add -A', { cwd: worktree.path });
      const { stdout } = await execAsync(
        `git commit -m "${message.replace(/"/g, '\\"')}" --allow-empty`,
        { cwd: worktree.path }
      );
      // 提取 commit hash
      const hashMatch = stdout.match(/\[[\w/\-]+ ([0-9a-f]+)\]/);
      const hash = hashMatch?.[1] || null;
      // console.log(`[WorktreeManager] Committed in ${worktree.memberName}: ${hash}`);
      return hash;
    } catch (e) {
      console.error(`[WorktreeManager] Commit failed in ${worktree.memberName}:`, e.message);
      return null;
    }
  }

  /**
   * Leader 将各 Worker 的提交 cherry-pick/merge 到当前分支
   * @param {string} teamId
   * @param {string[]} memberNames - 要合并的 worker 名称列表
   * @param {string} strategy - 'cherry-pick' | 'merge'
   * @returns {Promise<{merged: string[], failed: string[]}>}
   */
  async mergeWorkerResults(teamId, memberNames, strategy = 'cherry-pick') {
    if (!this.available) return { merged: [], failed: [] };

    const merged = [];
    const failed = [];

    for (const memberName of memberNames) {
      const key = `${teamId}/${memberName}`;
      const worktree = this.worktrees.get(key);
      if (!worktree) {
        failed.push(memberName);
        continue;
      }

      try {
        if (strategy === 'cherry-pick') {
          // 获取 worktree 最新 commit hash
          const { stdout } = await execAsync(
            `git log --format="%H" -1`,
            { cwd: worktree.path }
          );
          const hash = stdout.trim();
          if (hash) {
            await execAsync(`git cherry-pick --allow-empty ${hash}`, { cwd: this.gitRoot });
            // console.log(`[WorktreeManager] Cherry-picked ${memberName}: ${hash}`);
          }
        } else {
          // merge 策略
          await execAsync(
            `git merge --no-ff "${worktree.branch}" -m "merge: worker-${memberName} results"`,
            { cwd: this.gitRoot }
          );
        }
        merged.push(memberName);
      } catch (e) {
        console.error(`[WorktreeManager] Merge failed for ${memberName}:`, e.message);
        failed.push(memberName);
      }
    }

    return { merged, failed };
  }

  /**
   * 清理 Team 的所有 Worktrees
   * @param {string} teamId
   */
  async cleanupTeam(teamId) {
    if (!this.available) return;

    const keysToRemove = [];
    for (const [key, worktree] of this.worktrees) {
      if (worktree.teamId === teamId) {
        keysToRemove.push(key);
        await this._removeWorktreeSafe(worktree);
      }
    }
    keysToRemove.forEach(k => this.worktrees.delete(k));

    // 清理团队目录
    const teamDir = join(this.gitRoot, WORKTREE_BASE, teamId);
    if (existsSync(teamDir)) {
      rmSync(teamDir, { recursive: true, force: true });
    }

    // console.log(`[WorktreeManager] Cleaned up team ${teamId}`);
  }

  /**
   * 安全移除单个 Worktree
   * @param {WorktreeInfo} worktree
   */
  async _removeWorktreeSafe(worktree) {
    try {
      await execAsync(
        `git worktree remove "${worktree.path}" --force`,
        { cwd: this.gitRoot }
      );
      // 删除临时分支
      await execAsync(
        `git branch -D "${worktree.branch}"`,
        { cwd: this.gitRoot }
      ).catch(() => {}); // 分支可能已被合并删除，忽略错误
      worktree.status = 'removed';
    } catch (e) {
      // 如果 worktree 路径不存在，直接跳过
      if (!existsSync(worktree.path)) return;
      console.warn(`[WorktreeManager] Could not remove worktree ${worktree.path}:`, e.message);
    }
  }

  /**
   * 强制删除 worktree 路径（用于重建）
   */
  async _removeWorktreePath(worktreePath) {
    try {
      await execAsync(
        `git worktree remove "${worktreePath}" --force`,
        { cwd: this.gitRoot }
      );
    } catch {
      // 路径可能不在 git worktree 列表中，直接删文件夹
      rmSync(worktreePath, { recursive: true, force: true });
    }
    // 清理 git worktree 状态
    await execAsync('git worktree prune', { cwd: this.gitRoot }).catch(() => {});
  }

  /**
   * 列出当前所有活跃 Worktrees
   * @returns {WorktreeInfo[]}
   */
  list() {
    return Array.from(this.worktrees.values()).filter(w => w.status === 'active');
  }

  /**
   * 获取统计信息
   */
  stats() {
    const all = Array.from(this.worktrees.values());
    return {
      available: this.available,
      gitRoot: this.gitRoot,
      total: all.length,
      active: all.filter(w => w.status === 'active').length,
      removed: all.filter(w => w.status === 'removed').length,
    };
  }
}

/**
 * 全局单例 WorktreeManager
 */
let _instance = null;

export function getWorktreeManager(options = {}) {
  if (!_instance) {
    _instance = new WorktreeManager(options);
  }
  return _instance;
}

export default { WorktreeManager, WorktreeInfo, getWorktreeManager };
