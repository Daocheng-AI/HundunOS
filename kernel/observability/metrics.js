// hundunos/kernel/observability/metrics.js
// 基础指标系统

/**
 * 指标类型
 */
const MetricType = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  SUMMARY: 'summary'
};

/**
 * 指标类
 */
export class Metric {
  /**
   * 构造函数
   * @param {string} name - 指标名称
   * @param {string} type - 指标类型
   * @param {string} help - 指标描述
   * @param {string[]} [labels] - 标签名称
   */
  constructor(name, type, help, labels = []) {
    this.name = name;
    this.type = type;
    this.help = help;
    this.labels = labels;
    this.value = 0;
    this.values = new Map();
  }

  /**
   * 设置标签值
   * @param {Object} labelValues - 标签值
   * @returns {string} 标签键
   */
  _getLabelKey(labelValues) {
    return JSON.stringify(labelValues);
  }

  /**
   * 增加计数器
   * @param {number} [value] - 增加的值
   * @param {Object} [labelValues] - 标签值
   */
  inc(value = 1, labelValues = {}) {
    const key = this._getLabelKey(labelValues);
    const currentValue = this.values.get(key) || 0;
    this.values.set(key, currentValue + value);
    this.value += value;
  }

  /**
   * 设置仪表盘值
   * @param {number} value - 值
   * @param {Object} [labelValues] - 标签值
   */
  set(value, labelValues = {}) {
    const key = this._getLabelKey(labelValues);
    const oldValue = this.values.get(key) || 0;
    this.values.set(key, value);
    this.value = this.value - oldValue + value;
  }

  /**
   * 记录直方图值
   * @param {number} value - 值
   * @param {Object} [labelValues] - 标签值
   */
  observe(value, labelValues = {}) {
    const key = this._getLabelKey(labelValues);
    const currentValues = this.values.get(key) || [];
    currentValues.push(value);
    this.values.set(key, currentValues);
  }

  /**
   * 获取指标值
   * @param {Object} [labelValues] - 标签值
   * @returns {number} 指标值
   */
  get(labelValues) {
    if (labelValues) {
      const key = this._getLabelKey(labelValues);
      return this.values.get(key) || 0;
    }
    return this.value;
  }

  /**
   * 重置指标
   */
  reset() {
    this.value = 0;
    this.values.clear();
  }

  /**
   * 导出为 Prometheus 格式
   * @returns {string} Prometheus 格式字符串
   */
  toPrometheus() {
    let output = `# HELP ${this.name} ${this.help}\n`;
    output += `# TYPE ${this.name} ${this.type}\n`;

    if (this.values.size === 0) {
      output += `${this.name} ${this.value}\n`;
    } else {
      for (const [key, value] of this.values.entries()) {
        const labelValues = JSON.parse(key);
        const labels = Object.entries(labelValues)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        output += `${this.name}{${labels}} ${value}\n`;
      }
    }

    return output;
  }
}

/**
 * 指标注册表
 */
export class MetricRegistry {
  /**
   * 构造函数
   */
  constructor() {
    this.metrics = new Map();
  }

  /**
   * 创建计数器
   * @param {string} name - 指标名称
   * @param {string} help - 指标描述
   * @param {string[]} [labels] - 标签名称
   * @returns {Metric} 指标对象
   */
  createCounter(name, help, labels) {
    return this._createMetric(name, MetricType.COUNTER, help, labels);
  }

  /**
   * 创建仪表盘
   * @param {string} name - 指标名称
   * @param {string} help - 指标描述
   * @param {string[]} [labels] - 标签名称
   * @returns {Metric} 指标对象
   */
  createGauge(name, help, labels) {
    return this._createMetric(name, MetricType.GAUGE, help, labels);
  }

  /**
   * 创建直方图
   * @param {string} name - 指标名称
   * @param {string} help - 指标描述
   * @param {string[]} [labels] - 标签名称
   * @returns {Metric} 指标对象
   */
  createHistogram(name, help, labels) {
    return this._createMetric(name, MetricType.HISTOGRAM, help, labels);
  }

  /**
   * 创建指标
   * @param {string} name - 指标名称
   * @param {string} type - 指标类型
   * @param {string} help - 指标描述
   * @param {string[]} [labels] - 标签名称
   * @returns {Metric} 指标对象
   * @private
   */
  _createMetric(name, type, help, labels) {
    if (this.metrics.has(name)) {
      return this.metrics.get(name);
    }

    const metric = new Metric(name, type, help, labels);
    this.metrics.set(name, metric);
    return metric;
  }

  /**
   * 获取指标
   * @param {string} name - 指标名称
   * @returns {Metric|undefined} 指标对象
   */
  getMetric(name) {
    return this.metrics.get(name);
  }

  /**
   * 导出所有指标为 Prometheus 格式
   * @returns {string} Prometheus 格式字符串
   */
  toPrometheus() {
    let output = '';
    for (const metric of this.metrics.values()) {
      output += metric.toPrometheus() + '\n';
    }
    return output;
  }

  /**
   * 重置所有指标
   */
  reset() {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }

  /**
   * 获取所有指标名称
   * @returns {string[]} 指标名称列表
   */
  getMetricNames() {
    return Array.from(this.metrics.keys());
  }

  /**
   * 获取指标数量
   * @returns {number} 指标数量
   */
  size() {
    return this.metrics.size;
  }
}

/**
 * 全局指标注册表
 */
export const globalRegistry = new MetricRegistry();

export { MetricType };
