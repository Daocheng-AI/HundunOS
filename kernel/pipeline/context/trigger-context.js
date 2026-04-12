/**
 * Trigger 上下文
 * 用于触发器节点执行
 */

import { BaseContext } from './base-context.js';

export class TriggerContext extends BaseContext {
  /**
   * @param {Object} options - 上下文选项
   * @param {string} options.executionId - 执行ID
   * @param {string} options.nodeId - 节点ID
   * @param {Object} options.workflow - 工作流对象
   * @param {Object} options.node - 节点对象
   * @param {string} options.mode - 执行模式
   * @param {Object} options.logger - 日志记录器
   * @param {Map} options.executionStack - 执行栈
   * @param {string} options.activationMode - 激活模式
   * @param {Function} options.emit - 发射数据的回调函数
   * @param {Function} options.emitError - 发射错误的回调函数
   * @param {Function} options.saveFailedExecution - 保存失败执行的回调函数
   */
  constructor(options) {
    super(options);
    this.activationMode = options.activationMode || 'manual';
    this._emit = options.emit || (() => {
      throw new Error('TriggerContext: emit function not provided');
    });
    this._emitError = options.emitError || (() => {
      throw new Error('TriggerContext: emitError function not provided');
    });
    this._saveFailedExecution = options.saveFailedExecution || (() => {
      throw new Error('TriggerContext: saveFailedExecution function not provided');
    });
    this._triggerCount = 0;
    this._lastTriggerTime = null;
  }

  /**
   * 获取激活模式
   * @returns {string}
   */
  getActivationMode() {
    return this.activationMode;
  }

  /**
   * 发射数据
   * @param {Array} data - 要发射的数据
   * @returns {Promise<void>}
   */
  async emit(data) {
    this._triggerCount++;
    this._lastTriggerTime = new Date().toISOString();
    return await this._emit(data);
  }

  /**
   * 发射错误
   * @param {Error} error - 错误对象
   * @returns {Promise<void>}
   */
  async emitError(error) {
    return await this._emitError(error);
  }

  /**
   * 保存失败执行
   * @param {Error} error - 错误对象
   * @param {Object} executionData - 执行数据
   * @returns {Promise<void>}
   */
  async saveFailedExecution(error, executionData) {
    return await this._saveFailedExecution(error, executionData);
  }

  /**
   * 获取触发次数
   * @returns {number}
   */
  getTriggerCount() {
    return this._triggerCount;
  }

  /**
   * 获取上次触发时间
   * @returns {string|null}
   */
  getLastTriggerTime() {
    return this._lastTriggerTime;
  }

  /**
   * 重置触发计数
   */
  resetTriggerCount() {
    this._triggerCount = 0;
  }

  /**
   * 获取触发器配置
   * @returns {Object}
   */
  getTriggerConfig() {
    return this.getNodeParameter('triggerConfig', {});
  }

  /**
   * 检查触发器是否应该激活
   * @returns {boolean}
   */
  shouldActivate() {
    const config = this.getTriggerConfig();
    // 根据配置判断是否应该激活
    return true;
  }

  /**
   * 获取触发器类型
   * @returns {string}
   */
  getTriggerType() {
    return this.node.type || 'manual';
  }

  /**
   * 序列化上下文
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      activationMode: this.activationMode,
      triggerCount: this._triggerCount,
      lastTriggerTime: this._lastTriggerTime,
      contextType: 'trigger'
    };
  }

  /**
   * 从JSON反序列化上下文
   * @param {Object} json - JSON对象
   * @returns {TriggerContext}
   */
  static fromJSON(json, options) {
    const context = new TriggerContext(options);
    context.activationMode = json.activationMode;
    context._triggerCount = json.triggerCount || 0;
    context._lastTriggerTime = json.lastTriggerTime;
    context._contextData = new Map(Object.entries(json.contextData));
    return context;
  }
}
