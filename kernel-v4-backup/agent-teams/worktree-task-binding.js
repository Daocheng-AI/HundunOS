/**
 * HundunOS v4.3 - Worktree 任务双向绑定
 * 参考 learn-claude-code s18 Worktree Isolation
 * 实现 task_record 和 worktree_record 的双向绑定
 */

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * WorktreeTaskBinding - 任务与 Worktree 双向绑定管理器
 * v4.3: 参考 learn-claude-code s18
 */
export class WorktreeTaskBinding {
  constructor(kernel) {
    this.kernel = kernel;
    this.tasksDir = join(kernel?.config?.storageDir || '.hundunos', 'tasks');
  }

  /**
   * 绑定任务到 Worktree
   * @param {number} taskId - 任务 ID
   * @param {string} worktreeName - Worktree 名称（格式：{teamId}/{memberName}）
   * @returns {Promise<Object>} 绑定结果
   */
  async bindTaskToWorktree(taskId, worktreeName) {
    const worktreeManager = this.kernel?.agentTeams?.worktreeManager;
    if (!worktreeManager) {
      throw new Error('WorktreeManager not available');
    }

    // 检查 worktree 是否存在
    const worktree = worktreeManager.worktrees.get(worktreeName);
    if (!worktree) {
      throw new Error(`Worktree not found: ${worktreeName}`);
    }

    // 更新 worktree 的 taskId 字段
    worktree.taskId = taskId;
    worktree.worktreeState = 'active';
    worktree.lastEnteredAt = Date.now();

    // 更新任务的 worktree 字段
    const task = await this._getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.worktree = worktreeName;
    task.worktreeState = 'active';

    // 持久化
    await this._saveTask(task);
    worktreeManager._saveWorktree(worktreeName, worktree);

    return {
      taskId,
      worktreeName,
      taskWorktree: task.worktree,
      worktreeTaskId: worktree.taskId,
      worktreeState: worktree.worktreeState,
    };
  }

  /**
   * Worktree 收尾
   * @param {string} worktreeName - Worktree 名称
   * @param {string} action - 'keep' | 'remove'
   * @param {string} reason - 收尾原因
   * @param {boolean} completeTask - 是否同时完成任务
   * @returns {Promise<Object>} 收尾结果
   */
  async worktreeCloseout(worktreeName, action, reason, completeTask = true) {
    const worktreeManager = this.kernel?.agentTeams?.worktreeManager;
    if (!worktreeManager) {
      throw new Error('WorktreeManager not available');
    }

    const worktree = worktreeManager.worktrees.get(worktreeName);
    if (!worktree) {
      throw new Error(`Worktree not found: ${worktreeName}`);
    }

    // 更新 worktree 状态
    worktree.worktreeState = action === 'keep' ? 'kept' : 'removed';
    worktree.closeout = {
      action,
      reason,
      timestamp: Date.now(),
    };

    worktreeManager._saveWorktree(worktreeName, worktree);

    // 如果绑定了任务，更新任务状态
    let taskResult = null;
    if (worktree.taskId && completeTask) {
      const task = await this._getTask(worktree.taskId);
      if (task) {
        task.status = 'completed';
        task.completedAt = Date.now();
        await this._saveTask(task);
        taskResult = { taskId: worktree.taskId, status: task.status };
      }
    }

    return {
      worktreeName,
      worktreeState: worktree.worktreeState,
      closeout: worktree.closeout,
      task: taskResult,
    };
  }

  /**
   * 获取任务
   */
  async _getTask(taskId) {
    const taskPath = join(this.tasksDir, `task_${taskId}.json`);
    if (!existsSync(taskPath)) {
      return null;
    }
    const content = readFileSync(taskPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * 保存任务
   */
  async _saveTask(task) {
    const taskPath = join(this.tasksDir, `task_${task.id}.json`);
    writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf8');
  }

  /**
   * 获取绑定状态
   */
  async getBindingStatus(taskId) {
    const task = await this._getTask(taskId);
    if (!task) {
      return null;
    }

    const worktreeManager = this.kernel?.agentTeams?.worktreeManager;
    if (!worktreeManager || !task.worktree) {
      return {
        taskId,
        worktree: task.worktree,
        worktreeExists: false,
      };
    }

    const worktree = worktreeManager.worktrees.get(task.worktree);
    return {
      taskId,
      worktree: task.worktree,
      worktreeExists: !!worktree,
      worktreeState: worktree?.worktreeState,
      closeout: worktree?.closeout,
    };
  }
}
