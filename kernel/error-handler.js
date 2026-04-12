/**
 * HundunOS v4.3 - 错误处理增强
 * 添加错误边界、降级策略和自动重试
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 错误边界处理器
 */
export class ErrorHandler {
  constructor(kernel) {
    this.kernel = kernel;
    this.errorLogDir = join(kernel?.config?.storageDir || '.hundunos', 'errors');
    mkdirSync(this.errorLogDir, { recursive: true });
  }

  /**
   * 记录错误
   */
  logError(error, context = {}) {
    const errorLog = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
    };

    const filename = `error_${Date.now()}.json`;
    const filepath = join(this.errorLogDir, filename);
    writeFileSync(filepath, JSON.stringify(errorLog, null, 2), 'utf8');

    console.error(`[ErrorHandler] Error logged: ${filename}`);
  }

  /**
   * 获取错误统计
   */
  getErrorStats() {
    const fs = require('fs');
    const files = [];
    try {
      const allFiles = fs.readdirSync(this.errorLogDir);
      for (const f of allFiles) {
        if (f.startsWith('error_') && f.endsWith('.json')) {
          files.push(f);
        }
      }
    } catch (e) {
      return { total: 0, recent: [] };
    }

    const recent = files.slice(-10).map(f => {
      const filepath = join(this.errorLogDir, f);
      try {
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    return {
      total: files.length,
      recent,
    };
  }
}

/**
 * 降级策略管理器
 */
export class FallbackManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.strategies = new Map();
    this.registerDefaultStrategies();
  }

  /**
   * 注册默认策略
   */
  registerDefaultStrategies() {
    // Worktree 降级：Git 不可用时降级为 fork 模式
    this.register('worktree-git-unavailable', async (context) => {
      console.warn('[Fallback] Worktree Git unavailable, falling back to fork mode');
      context.team.isolation = 'fork';
      return { success: true, fallback: 'fork' };
    });

    // MemoryGraph 降级：Rust 不可用时降级为 JS
    this.register('memorygraph-rust-unavailable', async (context) => {
      console.warn('[Fallback] MemoryGraph Rust unavailable, falling back to JS');
      context.kernel.rustMemory = null;
      return { success: true, fallback: 'js' };
    });

    // ModelRouter 降级：所有 provider 失败时使用本地模型
    this.register('modelrouter-all-failed', async (context) => {
      console.warn('[Fallback] ModelRouter all providers failed, trying local model');
      const localProvider = context.kernel.modelRouter?.providers?.get('ollama');
      if (localProvider) {
        return { success: true, fallback: 'ollama', provider: 'ollama' };
      }
      return { success: false, error: 'No fallback available' };
    });

    // ToolBridge 降级：工具执行失败时使用模拟
    this.register('toolbridge-execution-failed', async (context) => {
      console.warn(`[Fallback] Tool execution failed for ${context.toolId}, using mock`);
      return {
        success: true,
        output: `<mock>Tool ${context.toolId} executed (fallback)</mock>`,
      };
    });

    // Compactor 降级：LLM 摘要失败时使用截断
    this.register('compactor-llm-failed', async (context) => {
      console.warn('[Fallback] Compactor LLM failed, using truncate');
      const { truncate } = await import('../kernel/compact/compactor.js');
      const compactor = new truncate.Compactor();
      const result = compactor.compact(context.messages);
      return { success: true, fallback: 'truncate', result };
    });
  }

  /**
   * 注册策略
   */
  register(name, handler) {
    this.strategies.set(name, handler);
  }

  /**
   * 执行策略
   */
  async execute(name, context = {}) {
    const handler = this.strategies.get(name);
    if (!handler) {
      return { success: false, error: `No fallback strategy for ${name}` };
    }

    try {
      return await handler(context);
    } catch (e) {
      console.error(`[Fallback] Strategy ${name} failed:`, e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * 列出所有策略
   */
  listStrategies() {
    return Array.from(this.strategies.keys());
  }
}

/**
 * 自动重试管理器
 */
export class RetryManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.maxRetries = 3;
    this.retryDelay = 1000;
    this.backoffMultiplier = 2;
  }

  /**
   * 带重试执行
   */
  async execute(fn, options = {}) {
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const retryDelay = options.retryDelay ?? this.retryDelay;
    const backoffMultiplier = options.backoffMultiplier ?? this.backoffMultiplier;
    const retryableErrors = options.retryableErrors || [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'rate_limit_exceeded',
      '429',
    ];

    let lastError = null;
    let delay = retryDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          break;
        }

        const isRetryable = retryableErrors.some(err =>
          error.message?.includes(err) ||
          error.code === err ||
          error.status === err
        );

        if (!isRetryable) {
          break;
        }

        console.warn(`[Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);
        await this.sleep(delay);
        delay *= backoffMultiplier;
      }
    }

    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 设置重试配置
   */
  configure(options) {
    if (options.maxRetries !== undefined) this.maxRetries = options.maxRetries;
    if (options.retryDelay !== undefined) this.retryDelay = options.retryDelay;
    if (options.backoffMultiplier !== undefined) this.backoffMultiplier = options.backoffMultiplier;
  }
}

export default { ErrorHandler, FallbackManager, RetryManager };
