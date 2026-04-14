/**
 * Pipeline 可观测性集成
 * 为 Pipeline Stage 自动创建 trace span 并记录 metrics
 */

import { tracing, SpanStatus } from './tracing.js';
import { globalRegistry } from '../../observability/metrics.js';

/**
 * Pipeline 可观测性管理器
 */
export class PipelineObservability {
  /**
   * @param {Object} options - 选项
   * @param {Object} options.logger - 日志记录器
   * @param {Object} options.tracing - 追踪管理器
   * @param {Object} options.metrics - 指标管理器
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.tracing = options.tracing || tracing;
    this.metrics = options.metrics || globalRegistry;

    // 初始化 Pipeline 相关的 metrics
    this._initializeMetrics();
  }

  /**
   * 初始化 Pipeline metrics
   * @private
   */
  _initializeMetrics() {
    // Pipeline 执行计数器
    this.metrics.createCounter('hundunos_pipeline_executions_total',
      'Total number of pipeline executions',
      ['workflow_id', 'workflow_name', 'status']
    );

    // Pipeline 执行持续时间直方图
    this.metrics.createHistogram('hundunos_pipeline_execution_duration_seconds',
      'Pipeline execution duration in seconds',
      ['workflow_id', 'workflow_name']
    );

    // Pipeline 节点执行计数器
    this.metrics.createCounter('hundunos_pipeline_node_executions_total',
      'Total number of node executions',
      ['workflow_id', 'node_id', 'node_type', 'status']
    );

    // Pipeline 节点执行持续时间直方图
    this.metrics.createHistogram('hundunos_pipeline_node_execution_duration_seconds',
      'Node execution duration in seconds',
      ['workflow_id', 'node_id', 'node_type']
    );

    // Pipeline 重试计数器
    this.metrics.createCounter('hundunos_pipeline_retries_total',
      'Total number of pipeline retries',
      ['workflow_id', 'node_id']
    );

    // Pipeline 错误计数器
    this.metrics.createCounter('hundunos_pipeline_errors_total',
      'Total number of pipeline errors',
      ['workflow_id', 'node_id', 'error_type']
    );
  }

  /**
   * 包装 Pipeline 执行，自动创建 span 和记录 metrics
   * @param {Object} workflow - 工作流对象
   * @param {Object} execution - 执行对象
   * @param {Function} executeFn - 执行函数
   * @returns {Promise<*>}
   */
  async observePipelineExecution(workflow, execution, executeFn) {
    const workflowAttrs = this.tracing.pickWorkflowAttributes(workflow);
    const executionAttrs = this.tracing.pickExecutionAttributes(execution);

    const startTime = Date.now();

    return await this.tracing.startSpan({
      name: `pipeline_execution:${workflow.name}`,
      attributes: {
        ...workflowAttrs,
        ...executionAttrs,
        'pipeline.type': 'execution'
      }
    }, async (span) => {
      try {
        const result = await executeFn(span);

        // 记录成功的 metrics
        const duration = (Date.now() - startTime) / 1000; // 转换为秒
        const counter = this.metrics.getMetric('hundunos_pipeline_executions_total');
        counter.inc(1, {
          workflow_id: workflow.id,
          workflow_name: workflow.name,
          status: 'success'
        });
        const histogram = this.metrics.getMetric('hundunos_pipeline_execution_duration_seconds');
        histogram.observe(duration, {
          workflow_id: workflow.id,
          workflow_name: workflow.name
        });

        span.setStatus({ code: SpanStatus.OK });
        return result;
      } catch (error) {
        // 记录失败的 metrics
        const duration = (Date.now() - startTime) / 1000;
        const counter = this.metrics.getMetric('hundunos_pipeline_executions_total');
        counter.inc(1, {
          workflow_id: workflow.id,
          workflow_name: workflow.name,
          status: 'error'
        });
        const histogram = this.metrics.getMetric('hundunos_pipeline_execution_duration_seconds');
        histogram.observe(duration, {
          workflow_id: workflow.id,
          workflow_name: workflow.name
        });
        const errorCounter = this.metrics.getMetric('hundunos_pipeline_errors_total');
        errorCounter.inc(1, {
          workflow_id: workflow.id,
          node_id: 'pipeline',
          error_type: error.constructor.name
        });

        span.recordException(error);
        throw error;
      }
    });
  }

  /**
   * 包装节点执行，自动创建 span 和记录 metrics
   * @param {Object} workflow - 工作流对象
   * @param {Object} node - 节点对象
   * @param {Object} execution - 执行对象
   * @param {Function} executeFn - 执行函数
   * @returns {Promise<*>}
   */
  async observeNodeExecution(workflow, node, execution, executeFn) {
    const workflowAttrs = this.tracing.pickWorkflowAttributes(workflow);
    const nodeAttrs = this.tracing.pickNodeAttributes(node);
    const executionAttrs = this.tracing.pickExecutionAttributes(execution);

    const startTime = Date.now();

    return await this.tracing.startSpan({
      name: `node_execution:${node.name}`,
      attributes: {
        ...workflowAttrs,
        ...nodeAttrs,
        ...executionAttrs,
        'node.execution.type': 'execute'
      }
    }, async (span) => {
      try {
        const result = await executeFn(span);

        // 记录成功的 metrics
        const duration = (Date.now() - startTime) / 1000;
        const counter = this.metrics.getMetric('hundunos_pipeline_node_executions_total');
        counter.inc(1, {
          workflow_id: workflow.id,
          node_id: node.id,
          node_type: node.type,
          status: 'success'
        });
        const histogram = this.metrics.getMetric('hundunos_pipeline_node_execution_duration_seconds');
        histogram.observe(duration, {
          workflow_id: workflow.id,
          node_id: node.id,
          node_type: node.type
        });

        span.setStatus({ code: SpanStatus.OK });
        return result;
      } catch (error) {
        // 记录失败的 metrics
        const duration = (Date.now() - startTime) / 1000;
        const counter = this.metrics.getMetric('hundunos_pipeline_node_executions_total');
        counter.inc(1, {
          workflow_id: workflow.id,
          node_id: node.id,
          node_type: node.type,
          status: 'error'
        });
        const histogram = this.metrics.getMetric('hundunos_pipeline_node_execution_duration_seconds');
        histogram.observe(duration, {
          workflow_id: workflow.id,
          node_id: node.id,
          node_type: node.type
        });
        const errorCounter = this.metrics.getMetric('hundunos_pipeline_errors_total');
        errorCounter.inc(1, {
          workflow_id: workflow.id,
          node_id: node.id,
          error_type: error.constructor.name
        });

        span.recordException(error);
        throw error;
      }
    });
  }

  /**
   * 记录重试
   * @param {Object} workflow - 工作流对象
   * @param {Object} node - 节点对象
   * @param {number} retryCount - 重试次数
   */
  recordRetry(workflow, node, retryCount) {
    const counter = this.metrics.getMetric('hundunos_pipeline_retries_total');
    counter.inc(retryCount, {
      workflow_id: workflow.id,
      node_id: node.id
    });

    this.logger.info(`Node ${node.name} retried ${retryCount} times`);
  }

  /**
   * 记录自定义事件
   * @param {string} eventName - 事件名称
   * @param {Object} attributes - 事件属性
   */
  recordEvent(eventName, attributes = {}) {
    this.logger.debug(`Recording event: ${eventName}`, attributes);

    // 可以在这里添加自定义 metrics
    if (eventName.startsWith('metric.')) {
      const metricName = eventName.substring('metric.'.length);
      const counter = this.metrics.getMetric(metricName);
      if (counter) {
        counter.inc(attributes.value || 1, attributes.labels || {});
      }
    }
  }

  /**
   * 获取 Pipeline 统计信息
   * @param {Object} filters - 过滤条件
   * @returns {Object}
   */
  getStats(filters = {}) {
    const stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalNodeExecutions: 0,
      successfulNodeExecutions: 0,
      failedNodeExecutions: 0,
      totalRetries: 0,
      totalErrors: 0,
      averageExecutionDuration: 0,
      averageNodeExecutionDuration: 0
    };

    // 计算统计数据
    const executionCounter = this.metrics.getMetric('hundunos_pipeline_executions_total');
    if (executionCounter) {
      // 遍历所有值来计算统计信息
      let successCount = 0;
      let errorCount = 0;

      for (const [key, value] of executionCounter.values.entries()) {
        const labels = JSON.parse(key);
        if (labels.status === 'success') {
          successCount += value;
        } else if (labels.status === 'error') {
          errorCount += value;
        }
      }

      stats.successfulExecutions = successCount;
      stats.failedExecutions = errorCount;
      stats.totalExecutions = successCount + errorCount;
    }

    const nodeExecutionCounter = this.metrics.getMetric('hundunos_pipeline_node_executions_total');
    if (nodeExecutionCounter) {
      // 遍历所有值来计算统计信息
      let successCount = 0;
      let errorCount = 0;

      for (const [key, value] of nodeExecutionCounter.values.entries()) {
        const labels = JSON.parse(key);
        if (labels.status === 'success') {
          successCount += value;
        } else if (labels.status === 'error') {
          errorCount += value;
        }
      }

      stats.successfulNodeExecutions = successCount;
      stats.failedNodeExecutions = errorCount;
      stats.totalNodeExecutions = successCount + errorCount;
    }

    const retryCounter = this.metrics.getMetric('hundunos_pipeline_retries_total');
    if (retryCounter) {
      stats.totalRetries = retryCounter.get();
    }

    const errorCounter = this.metrics.getMetric('hundunos_pipeline_errors_total');
    if (errorCounter) {
      stats.totalErrors = errorCounter.get();
    }

    // 计算平均持续时间（简化版本）
    const executionDurationHistogram = this.metrics.getMetric('hundunos_pipeline_execution_duration_seconds');
    if (executionDurationHistogram) {
      const values = executionDurationHistogram.values;
      if (values.size > 0) {
        let sum = 0;
        let count = 0;
        for (const valueArray of values.values()) {
          sum += valueArray.reduce((a, b) => a + b, 0);
          count += valueArray.length;
        }
        stats.averageExecutionDuration = count > 0 ? sum / count : 0;
      }
    }

    const nodeExecutionDurationHistogram = this.metrics.getMetric('hundunos_pipeline_node_execution_duration_seconds');
    if (nodeExecutionDurationHistogram) {
      const values = nodeExecutionDurationHistogram.values;
      if (values.size > 0) {
        let sum = 0;
        let count = 0;
        for (const valueArray of values.values()) {
          sum += valueArray.reduce((a, b) => a + b, 0);
          count += valueArray.length;
        }
        stats.averageNodeExecutionDuration = count > 0 ? sum / count : 0;
      }
    }

    // 应用过滤条件
    if (filters.workflow_id) {
      // 这里可以根据 workflow_id 进一步过滤
    }

    return stats;
  }

  /**
   * 导出 Prometheus 格式的 metrics
   * @returns {string}
   */
  exportPrometheusMetrics() {
    return this.metrics.toPrometheus();
  }

  /**
   * 重置所有 metrics
   */
  resetMetrics() {
    this.metrics.reset();
    this._initializeMetrics();
  }
}

// 导出单例实例
export const pipelineObservability = new PipelineObservability();
