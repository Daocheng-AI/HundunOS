/**
 * Poll 上下文
 * 用于轮询节点执行
 */

import { BaseContext } from './base-context.js';

export class PollContext extends BaseContext {
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
   */
  constructor(options) {
    super(options);
    this.activationMode = options.activationMode || 'manual';
    this._emit = options.emit || (() => {
      throw new Error('PollContext: emit function not provided');
    });
    this._emitError = options.emitError || (() => {
      throw new Error('PollContext: emitError function not provided');
    });
    this._lastPollTime = null;
    this._pollCount = 0;
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
    this._pollCount++;
    this._lastPollTime = new Date().toISOString();
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
   * 获取上次轮询时间
   * @returns {string|null}
   */
  getLastPollTime() {
    return this._lastPollTime;
  }

  /**
   * 获取轮询次数
   * @returns {number}
   */
  getPollCount() {
    return this._pollCount;
  }

  /**
   * 重置轮询计数
   */
  resetPollCount() {
    this._pollCount = 0;
  }

  /**
   * 获取轮询间隔（从节点参数中读取）
   * @returns {number} 间隔（毫秒）
   */
  getPollInterval() {
    return this.getNodeParameter('pollInterval', 60000);
  }

  /**
   * 检查是否应该轮询
   * @returns {boolean}
   */
  shouldPoll() {
    if (!this._lastPollTime) {
      return true;
    }

    const lastTime = new Date(this._lastPollTime).getTime();
    const now = Date.now();
    const interval = this.getPollInterval();

    return (now - lastTime) >= interval;
  }

  /**
   * 等待下一次轮询
   * @returns {Promise<void>}
   */
  async waitForNextPoll() {
    const interval = this.getPollInterval();
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  /**
   * 序列化上下文
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      activationMode: this.activationMode,
      lastPollTime: this._lastPollTime,
      pollCount: this._pollCount,
      contextType: 'poll'
    };
  }

  /**
   * 从JSON反序列化上下文
   * @param {Object} json - JSON对象
   * @returns {PollContext}
   */
  static fromJSON(json, options) {
    const context = new PollContext(options);
    context.activationMode = json.activationMode;
    context._lastPollTime = json.lastPollTime;
    context._pollCount = json.pollCount || 0;
    context._contextData = new Map(Object.entries(json.contextData));
    return context;
  }
}
