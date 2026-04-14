/**
 * kernel/context/index.js
 * 上下文压缩与折叠系统
 * 
 * 借鉴 Claude Code 上下文管理设计
 * 减少 token 消耗，保持对话流畅
 */

import { createHash } from 'crypto';

/**
 * 上下文压缩策略
 */
export const CompressionStrategy = {
  /** 不压缩 */
  NONE: 'none',
  /** 折叠：保留结构，压缩重复内容 */
  COLLAPSE: 'collapse',
  /** 摘要：用 AI 生成摘要替换原始内容 */
  SUMMARY: 'summary',
  /** 混合：折叠 + 摘要 */
  HYBRID: 'hybrid',
};

/**
 * 消息类型权重（用于决定保留哪些）
 */
const MESSAGE_WEIGHTS = {
  system: 1.0,
  user: 0.8,
  assistant: 0.6,
  tool_result: 0.3,
  tool_use: 0.4,
};

/**
 * 上下文压缩器
 */
export class ContextCompressor {
  constructor(config = {}) {
    this.maxTokens = config.maxTokens || 100000;
    this.strategy = config.strategy || CompressionStrategy.COLLAPSE;
    this.collapseThreshold = config.collapseThreshold || 0.7;
    this.summaryThreshold = config.summaryThreshold || 0.9;
    this.historyWeight = config.historyWeight || 0.3;
  }

  /**
   * 压缩上下文消息
   * @param {Array} messages - 原始消息数组
   * @returns {Array} 压缩后的消息数组
   */
  compress(messages) {
    if (!messages || messages.length === 0) return [];

    // 计算当前 token 总量
    const currentTokens = this._estimateTokens(messages);
    
    if (currentTokens <= this.maxTokens) {
      return messages; // 不需要压缩
    }

    // 根据策略选择压缩方法
    switch (this.strategy) {
      case CompressionStrategy.COLLAPSE:
        return this._collapse(messages);
      case CompressionStrategy.SUMMARY:
        return this._summary(messages);
      case CompressionStrategy.HYBRID:
        return this._hybrid(messages);
      default:
        return messages;
    }
  }

  /**
   * 折叠压缩：合并相似的历史消息
   */
  _collapse(messages) {
    const result = [];
    let collapsedCount = 0;
    let lastUserMsg = null;
    let lastAssistantMsg = null;

    for (const msg of messages) {
      const role = msg.role || msg.type;
      
      if (role === 'system') {
        result.push(msg);
        continue;
      }

      // 保留最近的用户和助手消息
      if (role === 'user') {
        lastUserMsg = msg;
        result.push(msg);
      } else if (role === 'assistant') {
        lastAssistantMsg = msg;
        result.push(msg);
      } else {
        // 其他消息类型，统计但不直接保留
        collapsedCount++;
      }
    }

    // 如果有被折叠的消息，添加折叠标记
    if (collapsedCount > 0) {
      result.push({
        role: 'system',
        content: `[${collapsedCount} earlier messages collapsed for brevity]`,
      });
    }

    return result;
  }

  /**
   * 摘要压缩：需要外部 AI 配合
   */
  _summary(messages) {
    // 需要调用 AI 生成摘要
    // 这里返回带摘要请求标记的消息
    const recentMessages = messages.slice(-10);
    const olderMessages = messages.slice(0, -10);

    if (olderMessages.length === 0) return messages;

    // 简单摘要：保留消息数量和关键信息
    const summary = this._generateSimpleSummary(olderMessages);

    return [
      ...summary,
      ...recentMessages,
    ];
  }

  /**
   * 生成简单摘要
   */
  _generateSimpleSummary(messages) {
    const userMsgs = messages.filter(m => (m.role || m.type) === 'user');
    const assistantMsgs = messages.filter(m => (m.role || m.type) === 'assistant');

    return [{
      role: 'system',
      content: `[Conversation history (${messages.length} messages): ${userMsgs.length} user queries, ${assistantMsgs.length} responses]`,
    }];
  }

  /**
   * 混合压缩：折叠 + 摘要
   */
  _hybrid(messages) {
    // 先尝试折叠
    const collapsed = this._collapse(messages);
    
    // 如果还是太长，使用摘要
    if (this._estimateTokens(collapsed) > this.maxTokens) {
      return this._summary(collapsed);
    }
    
    return collapsed;
  }

  /**
   * 估算 token 数量
   * 简单估算：1 token ≈ 4 characters
   */
  _estimateTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg === 'string' ? msg : (msg.content || JSON.stringify(msg));
      total += content.length / 4;
    }
    return total;
  }

  /**
   * 计算消息重要性权重
   */
  calculateWeight(message) {
    const role = message.role || message.type || 'unknown';
    return MESSAGE_WEIGHTS[role] || 0.5;
  }

  /**
   * 检测需要压缩的时机
   */
  shouldCompress(messages) {
    const tokens = this._estimateTokens(messages);
    return tokens > this.maxTokens * this.collapseThreshold;
  }
}

/**
 * 上下文折叠器 - 更激进的压缩
 */
export class ContextCollider {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 50;
    this.keepRecent = options.keepRecent || 10;
  }

  /**
   * 折叠上下文
   */
  collapse(messages) {
    if (messages.length <= this.maxMessages) {
      return messages;
    }

    const toCollapse = messages.length - this.keepRecent;
    const recentMessages = messages.slice(-this.keepRecent);
    const olderMessages = messages.slice(0, -this.keepRecent);

    // 生成折叠摘要
    const summary = this._createCollapseSummary(olderMessages);

    return [
      ...summary,
      ...recentMessages,
    ];
  }

  /**
   * 创建折叠摘要
   */
  _createCollapseSummary(messages) {
    const stats = {
      total: messages.length,
      user: 0,
      assistant: 0,
      tools: 0,
    };

    for (const msg of messages) {
      const role = msg.role || msg.type;
      if (role === 'user') stats.user++;
      else if (role === 'assistant') stats.assistant++;
      else stats.tools++;
    }

    return [{
      role: 'system',
      content: `[Earlier conversation (${stats.total} messages collapsed): ${stats.user} questions, ${stats.assistant} responses, ${stats.tools} tool interactions]`,
    }];
  }
}

/**
 * 上下文哈希 - 用于缓存和去重
 */
export class ContextHasher {
  /**
   * 生成消息哈希
   */
  static hash(messages) {
    const content = JSON.stringify(messages);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * 检查是否重复
   */
  static isDuplicate(newMsg, existingHashes) {
    const hash = this.hash([newMsg]);
    return existingHashes.has(hash);
  }
}

export default { ContextCompressor, ContextCollider, ContextHasher, CompressionStrategy };