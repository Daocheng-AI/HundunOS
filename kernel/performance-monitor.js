/**
 * HundunOS v5 - OpenTelemetry 性能监控集成
 * 提供分布式追踪、性能指标收集和导出
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { context, trace, SpanStatusCode, propagation } from '@opentelemetry/api';
import { envManager } from './config/env-manager.js';

/**
 * 性能监控管理器
 */
export class PerformanceMonitor {
  constructor(kernel) {
    this.kernel = kernel;
    this.tracerProvider = null;
    this.tracer = null;
    this.enabled = false;
    this.config = {
      serviceName: envManager.get('OTEL_SERVICE_NAME') || 'hundunos',
      exporterEndpoint: envManager.get('OTEL_EXPORTER_OTLP_ENDPOINT'),
      sampleRate: parseFloat(envManager.get('OTEL_SAMPLE_RATE') || '0.1'),
    };
  }

  /**
   * 初始化性能监控
   */
  async initialize() {
    // 检查是否启用了 OpenTelemetry
    if (!this.config.exporterEndpoint) {
      console.log('[PerformanceMonitor] OpenTelemetry endpoint not configured, using console exporter only');
      this.enabled = true;
    } else {
      this.enabled = true;
    }

    if (!this.enabled) return;

    try {
      // 创建资源
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: '5.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: envManager.get('NODE_ENV') || 'production',
      });

      // 创建 Tracer Provider
      this.tracerProvider = new NodeTracerProvider({
        resource,
        sampler: {
          // 基于采样率的采样器
          shouldSample: () => {
            return Math.random() < this.config.sampleRate
              ? { decision: true }
              : { decision: false };
          },
        },
      });

      // 添加导出器
      // 1. 控制台导出器（开发环境）
      this.tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

      // 2. OTLP HTTP 导出器（生产环境）
      if (this.config.exporterEndpoint) {
        const otlpExporter = new OTLPTraceExporter({
          url: `${this.config.exporterEndpoint}/v1/traces`,
          headers: {
            'Authorization': envManager.get('OTEL_AUTH_TOKEN') || '',
          },
        });
        this.tracerProvider.addSpanProcessor(new BatchSpanProcessor(otlpExporter, {
          maxExportBatchSize: 512,
          scheduledDelayMillis: 5000,
        }));
      }

      // 注册全局 Tracer Provider
      this.tracerProvider.register();

      // 获取 Tracer
      this.tracer = this.tracerProvider.getTracer('hundunos-kernel');

      console.log(`[PerformanceMonitor] Initialized successfully (service: ${this.config.serviceName})`);
    } catch (error) {
      console.error('[PerformanceMonitor] Initialization failed:', error);
      this.enabled = false;
    }
  }

  /**
   * 创建追踪 Span
   * @param {string} name - Span 名称
   * @param {Object} options - 配置选项
   * @returns {Object} Span 对象
   */
  startSpan(name, options = {}) {
    if (!this.enabled || !this.tracer) {
      return null;
    }

    const {
      kind = trace.SpanKind.INTERNAL,
      attributes = {},
      parentContext,
    } = options;

    const ctx = parentContext || context.active();
    const span = this.tracer.startSpan(name, { kind, attributes }, ctx);

    return span;
  }

  /**
   * 结束 Span
   * @param {Object} span - Span 对象
   * @param {Error} error - 可选的错误对象
   */
  endSpan(span, error = null) {
    if (!span) return;

    if (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();
  }

  /**
   * 在 Span 上下文中执行函数
   * @param {string} spanName - Span 名称
   * @param {Function} fn - 要执行的函数
   * @param {Object} options - Span 配置
   * @returns {Promise<*>} 函数执行结果
   */
  async withSpan(spanName, fn, options = {}) {
    const span = this.startSpan(spanName, options);
    
    if (!span) {
      return await fn();
    }

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        fn
      );
      this.endSpan(span);
      return result;
    } catch (error) {
      this.endSpan(span, error);
      throw error;
    }
  }

  /**
   * 记录性能指标
   * @param {string} name - 指标名称
   * @param {number} value - 指标值
   * @param {Object} attributes - 附加属性
   */
  recordMetric(name, value, attributes = {}) {
    if (!this.enabled) return;

    // 当前使用 Span 事件记录指标
    // 未来可以集成 @opentelemetry/sdk-metrics
    const span = this.startSpan('metric', {
      attributes: {
        'metric.name': name,
        'metric.value': value,
        ...attributes,
      },
    });

    if (span) {
      this.endSpan(span);
    }
  }

  /**
   * 追踪数据库查询
   * @param {string} query - SQL 查询
   * @param {Function} fn - 执行函数
   * @returns {Promise<*>} 查询结果
   */
  async traceDatabaseQuery(query, fn) {
    return await this.withSpan('db.query', fn, {
      attributes: {
        'db.system': 'postgresql',
        'db.statement': this._sanitizeQuery(query),
      },
      kind: trace.SpanKind.CLIENT,
    });
  }

  /**
   * 追踪 HTTP 请求
   * @param {string} method - HTTP 方法
   * @param {string} url - URL
   * @param {Function} fn - 执行函数
   * @returns {Promise<*>} 响应结果
   */
  async traceHttpRequest(method, url, fn) {
    return await this.withSpan('http.request', fn, {
      attributes: {
        'http.method': method,
        'http.url': url,
      },
      kind: trace.SpanKind.CLIENT,
    });
  }

  /**
   * 追踪技能执行
   * @param {string} skillName - 技能名称
   * @param {Function} fn - 执行函数
   * @returns {Promise<*>} 执行结果
   */
  async traceSkillExecution(skillName, fn) {
    return await this.withSpan('skill.execute', fn, {
      attributes: {
        'skill.name': skillName,
      },
      kind: trace.SpanKind.INTERNAL,
    });
  }

  /**
   * 生成追踪上下文（用于跨服务传播）
   * @returns {string} 追踪上下文字符串
   */
  generateTraceContext() {
    if (!this.enabled) return null;

    const span = trace.getSpan(context.active());
    if (!span) return null;

    const carrier = {};
    propagation.inject(context.active(), carrier);
    return carrier.traceparent || null;
  }

  /**
   * 从上下文恢复追踪
   * @param {string} traceContext - 追踪上下文字符串
   * @returns {Object} 恢复的上下文
   */
  extractTraceContext(traceContext) {
    if (!this.enabled || !traceContext) {
      return context.active();
    }

    const carrier = { traceparent: traceContext };
    return propagation.extract(context.active(), carrier);
  }

  /**
   * 清理 SQL 查询（移除敏感信息）
   * @param {string} query - 原始 SQL
   * @returns {string} 清理后的 SQL
   */
  _sanitizeQuery(query) {
    // 移除密码、密钥等敏感信息
    return query
      .replace(/PASSWORD\s*=\s*'[^']+'/gi, 'PASSWORD=***')
      .replace(/SECRET\s*=\s*'[^']+'/gi, 'SECRET=***')
      .replace(/TOKEN\s*=\s*'[^']+'/gi, 'TOKEN=***')
      .trim();
  }

  /**
   * 关闭性能监控
   */
  async shutdown() {
    if (!this.tracerProvider) return;

    try {
      await this.tracerProvider.shutdown();
      console.log('[PerformanceMonitor] Shutdown complete');
    } catch (error) {
      console.error('[PerformanceMonitor] Shutdown failed:', error);
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      enabled: this.enabled,
      serviceName: this.config.serviceName,
      sampleRate: this.config.sampleRate,
      exporterEndpoint: this.config.exporterEndpoint ? 'configured' : 'not configured',
    };
  }
}

/**
 * 性能监控插件（用于 Kernel 集成）
 */
export class PerformancePlugin {
  constructor(kernel) {
    this.kernel = kernel;
    this.monitor = new PerformanceMonitor(kernel);
  }

  get name() {
    return 'performance';
  }

  async initialize() {
    await this.monitor.initialize();
    this.kernel.metrics.set('performance.monitor.enabled', this.monitor.enabled ? 1 : 0);
  }

  async shutdown() {
    await this.monitor.shutdown();
  }

  get monitor() {
    return this.monitor;
  }
}

export default PerformanceMonitor;
