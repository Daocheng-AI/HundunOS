// hundunos/kernel/compact/compactor.js — 长会话消息压缩系统 v1.0
// 借鉴 Claude Code Compaction 设计
// 参考: claude-code-best/src/services/compact/
//
// 支持：
//   - 消息摘要压缩（Compaction）
//   - 响应式压缩（Reactive Compaction）
//   - 上下文折叠（Context Collapse）

import { feature } from '../feature-flags.js';

/**
 * 压缩配置
 */
const DEFAULT_CONFIG = {
  // 触发阈值
  triggerTokenPercent: 70,     // token 使用率超过此值触发压缩
  triggerMessageCount: 50,    // 消息数量超过此值触发压缩

  // 保留策略
  keepRecent: 6,               // 保留最近 N 条消息
  keepSystem: true,            // 保留系统消息
  keepToolResults: 3,          // 保留最近 N 个工具结果

  // 摘要设置
  summarizeModel: 'gpt-4o-mini', // 摘要用模型
  maxSummaryLength: 500,        // 摘要最大长度

  // 折叠设置
  collapseThreshold: 3,         // 连续重复超过此数触发折叠
  collapseSimilarity: 0.8,      // 相似度阈值
};

/**
 * 消息压缩单元
 */
class CompactionUnit {
  constructor(messages, config = {}) {
    this.messages = messages;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 判断是否需要压缩
   */
  shouldCompact(usage = {}) {
    if (feature('REACTIVE_COMPACT')) {
      const usedPercent = (usage.usedTokens / usage.maxTokens) * 100;
      return usedPercent >= this.config.triggerTokenPercent;
    }
    return this.messages.length >= this.config.triggerMessageCount;
  }

  /**
   * 执行压缩：生成摘要 + 保留关键消息
   * v4.3: 支持异步 LLM 摘要
   */
  async compact(options = {}) {
    const { model, apiClient } = options;
    const recent = this.messages.slice(-this.config.keepRecent);

    // 提取可压缩的历史（排除最近和系统消息）
    const preservable = this.messages.slice(0, -this.config.keepRecent);
    const preservedMessages = this._filterPreservable(preservable);

    // 使用 LLM 生成摘要（如果可用）
    const summary = await this._generateLLMSummary(preservedMessages, {
      model: model || this.config.summarizeModel,
      maxTokens: this.config.maxSummaryLength,
    });

    return {
      summary,
      preservedMessages,
      recent,
      stats: {
        originalCount: this.messages.length,
        compressedCount: preservedMessages.length,
        compressionRatio: preservedMessages.length / this.messages.length,
      },
    };
  }

  _filterPreservable(messages) {
    const result = [];
    for (const msg of messages) {
      // 保留工具结果（最多 keepToolResults 个）
      if (msg.role === 'tool' && result.filter(m => m.role === 'tool').length < this.config.keepToolResults) {
        result.push(msg);
        continue;
      }
      // 保留有决策/结论的消息
      if (msg._important || msg.role === 'system') {
        result.push(msg);
      }
    }
    return result;
  }

  _generateSummaryPlaceholder(messages) {
    const count = messages.length;
    const toolCount = messages.filter(m => m.role === 'tool').length;
    return {
      role: 'system',
      content: `[Earlier conversation summary: ${count} messages processed, including ${toolCount} tool calls. Key context preserved in earlier turns.]`,
      _isSummary: true,
    };
  }

  /**
   * 使用 LLM 生成真实摘要（v4.3 新增）
   * @param {Array} messages - 需要摘要的消息
   * @param {Object} options - { model, maxTokens }
   * @returns {Promise<Object>} - 摘要消息对象
   */
  async _generateLLMSummary(messages, options = {}) {
    const { model = 'gpt-4o-mini', maxTokens = 500 } = options;

    if (!this.kernel?.modelRouter) {
      // 降级到占位符
      return this._generateSummaryPlaceholder(messages);
    }

    try {
      const summaryPrompt = this._buildSummaryPrompt(messages);
      const response = await this.kernel.modelRouter.route({
        messages: [
          { role: 'system', content: 'Summarize the following conversation concisely. Focus on key decisions, context, and outcomes.' },
          { role: 'user', content: summaryPrompt },
        ],
        model,
        maxTokens,
        strategy: 'COST_OPTIMIZED',
      });

      const summary = response?.content?.[0]?.text ||
                     response?.choices?.[0]?.message?.content ||
                     'Earlier conversation summarized.';

      return {
        role: 'user',
        content: `[Earlier conversation summarized]: ${summary}`,
        _isSummary: true,
        _llmGenerated: true,
      };
    } catch (e) {
      console.warn('[Compactor] LLM summary failed, falling back to placeholder:', e.message);
      return this._generateSummaryPlaceholder(messages);
    }
  }

  /**
   * 构建摘要提示
   */
  _buildSummaryPrompt(messages) {
    const lines = messages.map(m => {
      const role = m.role || 'unknown';
      const content = typeof m.content === 'string'
        ? m.content
        : JSON.stringify(m.content).slice(0, 200);
      return `${role}: ${content.slice(0, 500)}`;
    });
    return lines.join('\n---\n');
  }
}

/**
 * ReactiveCompactor — 响应式压缩
 * 监控 token 使用率，动态触发压缩
 */
export class ReactiveCompactor {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.enabled = feature('REACTIVE_COMPACT');
    this.lastCheck = Date.now();
    this.compactionCount = 0;
  }

  /**
   * 检查是否需要压缩
   */
  async check(usage = {}) {
    if (!this.enabled) return { needed: false };

    const { usedTokens = 0, maxTokens = 0 } = usage;
    const usedPercent = maxTokens > 0 ? (usedTokens / maxTokens) * 100 : 0;

    if (usedPercent >= this.config.triggerTokenPercent) {
      return {
        needed: true,
        reason: `token_usage`,
        usedPercent,
        threshold: this.config.triggerTokenPercent,
      };
    }

    return { needed: false, usedPercent };
  }

  /**
   * 执行压缩
   * v4.3: 支持异步 LLM 摘要
   */
  async compact(messages, options = {}) {
    const unit = new CompactionUnit(messages, this.config);
    const result = await unit.compact(options);
    this.compactionCount++;
    return result;
  }

  getStats() {
    return {
      enabled: this.enabled,
      compactionCount: this.compactionCount,
      config: this.config,
    };
  }
}

/**
 * ContextCollapser — 上下文折叠
 * 识别并折叠高度相似的连续消息
 */
export class ContextCollapser {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.config = options;
    this.enabled = feature('CONTEXT_COLLAPSE');
  }

  /**
   * 折叠相似消息块
   */
  collapse(messages) {
    if (!this.enabled || messages.length < 3) return messages;

    const result = [];
    let buffer = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const prev = buffer[buffer.length - 1];

      if (prev && this._isSimilar(prev, msg)) {
        buffer.push(msg);
      } else {
        if (buffer.length >= (this.config?.collapseThreshold || 3)) {
          result.push(this._makeCollapsedEntry(buffer));
        } else {
          result.push(...buffer);
        }
        buffer = [msg];
      }
    }

    // 处理剩余 buffer
    if (buffer.length >= (this.config?.collapseThreshold || 3)) {
      result.push(this._makeCollapsedEntry(buffer));
    } else {
      result.push(...buffer);
    }

    return result;
  }

  _isSimilar(a, b) {
    const threshold = this.config?.collapseSimilarity || 0.8;

    // 相同角色 + 内容相似
    if (a.role !== b.role) return false;

    // 简单字符串相似度
    const contentA = typeof a.content === 'string' ? a.content : JSON.stringify(a.content);
    const contentB = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);

    const similarity = this._jaccardSimilarity(contentA, contentB);
    return similarity >= threshold;
  }

  _jaccardSimilarity(a, b) {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  _makeCollapsedEntry(messages) {
    return {
      role: messages[0].role,
      content: `[${messages.length} similar messages collapsed]`,
      _collapsed: true,
      _collapsedCount: messages.length,
    };
  }
}

/**
 * SessionCompactor — 会话级压缩管理器
 */
export class SessionCompactor {
  constructor(kernel) {
    this.kernel = kernel;
    this.reactive = new ReactiveCompactor(kernel);
    this.collapser = new ContextCollapser(kernel);
    this.messageHistory = [];
  }

  /**
   * 添加消息到历史
   */
  addMessage(message) {
    this.messageHistory.push(message);
  }

  /**
   * 获取压缩后的上下文
   * v4.3: 支持异步 LLM 摘要
   */
  async getCompressedContext(options = {}) {
    let messages = [...this.messageHistory];

    // Step 1: 折叠相似块
    if (feature('CONTEXT_COLLAPSE')) {
      messages = this.collapser.collapse(messages);
    }

    // Step 2: 检查是否需要压缩
    if (feature('CONTEXT_COMPACT') || feature('REACTIVE_COMPACT')) {
      const usage = options.usage || { usedTokens: 0, maxTokens: 8192 };
      const unit = new CompactionUnit(messages);
      if (unit.shouldCompact(usage)) {
        const result = await unit.compact(options);
        messages = [result.summary, ...result.preservedMessages, ...result.recent];
      }
    }

    return messages;
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      totalMessages: this.messageHistory.length,
      reactive: this.reactive.getStats(),
      enabled: feature('CONTEXT_COMPACT') || feature('REACTIVE_COMPACT'),
    };
  }

  /**
   * 重置历史
   */
  reset() {
    this.messageHistory = [];
  }
}

export default SessionCompactor;
