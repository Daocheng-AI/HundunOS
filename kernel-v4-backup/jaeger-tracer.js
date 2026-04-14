/**
 * HundunOS v4.3 - Jaeger Tracer
 * 实现分布式追踪
 */

import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

/**
 * Jaeger Tracer
 */
export class JaegerTracer {
  constructor(options = {}) {
    this.options = {
      endpoint: options.endpoint || 'http://localhost:14268/api/traces',
      serviceName: options.serviceName || 'hundunos',
      batch: options.batch !== false,
    };
    this.provider = null;
    this.exporter = null;
  }

  /**
   * 初始化
   */
  async initialize() {
    this.exporter = new JaegerExporter({
      endpoint: this.options.endpoint,
    });

    const processor = this.options.batch
      ? new BatchSpanProcessor(this.exporter)
      : new SimpleSpanProcessor(this.exporter);

    this.provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.options.serviceName,
      }),
      spanProcessors: [processor],
    });

    this.provider.register();
  }

  /**
   * 获取 Tracer
   */
  getTracer(name = 'hundunos') {
    return this.provider.getTracer(name);
  }

  /**
   * 关闭
   */
  async shutdown() {
    await this.provider.shutdown();
  }
}

export default JaegerTracer;
