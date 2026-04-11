// hundunos/kernel/tool-scheduler.js — Tool 执行调度器 v1.0
// 借鉴 Claude Code toolOrchestration.ts 设计
// 参考: claude-code-best/src/services/tools/toolOrchestration.ts
//
// 核心设计：读写分离
//   - 读操作（read-only）→ 并发执行（性能）
//   - 写操作（write/modify）→ 串行执行（安全）
//   - 分类依据：工具是否可能修改系统状态
//
// 使用方式：
//   const scheduler = new ToolScheduler(toolBridge, options)
//   for await (const update of scheduler.runTools(toolCalls)) { ... }

import { feature } from './feature-flags.js';

/**
 * 工具分类常量
 * 用于判断工具是否属于"只读"操作
 */
export const ToolCategory = {
  READ: 'read',      // 读操作（可并发）
  WRITE: 'write',    // 写操作（必须串行）
  MIXED: 'mixed',   // 混合操作（串行）
  SYSTEM: 'system',  // 系统操作（串行 + 特殊处理）
};

/**
 * 读操作工具白名单（并发安全）
 */
const READ_ONLY_TOOLS = new Set([
  'BashTool', 'GrepTool', 'GlobTool', 'FileReadTool',
  'WebFetchTool', 'WebSearchTool', 'TodoReadTool',
  'ListMcpResourcesTool', 'ReadMcpResourceTool',
  'ToolSearchTool', 'LSPTool', 'LSPAnalyzeTool',
  // HundunOS 工具
  'read_file', 'search_file', 'list_dir', 'web_search',
  'web_fetch', 'read_memory', 'query_knowledge',
  'read_mcp_resource', 'list_mcp_resources',
]);

/**
 * 写操作工具黑名单（必须串行）
 */
const WRITE_TOOLS = new Set([
  'FileEditTool', 'FileWriteTool', 'NotebookEditTool',
  'TaskCreateTool', 'TodoWriteTool', 'AgentTool',
  'TeamCreateTool', 'TeamDeleteTool', 'SendMessageTool',
  'BashTool', // Bash 可能包含写操作，降级为串行
  'MCPTool', 'McpServerTool',
  // HundunOS 工具
  'write_to_file', 'replace_in_file', 'delete_file',
  'execute_command', 'write_memory', 'create_automation',
  'send_message', 'create_agent', 'delete_agent',
]);

/**
 * 识别工具调用的读写类型
 */
export function classifyToolCall(toolUse) {
  const name = toolUse.name || toolUse.tool_use?.name || '';

  // 明确为写操作
  if (WRITE_TOOLS.has(name)) {
    return { category: ToolCategory.WRITE, isConcurrencySafe: false };
  }

  // 明确为读操作
  if (READ_ONLY_TOOLS.has(name)) {
    return { category: ToolCategory.READ, isConcurrencySafe: true };
  }

  // 未知工具保守处理（串行）
  return { category: ToolCategory.MIXED, isConcurrencySafe: false };
}

/**
 * 分区工具调用（读写分离）
 */
export function partitionToolCalls(toolCalls) {
  const readBatch = [];
  const writeBatch = [];

  for (const toolCall of toolCalls) {
    const { isConcurrencySafe } = classifyToolCall(toolCall);
    if (isConcurrencySafe) {
      readBatch.push(toolCall);
    } else {
      writeBatch.push(toolCall);
    }
  }

  return { readBatch, writeBatch };
}

/**
 * ToolScheduler — 核心调度器
 */
export class ToolScheduler {
  constructor(toolBridge, options = {}) {
    this.toolBridge = toolBridge;
    this.kernel = toolBridge?.kernel;
    this.maxConcurrency = options.maxConcurrency || 10;
    this.enableRwSplit = options.enableRwSplit !== false;
    this.defaultTimeout = options.defaultTimeout || 30_000;

    // 统计
    this.stats = {
      total: 0,
      readConcurrent: 0,
      writeSerial: 0,
      errors: 0,
      totalDuration: 0,
    };

    // v3.6: hundunos-rust tool-bridge 集成（可选）
    this._rustInitPromise = null;
    if (feature('RUST_BRIDGE')) {
      this._rustInitPromise = this._initRustBridge();
    }
  }

  async _initRustBridge() {
    if (!this.toolBridge?._initRustBridge) {
      console.log('[ToolScheduler] ToolBridge Rust bridge not available');
      return;
    }
    try {
      await this.toolBridge._initRustBridge();
      console.log('[ToolScheduler] Rust tool-bridge initialized');
    } catch (e) {
      console.warn('[ToolScheduler] Rust bridge init failed:', e.message);
    }
  }

  /**
   * 核心入口：执行一组工具调用
   * 返回 AsyncGenerator，逐个 yield 执行结果
   */
  async *runTools(toolCalls, context = {}) {
    this.stats.total += toolCalls.length;

    if (!this.enableRwSplit || !feature('TOOL_RW_SPLIT')) {
      // 降级模式：完全串行（保持原有行为）
      yield* this._runSerial(toolCalls, context);
      return;
    }

    const { readBatch, writeBatch } = partitionToolCalls(toolCalls);

    // Phase 1: 读操作批量并发
    if (readBatch.length > 0) {
      yield* this._runReadBatch(readBatch, context);
    }

    // Phase 2: 写操作串行
    if (writeBatch.length > 0) {
      yield* this._runWriteBatch(writeBatch, context);
    }
  }

  /**
   * 读操作批量并发执行
   */
  async *_runReadBatch(batch, context) {
    const sem = new Semaphore(this.maxConcurrency);
    const start = Date.now();

    const tasks = batch.map(async (toolCall) => {
      await sem.acquire();
      try {
        const result = await this._executeTool(toolCall, context);
        return { success: true, toolCall, result };
      } catch (err) {
        return { success: false, toolCall, error: err.message };
      } finally {
        sem.release();
      }
    });

    for await (const task of concurrentBatch(tasks)) {
      this.stats.readConcurrent++;
      yield this._normalizeResult(task);
    }

    this.stats.totalDuration += Date.now() - start;
  }

  /**
   * 写操作串行执行
   */
  async *_runWriteBatch(batch, context) {
    const start = Date.now();

    for (const toolCall of batch) {
      try {
        const result = await this._executeTool(toolCall, context);
        this.stats.writeSerial++;
        yield this._normalizeResult({ success: true, toolCall, result });
      } catch (err) {
        this.stats.writeSerial++;
        this.stats.errors++;
        yield this._normalizeResult({ success: false, toolCall, error: err.message });
      }
    }

    this.stats.totalDuration += Date.now() - start;
  }

  /**
   * 降级：完全串行
   */
  async *_runSerial(batch, context) {
    const start = Date.now();
    for (const toolCall of batch) {
      try {
        const result = await this._executeTool(toolCall, context);
        yield this._normalizeResult({ success: true, toolCall, result });
      } catch (err) {
        this.stats.errors++;
        yield this._normalizeResult({ success: false, toolCall, error: err.message });
      }
    }
    this.stats.totalDuration += Date.now() - start;
  }

  /**
   * 执行单个工具
   */
  async _executeTool(toolCall, context) {
    const name = toolCall.name || toolCall.tool_use?.name || 'unknown';
    const args = toolCall.args || toolCall.tool_use?.input || {};

    if (feature('DEBUG_MODE')) {
      console.log(`[ToolScheduler] -> ${name}(${JSON.stringify(args).substring(0, 80)})`);
    }

    // 通过 toolBridge 执行
    if (this.toolBridge?.execute) {
      const result = await Promise.race([
        this.toolBridge.execute(name, args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool ${name} timeout`)), this.defaultTimeout)
        ),
      ]);
      return result;
    }

    // 直接执行（备用）
    return { error: 'No tool bridge available', tool: name };
  }

  /**
   * 标准化结果格式
   */
  _normalizeResult(raw) {
    return {
      toolName: raw.toolCall?.name || raw.toolCall?.tool_use?.name || 'unknown',
      success: raw.success,
      result: raw.result || null,
      error: raw.error || null,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取调度统计
   */
  getStats() {
    return {
      ...this.stats,
      avgDuration: this.stats.total > 0
        ? Math.round(this.stats.totalDuration / this.stats.total)
        : 0,
      readRatio: this.stats.total > 0
        ? Math.round((this.stats.readConcurrent / this.stats.total) * 100)
        : 0,
      // v3.6: Rust bridge 状态
      rustBridge: feature('RUST_BRIDGE') ? {
        enabled: true,
        initialized: this.toolBridge?.rustBridge !== null,
      } : { enabled: false },
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = { total: 0, readConcurrent: 0, writeSerial: 0, errors: 0, totalDuration: 0 };
  }
}

/**
 * 信号量（简单实现）
 */
class Semaphore {
  constructor(permits) {
    this.permits = permits;
    this._queue = [];
  }

  async acquire() {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise(resolve => this._queue.push(resolve));
  }

  release() {
    if (this._queue.length > 0) {
      const resolve = this._queue.shift();
      resolve();
    } else {
      this.permits++;
    }
  }
}

/**
 * 并发执行 Promise 数组，yield 每个完成的结果
 */
async function* concurrentBatch(promises) {
  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === 'fulfilled') {
      yield result.value;
    } else {
      yield { success: false, error: result.reason?.message || result.reason };
    }
  }
}

export default ToolScheduler;
