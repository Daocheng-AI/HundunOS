/**
 * Execute 上下文
 * 用于常规节点执行
 */

import { BaseContext } from './base-context.js';

export class ExecuteContext extends BaseContext {
  /**
   * @param {Object} options - 上下文选项
   * @param {string} options.executionId - 执行ID
   * @param {string} options.nodeId - 节点ID
   * @param {Object} options.workflow - 工作流对象
   * @param {Object} options.node - 节点对象
   * @param {string} options.mode - 执行模式
   * @param {Object} options.logger - 日志记录器
   * @param {Map} options.executionStack - 执行栈
   * @param {Array} options.inputData - 输入数据
   * @param {Object} options.metadata - 执行元数据
   */
  constructor(options) {
    super(options);
    this.inputData = options.inputData || [];
    this.metadata = options.metadata || {};
    this._startTimestamp = Date.now();
  }

  /**
   * 获取输入数据
   * @returns {Array}
   */
  getInputData() {
    return this.inputData;
  }

  /**
   * 设置输入数据
   * @param {Array} data - 输入数据
   */
  setInputData(data) {
    this.inputData = data;
  }

  /**
   * 获取输入项
   * @param {number} index - 索引
   * @returns {*} 输入项
   */
  getInputItem(index) {
    return this.inputData[index];
  }

  /**
   * 添加输入项
   * @param {*} item - 输入项
   */
  addInputItem(item) {
    this.inputData.push(item);
  }

  /**
   * 获取元数据
   * @returns {Object}
   */
  getMetadata() {
    return { ...this.metadata };
  }

  /**
   * 设置元数据
   * @param {Object} metadata - 元数据
   */
  setMetadata(metadata) {
    this.metadata = { ...this.metadata, ...metadata };
  }

  /**
   * 获取执行开始时间戳
   * @returns {number}
   */
  getStartTimestamp() {
    return this._startTimestamp;
  }

  /**
   * 获取执行持续时间（毫秒）
   * @returns {number}
   */
  getDuration() {
    return Date.now() - this._startTimestamp;
  }

  /**
   * 获取子节点
   * @param {string} nodeName - 节点名称
   * @returns {Array} 子节点列表
   */
  getChildNodes(nodeName) {
    // 简化实现，实际需要根据工作流结构查找
    return [];
  }

  /**
   * 获取父节点
   * @param {string} nodeName - 节点名称
   * @returns {Array} 父节点列表
   */
  getParentNodes(nodeName) {
    // 简化实现，实际需要根据工作流结构查找
    return [];
  }

  /**
   * 继续执行（即使出错）
   * @returns {boolean}
   */
  continueOnFail() {
    return this.node.parameters?.continueOnFail ?? false;
  }

  /**
   * 重试执行
   * @param {number} maxRetries - 最大重试次数
   * @returns {boolean} 是否可以重试
   */
  canRetry(maxRetries = 3) {
    const retryCount = this.metadata.retryCount || 0;
    return retryCount < maxRetries;
  }

  /**
   * 增加重试计数
   */
  incrementRetryCount() {
    this.metadata.retryCount = (this.metadata.retryCount || 0) + 1;
  }

  /**
   * 获取重试次数
   * @returns {number}
   */
  getRetryCount() {
    return this.metadata.retryCount || 0;
  }

  /**
   * 序列化上下文
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      inputData: this.inputData,
      metadata: this.metadata,
      startTimestamp: this._startTimestamp,
      duration: this.getDuration(),
      contextType: 'execute'
    };
  }

  /**
   * 从JSON反序列化上下文
   * @param {Object} json - JSON对象
   * @returns {ExecuteContext}
   */
  static fromJSON(json, options) {
    const context = new ExecuteContext(options);
    context.inputData = json.inputData || [];
    context.metadata = json.metadata || {};
    context._startTimestamp = json.startTimestamp;
    context._contextData = new Map(Object.entries(json.contextData));
    return context;
  }
}
