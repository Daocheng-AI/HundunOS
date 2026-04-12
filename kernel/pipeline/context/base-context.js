/**
 * 执行上下文基类
 * 提供所有执行上下文共有的基础功能
 */

export class BaseContext {
  /**
   * @param {Object} options - 上下文选项
   * @param {string} options.executionId - 执行ID
   * @param {string} options.nodeId - 节点ID
   * @param {Object} options.workflow - 工作流对象
   * @param {Object} options.node - 节点对象
   * @param {string} options.mode - 执行模式（'manual', 'trigger', 'webhook', 'retry', 'cli'）
   * @param {Object} options.logger - 日志记录器
   * @param {Map} options.executionStack - 执行栈
   */
  constructor({
    executionId,
    nodeId,
    workflow,
    node,
    mode,
    logger,
    executionStack
  }) {
    this.executionId = executionId;
    this.nodeId = nodeId;
    this.workflow = workflow;
    this.node = node;
    this.mode = mode;
    this.logger = logger;
    this.executionStack = executionStack;
    this._contextData = new Map();
  }

  /**
   * 获取执行ID
   * @returns {string}
   */
  getExecutionId() {
    return this.executionId;
  }

  /**
   * 获取节点ID
   * @returns {string}
   */
  getNodeId() {
    return this.nodeId;
  }

  /**
   * 获取节点信息
   * @returns {Object}
   */
  getNode() {
    return { ...this.node };
  }

  /**
   * 获取工作流信息
   * @returns {Object}
   */
  getWorkflow() {
    const { id, name, version } = this.workflow;
    return { id, name, version };
  }

  /**
   * 获取执行模式
   * @returns {string}
   */
  getMode() {
    return this.mode;
  }

  /**
   * 获取日志记录器
   * @returns {Object}
   */
  getLogger() {
    return this.logger;
  }

  /**
   * 获取执行栈
   * @returns {Map}
   */
  getExecutionStack() {
    return this.executionStack;
  }

  /**
   * 获取上下文数据
   * @param {string} key - 数据键
   * @returns {*} 数据值
   */
  getContextData(key) {
    return this._contextData.get(key);
  }

  /**
   * 设置上下文数据
   * @param {string} key - 数据键
   * @param {*} value - 数据值
   */
  setContextData(key, value) {
    this._contextData.set(key, value);
  }

  /**
   * 获取节点参数
   * @param {string} parameterName - 参数名称
   * @param {*} fallbackValue - 默认值
   * @returns {*} 参数值
   */
  getNodeParameter(parameterName, fallbackValue) {
    const value = this.node.parameters?.[parameterName];
    return value !== undefined ? value : fallbackValue;
  }

  /**
   * 获取节点输出
   * @param {string} nodeId - 节点ID
   * @returns {*} 节点输出
   */
  getNodeOutput(nodeId) {
    const frame = this.executionStack.get(nodeId);
    return frame?.output ?? null;
  }

  /**
   * 检查节点是否已完成
   * @param {string} nodeId - 节点ID
   * @returns {boolean}
   */
  isNodeCompleted(nodeId) {
    return this.executionStack.isCompleted(nodeId);
  }

  /**
   * 检查节点是否失败
   * @param {string} nodeId - 节点ID
   * @returns {boolean}
   */
  isNodeFailed(nodeId) {
    return this.executionStack.isFailed(nodeId);
  }

  /**
   * 获取执行进度
   * @returns {Object} 进度对象
   */
  getProgress() {
    return {
      completed: this.executionStack.getCompletedNodes().size,
      failed: this.executionStack.getFailedNodes().size,
      total: this.workflow.nodes.length,
      percentage: this.executionStack.getProgress()
    };
  }

  /**
   * 序列化上下文
   * @returns {Object}
   */
  toJSON() {
    return {
      executionId: this.executionId,
      nodeId: this.nodeId,
      mode: this.mode,
      contextData: Object.fromEntries(this._contextData)
    };
  }

  /**
   * 从JSON反序列化上下文
   * @param {Object} json - JSON对象
   * @returns {BaseContext}
   */
  static fromJSON(json, options) {
    const context = new BaseContext(options);
    context._contextData = new Map(Object.entries(json.contextData));
    return context;
  }
}
