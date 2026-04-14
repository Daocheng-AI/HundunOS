/**
 * 分布式追踪系统
 * 提供跨服务的分布式追踪能力
 */

/**
 * Span 状态枚举
 */
export const SpanStatus = {
  OK: 'ok',
  ERROR: 'error',
  UNSET: 'unset'
};

/**
 * 常见的追踪属性名称
 */
export const COMMON_TRACE_ATTRIBUTES = {
  workflow: {
    id: 'hundunos.workflow.id',
    name: 'hundunos.workflow.name',
    version: 'hundunos.workflow.version'
  },
  node: {
    id: 'hundunos.node.id',
    name: 'hundunos.node.name',
    type: 'hundunos.node.type',
    typeVersion: 'hundunos.node.type_version'
  },
  execution: {
    id: 'hundunos.execution.id',
    mode: 'hundunos.execution.mode',
    retryCount: 'hundunos.execution.retry_count'
  },
  error: {
    type: 'hundunos.error.type',
    message: 'hundunos.error.message'
  }
};

/**
 * 空的 Span 实现（不执行任何追踪）
 */
export class EmptySpan {
  constructor() {
    this._context = {
      traceId: '00000000000000000000000000000000',
      spanId: '0000000000000000',
      traceFlags: 0
    };
  }

  /**
   * 获取 Span 上下文
   * @returns {Object}
   */
  spanContext() {
    return this._context;
  }

  /**
   * 结束 Span
   */
  end() {
    // noop
  }

  /**
   * 设置属性
   * @param {string} key - 属性键
   * @param {*} value - 属性值
   * @returns {this}
   */
  setAttribute(key, value) {
    return this;
  }

  /**
   * 批量设置属性
   * @param {Object} attributes - 属性对象
   * @returns {this}
   */
  setAttributes(attributes) {
    return this;
  }

  /**
   * 设置状态
   * @param {Object} status - 状态对象
   * @returns {this}
   */
  setStatus(status) {
    return this;
  }

  /**
   * 更新名称
   * @param {string} name - 新名称
   * @returns {this}
   */
  updateName(name) {
    return this;
  }

  /**
   * 是否正在记录
   * @returns {boolean}
   */
  isRecording() {
    return false;
  }

  /**
   * 添加事件
   * @param {string} name - 事件名称
   * @param {Object} attributes - 事件属性
   * @returns {this}
   */
  addEvent(name, attributes = {}) {
    return this;
  }

  /**
   * 记录异常
   * @param {Error} exception - 异常对象
   */
  recordException(exception) {
    // noop
  }

  /**
   * 获取持续时间（毫秒）
   * @returns {number}
   */
  getDuration() {
    return 0;
  }

  /**
   * 获取开始时间
   * @returns {number}
   */
  getStartTime() {
    return 0;
  }

  /**
   * 获取结束时间
   * @returns {number}
   */
  getEndTime() {
    return 0;
  }

  /**
   * 获取所有属性
   * @returns {Object}
   */
  getAttributes() {
    return {};
  }

  /**
   * 获取所有事件
   * @returns {Array}
   */
  getEvents() {
    return [];
  }

  /**
   * 获取状态
   * @returns {Object}
   */
  getStatus() {
    return { code: SpanStatus.UNSET };
  }
}

/**
 * 真实的 Span 实现
 */
export class RealSpan {
  /**
   * @param {string} name - Span 名称
   * @param {Object} options - Span 选项
   * @param {Object} options.attributes - 初始属性
   * @param {string} options.parentSpanId - 父 Span ID
   * @param {number} options.startTime - 开始时间戳
   */
  constructor(name, options = {}) {
    this.name = name;
    this.attributes = { ...options.attributes };
    this.parentSpanId = options.parentSpanId;
    this.startTime = options.startTime || Date.now();
    this.endTime = null;
    this.events = [];
    this.status = { code: SpanStatus.UNSET };
    this._context = this._generateContext();
  }

  /**
   * 生成 Span 上下文
   * @returns {Object}
   */
  _generateContext() {
    return {
      traceId: this._generateTraceId(),
      spanId: this._generateSpanId(),
      traceFlags: 1
    };
  }

  /**
   * 生成 Trace ID
   * @returns {string}
   */
  _generateTraceId() {
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  /**
   * 生成 Span ID
   * @returns {string}
   */
  _generateSpanId() {
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  /**
   * 获取 Span 上下文
   * @returns {Object}
   */
  spanContext() {
    return this._context;
  }

  /**
   * 结束 Span
   */
  end() {
    if (this.endTime === null) {
      this.endTime = Date.now();
    }
  }

  /**
   * 设置属性
   * @param {string} key - 属性键
   * @param {*} value - 属性值
   * @returns {this}
   */
  setAttribute(key, value) {
    this.attributes[key] = value;
    return this;
  }

  /**
   * 批量设置属性
   * @param {Object} attributes - 属性对象
   * @returns {this}
   */
  setAttributes(attributes) {
    Object.assign(this.attributes, attributes);
    return this;
  }

  /**
   * 设置状态
   * @param {Object} status - 状态对象
   * @returns {this}
   */
  setStatus(status) {
    this.status = { ...status };
    return this;
  }

  /**
   * 更新名称
   * @param {string} name - 新名称
   * @returns {this}
   */
  updateName(name) {
    this.name = name;
    return this;
  }

  /**
   * 是否正在记录
   * @returns {boolean}
   */
  isRecording() {
    return this.endTime === null;
  }

  /**
   * 添加事件
   * @param {string} name - 事件名称
   * @param {Object} attributes - 事件属性
   * @returns {this}
   */
  addEvent(name, attributes = {}) {
    this.events.push({
      name,
      attributes,
      timestamp: Date.now()
    });
    return this;
  }

  /**
   * 记录异常
   * @param {Error} exception - 异常对象
   */
  recordException(exception) {
    this.addEvent('exception', {
      'exception.type': exception.constructor.name,
      'exception.message': exception.message,
      'exception.stacktrace': exception.stack
    });
    this.setStatus({
      code: SpanStatus.ERROR,
      message: exception.message
    });
  }

  /**
   * 获取持续时间（毫秒）
   * @returns {number}
   */
  getDuration() {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  /**
   * 获取开始时间
   * @returns {number}
   */
  getStartTime() {
    return this.startTime;
  }

  /**
   * 获取结束时间
   * @returns {number}
   */
  getEndTime() {
    return this.endTime || Date.now();
  }

  /**
   * 获取所有属性
   * @returns {Object}
   */
  getAttributes() {
    return { ...this.attributes };
  }

  /**
   * 获取所有事件
   * @returns {Array}
   */
  getEvents() {
    return [...this.events];
  }

  /**
   * 获取状态
   * @returns {Object}
   */
  getStatus() {
    return { ...this.status };
  }

  /**
   * 序列化为 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      context: this._context,
      parentSpanId: this.parentSpanId,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.getDuration(),
      attributes: this.attributes,
      events: this.events,
      status: this.status
    };
  }
}

/**
 * 追踪器接口
 */
class Tracer {
  /**
   * 启动一个 Span 并执行回调
   * @param {Object} options - Span 选项
   * @param {string} options.name - Span 名称
   * @param {Object} options.attributes - Span 属性
   * @param {string} options.parentSpanId - 父 Span ID
   * @param {Function} spanCb - Span 回调函数
   * @returns {Promise<*>}
   */
  async startSpan(options, spanCb) {
    throw new Error('Tracer.startSpan must be implemented');
  }
}

/**
 * 空操作追踪器（不执行任何追踪）
 */
export class NoopTracer extends Tracer {
  constructor() {
    super();
    this.emptySpan = new EmptySpan();
  }

  /**
   * 启动一个 Span 并执行回调
   * @param {Object} options - Span 选项
   * @param {Function} spanCb - Span 回调函数
   * @returns {Promise<*>}
   */
  async startSpan(options, spanCb) {
    return await spanCb(this.emptySpan);
  }
}

/**
 * 真实追踪器
 */
export class RealTracer extends Tracer {
  /**
   * @param {Object} options - 追踪器选项
   * @param {Object} options.logger - 日志记录器
   */
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
  }

  /**
   * 启动一个 Span 并执行回调
   * @param {Object} options - Span 选项
   * @param {Function} spanCb - Span 回调函数
   * @returns {Promise<*>}
   */
  async startSpan(options, spanCb) {
    const span = new RealSpan(options.name, options);

    try {
      this.logger.debug(`Starting span: ${options.name}`);
      const result = await spanCb(span);
      span.end();
      this.logger.debug(`Completed span: ${options.name} (${span.getDuration()}ms)`);
      return result;
    } catch (error) {
      span.recordException(error);
      span.end();
      this.logger.error(`Failed span: ${options.name}`, error);
      throw error;
    }
  }
}

/**
 * 追踪管理器
 * 提供统一的追踪接口
 */
export class Tracing {
  /**
   * @param {Object} options - 追踪管理器选项
   * @param {Object} options.logger - 日志记录器
   * @param {boolean} options.enabled - 是否启用追踪
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.enabled = options.enabled ?? true;
    this.tracer = this.enabled ? new RealTracer({ logger: this.logger }) : new NoopTracer();
    this.commonAttrs = COMMON_TRACE_ATTRIBUTES;
  }

  /**
   * 设置追踪器实现
   * @param {Tracer} tracer - 追踪器实例
   */
  setTracer(tracer) {
    this.tracer = tracer;
  }

  /**
   * 启用追踪
   */
  enable() {
    this.enabled = true;
    this.tracer = new RealTracer({ logger: this.logger });
  }

  /**
   * 禁用追踪
   */
  disable() {
    this.enabled = false;
    this.tracer = new NoopTracer();
  }

  /**
   * 启动一个 Span 并执行回调
   * @param {Object} options - Span 选项
   * @param {string} options.name - Span 名称
   * @param {Object} options.attributes - Span 属性
   * @param {string} options.parentSpanId - 父 Span ID
   * @param {Function} spanCb - Span 回调函数
   * @returns {Promise<*>}
   */
  async startSpan(options, spanCb) {
    return await this.tracer.startSpan(options, spanCb);
  }

  /**
   * 提取工作流的通用属性
   * @param {Object} workflow - 工作流对象
   * @returns {Object}
   */
  pickWorkflowAttributes(workflow) {
    return {
      [this.commonAttrs.workflow.id]: workflow.id,
      [this.commonAttrs.workflow.name]: workflow.name,
      [this.commonAttrs.workflow.version]: workflow.version
    };
  }

  /**
   * 提取节点的通用属性
   * @param {Object} node - 节点对象
   * @returns {Object}
   */
  pickNodeAttributes(node) {
    return {
      [this.commonAttrs.node.id]: node.id,
      [this.commonAttrs.node.name]: node.name,
      [this.commonAttrs.node.type]: node.type,
      [this.commonAttrs.node.typeVersion]: node.typeVersion
    };
  }

  /**
   * 提取执行的通用属性
   * @param {Object} execution - 执行对象
   * @returns {Object}
   */
  pickExecutionAttributes(execution) {
    return {
      [this.commonAttrs.execution.id]: execution.id,
      [this.commonAttrs.execution.mode]: execution.mode,
      [this.commonAttrs.execution.retryCount]: execution.retryCount || 0
    };
  }

  /**
   * 提取错误的通用属性
   * @param {Error} error - 错误对象
   * @returns {Object}
   */
  pickErrorAttributes(error) {
    return {
      [this.commonAttrs.error.type]: error.constructor.name,
      [this.commonAttrs.error.message]: error.message
    };
  }
}

// 导出单例实例
export const tracing = new Tracing();
