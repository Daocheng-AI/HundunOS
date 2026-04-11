// hundunos/kernel/proactive/proactive.js — Proactive 主动建议系统 v1.0
// 借鉴 Claude Code SleepTool / Proactive 设计
// 参考: claude-code-best/src/tools/SleepTool/
//
// 功能：
//   - 检测主动建议时机（任务完成/长空闲/异常）
//   - 生成摘要建议（Sleep Tool）
//   - 用户确认后执行

import { feature } from '../feature-flags.js';

/**
 * 主动建议触发时机
 */
export const ProactiveTrigger = {
  TASK_COMPLETE: 'task_complete',
  LONG_IDLE: 'long_idle',
  ERROR_DETECTED: 'error_detected',
  CONTEXT_STALE: 'context_stale',
  SESSION_END: 'session_end',
};

/**
 * 主动建议项
 */
export class ProactiveSuggestion {
  constructor(type, message, metadata = {}) {
    this.id = `proactive_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.type = type;
    this.message = message;
    this.metadata = metadata;
    this.createdAt = Date.now();
    this.status = 'pending'; // pending / approved / dismissed / executed
    this.priority = metadata.priority || 'normal';
  }

  toSummary() {
    return {
      id: this.id,
      type: this.type,
      message: this.message,
      priority: this.priority,
      age: Date.now() - this.createdAt,
    };
  }
}

/**
 * 任务完成触发器
 */
class TaskCompleteTrigger {
  constructor(kernel) {
    this.kernel = kernel;
    this.lastTaskId = null;
  }

  async check() {
    const memory = this.kernel?.memoryGraph;
    if (!memory) return null;
    const recent = memory.recent?.[0];
    if (!recent) return null;
    if (recent.id === this.lastTaskId) return null;
    if (recent.result !== true) return null;
    this.lastTaskId = recent.id;
    return new ProactiveSuggestion(ProactiveTrigger.TASK_COMPLETE,
      `Task completed: ${recent.message?.substring(0, 80)}. Should I summarize or continue?`,
      { taskId: recent.id, priority: 'normal' }
    );
  }
}

/**
 * 长时间空闲触发器
 */
class LongIdleTrigger {
  constructor(kernel, thresholdMs = 300_000) {
    this.kernel = kernel;
    this.thresholdMs = thresholdMs;
    this.lastActivity = Date.now();
    this.lastNotified = 0;
  }

  touch() { this.lastActivity = Date.now(); }

  async check() {
    const idle = Date.now() - this.lastActivity;
    if (idle < this.thresholdMs) return null;
    if (Date.now() - this.lastNotified < 600_000) return null;
    this.lastNotified = Date.now();
    return new ProactiveSuggestion(ProactiveTrigger.LONG_IDLE,
      `Idle for ${Math.round(idle / 60000)} minutes. Can I help?`,
      { idleMs: idle, priority: 'low' }
    );
  }
}

/**
 * 错误检测触发器
 */
class ErrorTrigger {
  constructor(kernel) {
    this.kernel = kernel;
    this.errorCount = 0;
  }

  recordError(err) {
    this.errorCount++;
  }

  async check() {
    if (this.errorCount === 0) return null;
    const count = this.errorCount;
    this.errorCount = 0;
    return new ProactiveSuggestion(ProactiveTrigger.ERROR_DETECTED,
      `${count} error(s) detected. Want me to analyze or fix?`,
      { errorCount: count, priority: 'high' }
    );
  }
}

/**
 * ProactiveManager — 主动建议管理器
 */
export class ProactiveManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.triggers = [];
    this.suggestions = [];
    this.maxSuggestions = 10;
    this.enabled = feature('PROACTIVE');
    this._intervalHandle = null;
    if (this.enabled) this._registerTriggers();
  }

  _registerTriggers() {
    this.triggers = [
      new TaskCompleteTrigger(this.kernel),
      new LongIdleTrigger(this.kernel, 300_000),
      new ErrorTrigger(this.kernel),
    ];
  }

  start(intervalMs = 30_000) {
    if (!this.enabled) return;
    this._intervalHandle = setInterval(() => this._checkAll(), intervalMs);
    // review: removed // review: removed console.log('[Proactive] Manager started');
  }

  stop() {
    if (this._intervalHandle) { clearInterval(this._intervalHandle); this._intervalHandle = null; }
  }

  async _checkAll() {
    if (!this.enabled) return;
    for (const trigger of this.triggers) {
      try {
        const s = await trigger.check();
        if (s) this.addSuggestion(s);
      } catch (err) {
        console.warn('[Proactive] trigger error:', err.message);
      }
    }
  }

  addSuggestion(s) {
    if (this.suggestions.find(x => x.id === s.id)) return;
    this.suggestions.unshift(s);
    if (this.suggestions.length > this.maxSuggestions) this.suggestions = this.suggestions.slice(0, this.maxSuggestions);
    this.kernel?.emit?.('proactive:suggestion', s);
    return s;
  }

  getSuggestions(opts = {}) {
    const { pending = true, limit = 5 } = opts;
    const list = pending ? this.suggestions.filter(s => s.status === 'pending') : this.suggestions;
    return list.slice(0, limit).map(s => s.toSummary());
  }

  approve(id, action = null) {
    const s = this.suggestions.find(x => x.id === id);
    if (!s) return { success: false };
    s.status = action ? 'approved' : 'dismissed';
    return { success: true, suggestion: s };
  }

  touch() { this.triggers.forEach(t => t.touch?.()); }
  recordError(e) { this.triggers.find(t => t instanceof ErrorTrigger)?.recordError(e); }

  getStats() {
    return {
      enabled: this.enabled,
      triggers: this.triggers.length,
      total: this.suggestions.length,
      pending: this.suggestions.filter(s => s.status === 'pending').length,
    };
  }
}

export default ProactiveManager;
