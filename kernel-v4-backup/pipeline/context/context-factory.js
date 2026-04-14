/**
 * 上下文工厂
 * 负责创建和管理不同类型的执行上下文
 */

import { BaseContext } from './base-context.js';
import { ExecuteContext } from './execute-context.js';
import { PollContext } from './poll-context.js';
import { TriggerContext } from './trigger-context.js';

export class ContextFactory {
  /**
   * 上下文类型映射
   */
  static contextTypes = {
    'base': BaseContext,
    'execute': ExecuteContext,
    'poll': PollContext,
    'trigger': TriggerContext
  };

  /**
   * 创建执行上下文
   * @param {string} contextType - 上下文类型
   * @param {Object} options - 上下文选项
   * @returns {BaseContext}
   */
  static create(contextType, options) {
    const ContextClass = this.contextTypes[contextType];

    if (!ContextClass) {
      throw new Error(`Unknown context type: ${contextType}`);
    }

    return new ContextClass(options);
  }

  /**
   * 从 JSON 创建执行上下文
   * @param {Object} json - JSON 对象
   * @param {Object} options - 上下文选项
   * @returns {BaseContext}
   */
  static fromJSON(json, options) {
    const contextType = json.contextType || 'base';
    const ContextClass = this.contextTypes[contextType];

    if (!ContextClass) {
      throw new Error(`Unknown context type: ${contextType}`);
    }

    if (typeof ContextClass.fromJSON === 'function') {
      return ContextClass.fromJSON(json, options);
    } else {
      return BaseContext.fromJSON(json, options);
    }
  }

  /**
   * 根据节点类型自动创建上下文
   * @param {Object} node - 节点对象
   * @param {Object} options - 上下文选项
   * @returns {BaseContext}
   */
  static createForNode(node, options) {
    const nodeType = node.type || 'execute';

    // 根据节点类型决定上下文类型
    let contextType = 'execute';

    if (nodeType.includes('poll') || nodeType.includes('trigger')) {
      if (nodeType.includes('poll')) {
        contextType = 'poll';
      } else {
        contextType = 'trigger';
      }
    }

    return this.create(contextType, options);
  }

  /**
   * 注册自定义上下文类型
   * @param {string} contextType - 上下文类型名称
   * @param {Class} ContextClass - 上下文类
   */
  static register(contextType, ContextClass) {
    if (typeof ContextClass !== 'function') {
      throw new Error('ContextClass must be a class');
    }

    if (!(ContextClass.prototype instanceof BaseContext)) {
      throw new Error('ContextClass must extend BaseContext');
    }

    this.contextTypes[contextType] = ContextClass;
  }

  /**
   * 检查上下文类型是否已注册
   * @param {string} contextType - 上下文类型名称
   * @returns {boolean}
   */
  static isRegistered(contextType) {
    return contextType in this.contextTypes;
  }

  /**
   * 获取所有已注册的上下文类型
   * @returns {Array<string>}
   */
  static getRegisteredTypes() {
    return Object.keys(this.contextTypes);
  }
}
