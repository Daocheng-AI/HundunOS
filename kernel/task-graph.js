/**
 * HundunOS v4.3 - TaskGraph 持久任务图
 * 参考 learn-claude-code s12 Task System
 * 实现持久化任务图，支持依赖关系管理
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * TaskGraph - 持久任务图管理器
 * v4.3: 参考 learn-claude-code s12
 */
export class TaskGraph {
  constructor(kernel) {
    this.kernel = kernel;
    this.tasksDir = join(kernel?.config?.storageDir || '.hundunos', 'tasks');
    mkdirSync(this.tasksDir, { recursive: true });
    this.nextId = this._maxId() + 1;
  }

  /**
   * 获取最大任务 ID
   */
  _maxId() {
    const files = [];
    try {
      const allFiles = readdirSync(this.tasksDir);
      for (const f of allFiles) {
        files.push(f);
      }
    } catch (e) {
      return 0;
    }

    const ids = files
      .filter(f => f.startsWith('task_') && f.endsWith('.json'))
      .map(f => {
        const parts = f.split('_');
        const idStr = parts[1]?.split('.')[0] || '';
        return parseInt(idStr) || 0;
      });
    
    return Math.max(...ids, 0);
  }

  /**
   * 加载任务
   */
  _load(taskId) {
    const path = join(this.tasksDir, `task_${taskId}.json`);
    if (!existsSync(path)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      console.error(`[TaskGraph] Failed to load task ${taskId}:`, e.message);
      return null;
    }
  }

  /**
   * 保存任务
   */
  _save(task) {
    const path = join(this.tasksDir, `task_${task.id}.json`);
    writeFileSync(path, JSON.stringify(task, null, 2), 'utf8');
  }

  /**
   * 创建任务
   * @param {string} subject - 任务主题
   * @param {string} description - 任务描述
   * @returns {Object} 创建的任务
   */
  async create(subject, description = '') {
    const task = {
      id: this.nextId,
      subject,
      description,
      status: 'pending',
      blockedBy: [],
      blocks: [],
      owner: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this._save(task);
    this.nextId++;

    return task;
  }

  /**
   * 获取任务
   * @param {number} taskId - 任务 ID
   * @returns {Object|null} 任务对象
   */
  async get(taskId) {
    return this._load(taskId);
  }

  /**
   * 更新任务
   * @param {number} taskId - 任务 ID
   * @param {string} status - 任务状态
   * @param {string} owner - 任务所有者
   * @param {Array<number>} addBlockedBy - 添加依赖
   * @param {Array<number>} addBlocks - 添加阻塞
   * @returns {Object} 更新后的任务
   */
  async update(taskId, status = null, owner = null, addBlockedBy = null, addBlocks = null) {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (owner !== null) {
      task.owner = owner;
    }

    if (status) {
      if (!['pending', 'in_progress', 'completed', 'deleted'].includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }
      task.status = status;
      task.updatedAt = Date.now();

      // 当任务完成时，移除其他任务的 blockedBy
      if (status === 'completed') {
        await this._clearDependency(taskId);
      }
    }

    if (addBlockedBy && Array.isArray(addBlockedBy)) {
      task.blockedBy = Array.from(new Set([...(task.blockedBy || []), ...addBlockedBy]));
    }

    if (addBlocks && Array.isArray(addBlocks)) {
      task.blocks = Array.from(new Set([...(task.blocks || []), ...addBlocks]));

      // 双向依赖：更新被阻塞任务的 blockedBy
      for (const blockedId of addBlocks) {
        const blocked = await this.get(blockedId);
        if (blocked) {
          if (!blocked.blockedBy.includes(taskId)) {
            blocked.blockedBy.push(taskId);
            this._save(blocked);
          }
        }
      }
    }

    task.updatedAt = Date.now();
    this._save(task);

    return task;
  }

  /**
   * 清除依赖
   * @param {number} completedId - 已完成的任务 ID
   */
  async _clearDependency(completedId) {
    const files = [];
    try {
      const allFiles = readdirSync(this.tasksDir);
      for (const f of allFiles) {
        files.push(f);
      }
    } catch (e) {
      console.warn('[TaskGraph] Failed to read tasks directory:', e.message);
      return;
    }

    for (const file of files) {
      const parts = file.split('_');
      const idStr = parts[1]?.split('.')[0] || '';
      const taskId = parseInt(idStr);
      if (taskId <= 0) continue;

      const task = this._load(taskId);
      if (task && task.blockedBy?.includes(completedId)) {
        task.blockedBy = task.blockedBy.filter(id => id !== completedId);
        this._save(task);
      }
    }
  }

  /**
   * 列出所有任务
   * @returns {Array} 任务列表
   */
  async listAll() {
    const tasks = [];
    try {
      const allFiles = readdirSync(this.tasksDir);
      const sortedFiles = allFiles
        .filter(f => f.startsWith('task_') && f.endsWith('.json'))
        .sort();

      for (const file of sortedFiles) {
        const task = this._load(parseInt(file.split('_')[1].split('.')[0]));
        if (task) {
          tasks.push(task);
        }
      }
    } catch (e) {
      console.warn('[TaskGraph] Failed to list tasks:', e.message);
    }

    return tasks;
  }

  /**
   * 删除任务
   * @param {number} taskId - 任务 ID
   * @returns {boolean} 是否成功
   */
  async delete(taskId) {
    const path = join(this.tasksDir, `task_${taskId}.json`);
    if (!existsSync(path)) {
      return false;
    }

    try {
      rmSync(path);
      return true;
    } catch (e) {
      console.warn(`[TaskGraph] Failed to delete task ${taskId}:`, e.message);
      return false;
    }
  }

  /**
   * 获取任务统计
   * @returns {Object} 统计信息
   */
  async getStats() {
    const tasks = await this.listAll();
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      deleted: tasks.filter(t => t.status === 'deleted').length,
      blocked: tasks.filter(t => t.blockedBy?.length > 0).length,
      blocking: tasks.filter(t => t.blocks?.length > 0).length,
    };
  }

  /**
   * 获取依赖图
   * @returns {Object} 依赖图
   */
  async getDependencyGraph() {
    const tasks = await this.listAll();
    const graph = {
      nodes: tasks.map(t => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        blockedBy: t.blockedBy || [],
        blocks: t.blocks || [],
      })),
      edges: [],
    };

    // 构建边
    for (const task of tasks) {
      for (const blockedId of task.blockedBy || []) {
        graph.edges.push({
          from: blockedId,
          to: task.id,
          type: 'blocks',
        });
      }
      for (const blockId of task.blocks || []) {
        graph.edges.push({
          from: task.id,
          to: blockId,
          type: 'blocks',
        });
      }
    }

    return graph;
  }
}
