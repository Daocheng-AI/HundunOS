/**
 * HundunOS v4.3 - Todo Manager 轻量清单系统
 * 参考 learn-claude-code s03 Todo / Planning
 * 实现会话级任务规划管理
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * TodoManager - 轻量清单管理器
 * v4.3: 参考 learn-claude-code s03
 */
export class TodoManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.state = {
      items: [],
      roundsSinceUpdate: 0,
    };
    this.PLAN_REMINDER_INTERVAL = 3;
    this.storageDir = join(kernel?.config?.storageDir || '.hundunos', 'todo');
    mkdirSync(this.storageDir, { recursive: true });
  }

  /**
   * 更新 Todo 列表
   * @param {Array} items - Todo 项列表
   * @returns {string} 渲染结果
   */
  update(items) {
    if (items.length > 12) {
      throw new Error('Keep the session plan short (max 12 items)');
    }

    const normalized = [];
    let inProgressCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const content = String(item?.content || '').trim();
      const status = String(item?.status || 'pending').toLowerCase();
      const activeForm = String(item?.activeForm || '').trim();

      if (!content) {
        throw new Error(`Item ${i}: content is required`);
      }

      if (!['pending', 'in_progress', 'completed'].includes(status)) {
        throw new Error(`Item ${i}: invalid status '${status}'`);
      }

      if (status === 'in_progress') {
        inProgressCount++;
      }

      normalized.push({
        content,
        status,
        activeForm,
      });
    }

    if (inProgressCount > 1) {
      throw new Error('Only one plan item can be in_progress');
    }

    this.state.items = normalized;
    this.state.roundsSinceUpdate = 0;

    // 持久化
    this._persist();

    return this.render();
  }

  /**
   * 记录一轮未更新
   */
  noteRoundWithoutUpdate() {
    this.state.roundsSinceUpdate++;
  }

  /**
   * 检查是否需要提醒
   * @returns {string|null} 提醒消息
   */
  reminder() {
    if (!this.state.items.length) {
      return null;
    }
    if (this.state.roundsSinceUpdate < this.PLAN_REMINDER_INTERVAL) {
      return null;
    }
    return '<reminder>Refresh your current plan before continuing.</reminder>';
  }

  /**
   * 渲染 Todo 列表
   * @returns {string} 渲染结果
   */
  render() {
    if (!this.state.items.length) {
      return 'No session plan yet.';
    }

    const lines = [];
    for (const item of this.state.items) {
      const marker = {
        pending: '[ ]',
        in_progress: '[>]',
        completed: '[x]',
      }[item.status];

      const line = `${marker} ${item.content}`;
      if (item.status === 'in_progress' && item.activeForm) {
        lines.push(`${line} (${item.activeForm})`);
      } else {
        lines.push(line);
      }
    }

    const completed = this.state.items.filter(i => i.status === 'completed').length;
    lines.push(`\n(${completed}/${this.state.items.length} completed)`);

    return lines.join('\n');
  }

  /**
   * 获取当前状态
   * @returns {Object} 当前状态
   */
  getState() {
    return {
      items: this.state.items,
      roundsSinceUpdate: this.state.roundsSinceUpdate,
      itemCount: this.state.items.length,
      completedCount: this.state.items.filter(i => i.status === 'completed').length,
    };
  }

  /**
   * 持久化到磁盘
   */
  _persist() {
    const filepath = join(this.storageDir, 'current.json');
    writeFileSync(filepath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  /**
   * 从磁盘加载
   */
  _load() {
    const filepath = join(this.storageDir, 'current.json');
    if (existsSync(filepath)) {
      try {
        const content = readFileSync(filepath, 'utf8');
        this.state = JSON.parse(content);
        return true;
      } catch (e) {
        console.warn('[TodoManager] Failed to load state:', e.message);
      }
    }
    return false;
  }

  /**
   * 检查是否有开放的任务
   * @returns {boolean}
   */
  hasOpenItems() {
    return this.state.items.some(i => i.status !== 'completed');
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      total: this.state.items.length,
      pending: this.state.items.filter(i => i.status === 'pending').length,
      inProgress: this.state.items.filter(i => i.status === 'in_progress').length,
      completed: this.state.items.filter(i => i.status === 'completed').length,
      roundsSinceUpdate: this.state.roundsSinceUpdate,
    };
  }
}
