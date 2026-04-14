/**
 * 上下文管理器
 * 负责管理执行上下文的生命周期和继承机制
 */

import { ContextFactory } from './context-factory.js';

export class ContextManager {
  /**
   * @param {Object} options - 管理器选项
   * @param {Object} options.logger - 日志记录器
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this._contexts = new Map(); // executionId -> nodeId -> context
    this._parentContexts = new Map(); // executionId -> parent execution context
  }

  /**
   * 创建上下文
   * @param {string} executionId - 执行ID
   * @param {string} nodeId - 节点ID
   * @param {string} contextType - 上下文类型
   * @param {Object} options - 上下文选项
   * @returns {BaseContext}
   */
  createContext(executionId, nodeId, contextType, options) {
    // 确保执行ID的上下文映射存在
    if (!this._contexts.has(executionId)) {
      this._contexts.set(executionId, new Map());
    }

    // 创建上下文
    const context = ContextFactory.create(contextType, {
      executionId,
      nodeId,
      ...options
    });

    // 保存上下文
    this._contexts.get(executionId).set(nodeId, context);

    this.logger.debug(`Created ${contextType} context for node ${nodeId} in execution ${executionId}`);

    return context;
  }

  /**
   * 获取上下文
   * @param {string} executionId - 执行ID
   * @param {string} nodeId - 节点ID
   * @returns {BaseContext|undefined}
   */
  getContext(executionId, nodeId) {
    const executionContexts = this._contexts.get(executionId);
    return executionContexts?.get(nodeId);
  }

  /**
   * 获取执行的所有上下文
   * @param {string} executionId - 执行ID
   * @returns {Map<string, BaseContext>}
   */
  getExecutionContexts(executionId) {
    return this._contexts.get(executionId) || new Map();
  }

  /**
   * 删除上下文
   * @param {string} executionId - 执行ID
   * @param {string} nodeId - 节点ID
   */
  removeContext(executionId, nodeId) {
    const executionContexts = this._contexts.get(executionId);
    if (executionContexts) {
      executionContexts.delete(nodeId);

      // 如果执行没有上下文了，删除执行的映射
      if (executionContexts.size === 0) {
        this._contexts.delete(executionId);
      }
    }
  }

  /**
   * 清除执行的所有上下文
   * @param {string} executionId - 执行ID
   */
  clearExecutionContexts(executionId) {
    this._contexts.delete(executionId);
    this._parentContexts.delete(executionId);
  }

  /**
   * 设置父执行上下文
   * @param {string} executionId - 子执行ID
   * @param {Object} parentContext - 父执行上下文
   */
  setParentContext(executionId, parentContext) {
    this._parentContexts.set(executionId, parentContext);
  }

  /**
   * 获取父执行上下文
   * @param {string} executionId - 子执行ID
   * @returns {Object|undefined}
   */
  getParentContext(executionId) {
    return this._parentContexts.get(executionId);
  }

  /**
   * 创建子执行上下文
   * @param {string} parentExecutionId - 父执行ID
   * @param {string} childExecutionId - 子执行ID
   * @param {string} nodeId - 节点ID
   * @param {string} contextType - 上下文类型
   * @param {Object} options - 上下文选项
   * @returns {BaseContext}
   */
  createChildContext(parentExecutionId, childExecutionId, nodeId, contextType, options) {
    // 获取父执行上下文
    const parentContext = this._parentContexts.get(parentExecutionId);

    // 创建子执行上下文，继承父上下文的数据
    const childContext = this.createContext(childExecutionId, nodeId, contextType, {
      ...options,
      parentContext
    });

    // 设置父执行上下文
    this.setParentContext(childExecutionId, {
      executionId: parentExecutionId,
      contextData: parentContext?.getContextData ? parentContext.getContextData() : {}
    });

    return childContext;
  }

  /**
   * 序列化执行的所有上下文
   * @param {string} executionId - 执行ID
   * @returns {Object}
   */
  serializeExecutionContexts(executionId) {
    const executionContexts = this._contexts.get(executionId);
    if (!executionContexts) {
      return null;
    }

    const serialized = {};
    for (const [nodeId, context] of executionContexts) {
      serialized[nodeId] = context.toJSON();
    }

    return serialized;
  }

  /**
   * 从 JSON 反序列化执行的所有上下文
   * @param {string} executionId - 执行ID
   * @param {Object} json - JSON 对象
   * @returns {Map<string, BaseContext>}
   */
  deserializeExecutionContexts(executionId, json) {
    if (!json || typeof json !== 'object') {
      return new Map();
    }

    const contexts = new Map();

    for (const [nodeId, contextJson] of Object.entries(json)) {
      try {
        const context = ContextFactory.fromJSON(contextJson, {
          executionId,
          nodeId,
          logger: this.logger
        });
        contexts.set(nodeId, context);
      } catch (error) {
        this.logger.error(`Failed to deserialize context for node ${nodeId}:`, error);
      }
    }

    this._contexts.set(executionId, contexts);

    return contexts;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalExecutionContexts: this._contexts.size,
      totalContexts: 0,
      contextsByType: {}
    };

    for (const contexts of this._contexts.values()) {
      stats.totalContexts += contexts.size;

      for (const context of contexts.values()) {
        const type = context.constructor.name;
        stats.contextsByType[type] = (stats.contextsByType[type] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * 清理所有上下文
   */
  clearAll() {
    this._contexts.clear();
    this._parentContexts.clear();
    this.logger.debug('Cleared all execution contexts');
  }
}
