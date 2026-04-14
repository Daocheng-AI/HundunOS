/**
 * Pipeline 可观测性测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SpanStatus,
  EmptySpan,
  RealSpan,
  NoopTracer,
  RealTracer,
  Tracing,
  PipelineObservability,
  pipelineObservability
} from './index.js';
import { MetricRegistry } from '../../observability/metrics.js';

describe('EmptySpan', () => {
  let span;

  beforeEach(() => {
    span = new EmptySpan();
  });

  it('should create an empty span', () => {
    expect(span).toBeDefined();
    expect(span.name).toBeUndefined();
  });

  it('should have empty context', () => {
    const context = span.spanContext();
    expect(context.traceId).toBe('00000000000000000000000000000000');
    expect(context.spanId).toBe('0000000000000000');
    expect(context.traceFlags).toBe(0);
  });

  it('should not be recording', () => {
    expect(span.isRecording()).toBe(false);
  });

  it('should return zero duration', () => {
    expect(span.getDuration()).toBe(0);
  });

  it('should return empty attributes', () => {
    expect(span.getAttributes()).toEqual({});
  });

  it('should return empty events', () => {
    expect(span.getEvents()).toEqual([]);
  });

  it('should return unset status', () => {
    const status = span.getStatus();
    expect(status.code).toBe(SpanStatus.UNSET);
  });

  it('should support chaining methods', () => {
    const result = span
      .setAttribute('key', 'value')
      .setAttributes({ key2: 'value2' })
      .setStatus({ code: SpanStatus.OK })
      .updateName('new-name')
      .addEvent('event', { data: 'test' });

    expect(result).toBe(span);
  });

  it('should not record exceptions', () => {
    const error = new Error('Test error');
    span.recordException(error);

    expect(span.getEvents()).toEqual([]);
  });
});

describe('RealSpan', () => {
  let span;

  beforeEach(() => {
    span = new RealSpan('test-span', {
      attributes: { key1: 'value1' }
    });
  });

  it('should create a real span with name', () => {
    expect(span.name).toBe('test-span');
  });

  it('should have valid context', () => {
    const context = span.spanContext();
    expect(context.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(context.spanId).toMatch(/^[a-f0-9]{16}$/);
    expect(context.traceFlags).toBe(1);
  });

  it('should be recording initially', () => {
    expect(span.isRecording()).toBe(true);
  });

  it('should not be recording after end', () => {
    span.end();
    expect(span.isRecording()).toBe(false);
  });

  it('should track duration', () => {
    const startTime = span.getStartTime();
    expect(startTime).toBeGreaterThan(0);

    const duration = span.getDuration();
    expect(duration).toBeGreaterThanOrEqual(0);

    span.end();
    const endDuration = span.getDuration();
    expect(endDuration).toBeGreaterThanOrEqual(duration);
  });

  it('should manage attributes', () => {
    expect(span.getAttributes()).toEqual({ key1: 'value1' });

    span.setAttribute('key2', 'value2');
    expect(span.getAttributes()).toEqual({ key1: 'value1', key2: 'value2' });

    span.setAttributes({ key3: 'value3', key4: 'value4' });
    expect(span.getAttributes()).toEqual({
      key1: 'value1',
      key2: 'value2',
      key3: 'value3',
      key4: 'value4'
    });
  });

  it('should manage events', () => {
    expect(span.getEvents()).toEqual([]);

    span.addEvent('event1', { data: 'test1' });
    span.addEvent('event2', { data: 'test2' });

    const events = span.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].name).toBe('event1');
    expect(events[1].name).toBe('event2');
  });

  it('should record exceptions', () => {
    const error = new Error('Test error');
    span.recordException(error);

    const events = span.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('exception');
    expect(events[0].attributes['exception.type']).toBe('Error');
    expect(events[0].attributes['exception.message']).toBe('Test error');

    const status = span.getStatus();
    expect(status.code).toBe(SpanStatus.ERROR);
    expect(status.message).toBe('Test error');
  });

  it('should update name', () => {
    span.updateName('new-name');
    expect(span.name).toBe('new-name');
  });

  it('should serialize to JSON', () => {
    span.setAttribute('key', 'value');
    span.addEvent('test-event');
    span.end();

    const json = span.toJSON();
    expect(json.name).toBe('test-span');
    expect(json.context).toBeDefined();
    expect(json.attributes).toEqual({ key1: 'value1', key: 'value' });
    expect(json.events).toHaveLength(1);
    expect(json.duration).toBeGreaterThanOrEqual(0);
    expect(json.endTime).toBeDefined();
  });
});

describe('NoopTracer', () => {
  let tracer;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    tracer = new NoopTracer();
  });

  it('should execute callback with empty span', async () => {
    let capturedSpan;
    const result = await tracer.startSpan({ name: 'test' }, async (span) => {
      capturedSpan = span;
      return 'test-result';
    });

    expect(result).toBe('test-result');
    expect(capturedSpan).toBeInstanceOf(EmptySpan);
  });

  it('should handle errors', async () => {
    const error = new Error('Test error');

    await expect(
      tracer.startSpan({ name: 'test' }, async () => {
        throw error;
      })
    ).rejects.toThrow(error);
  });
});

describe('RealTracer', () => {
  let tracer;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    tracer = new RealTracer({ logger: mockLogger });
  });

  it('should execute callback with real span', async () => {
    let capturedSpan;
    const result = await tracer.startSpan({ name: 'test' }, async (span) => {
      capturedSpan = span;
      return 'test-result';
    });

    expect(result).toBe('test-result');
    expect(capturedSpan).toBeInstanceOf(RealSpan);
    expect(mockLogger.debug).toHaveBeenCalledWith('Starting span: test');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/Completed span: test \(\d+ms\)/)
    );
  });

  it('should handle errors and record them', async () => {
    const error = new Error('Test error');

    await expect(
      tracer.startSpan({ name: 'test' }, async (span) => {
        throw error;
      })
    ).rejects.toThrow(error);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed span: test',
      error
    );
  });

  it('should track span duration', async () => {
    let capturedSpan;
    await tracer.startSpan({ name: 'test' }, async (span) => {
      capturedSpan = span;
      return new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(capturedSpan.getDuration()).toBeGreaterThanOrEqual(10);
  });
});

describe('Tracing', () => {
  let tracingInstance;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    tracingInstance = new Tracing({ logger: mockLogger, enabled: true });
  });

  it('should create tracing with enabled state', () => {
    expect(tracingInstance.enabled).toBe(true);
    expect(tracingInstance.tracer).toBeInstanceOf(RealTracer);
  });

  it('should create tracing with disabled state', () => {
    const disabledTracing = new Tracing({ logger: mockLogger, enabled: false });
    expect(disabledTracing.enabled).toBe(false);
    expect(disabledTracing.tracer).toBeInstanceOf(NoopTracer);
  });

  it('should start span', async () => {
    const result = await tracingInstance.startSpan({ name: 'test' }, async () => {
      return 'result';
    });

    expect(result).toBe('result');
  });

  it('should pick workflow attributes', () => {
    const workflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      version: '1.0.0'
    };

    const attrs = tracingInstance.pickWorkflowAttributes(workflow);
    expect(attrs[tracingInstance.commonAttrs.workflow.id]).toBe('workflow-1');
    expect(attrs[tracingInstance.commonAttrs.workflow.name]).toBe('Test Workflow');
    expect(attrs[tracingInstance.commonAttrs.workflow.version]).toBe('1.0.0');
  });

  it('should pick node attributes', () => {
    const node = {
      id: 'node-1',
      name: 'Test Node',
      type: 'test',
      typeVersion: 1
    };

    const attrs = tracingInstance.pickNodeAttributes(node);
    expect(attrs[tracingInstance.commonAttrs.node.id]).toBe('node-1');
    expect(attrs[tracingInstance.commonAttrs.node.name]).toBe('Test Node');
    expect(attrs[tracingInstance.commonAttrs.node.type]).toBe('test');
    expect(attrs[tracingInstance.commonAttrs.node.typeVersion]).toBe(1);
  });

  it('should pick execution attributes', () => {
    const execution = {
      id: 'exec-1',
      mode: 'manual',
      retryCount: 2
    };

    const attrs = tracingInstance.pickExecutionAttributes(execution);
    expect(attrs[tracingInstance.commonAttrs.execution.id]).toBe('exec-1');
    expect(attrs[tracingInstance.commonAttrs.execution.mode]).toBe('manual');
    expect(attrs[tracingInstance.commonAttrs.execution.retryCount]).toBe(2);
  });

  it('should pick error attributes', () => {
    const error = new Error('Test error');
    const attrs = tracingInstance.pickErrorAttributes(error);

    expect(attrs[tracingInstance.commonAttrs.error.type]).toBe('Error');
    expect(attrs[tracingInstance.commonAttrs.error.message]).toBe('Test error');
  });

  it('should enable and disable tracing', () => {
    tracingInstance.disable();
    expect(tracingInstance.enabled).toBe(false);
    expect(tracingInstance.tracer).toBeInstanceOf(NoopTracer);

    tracingInstance.enable();
    expect(tracingInstance.enabled).toBe(true);
    expect(tracingInstance.tracer).toBeInstanceOf(RealTracer);
  });

  it('should set custom tracer', () => {
    const customTracer = new NoopTracer();
    tracingInstance.setTracer(customTracer);
    expect(tracingInstance.tracer).toBe(customTracer);
  });
});

describe('PipelineObservability', () => {
  let observability;
  let mockLogger;
  let mockWorkflow;
  let mockExecution;
  let mockNode;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      version: '1.0.0'
    };

    mockExecution = {
      id: 'exec-1',
      mode: 'manual',
      retryCount: 0
    };

    mockNode = {
      id: 'node-1',
      name: 'Test Node',
      type: 'test',
      typeVersion: 1
    };

    observability = new PipelineObservability({
      logger: mockLogger,
      metrics: new MetricRegistry() // 使用独立的 metrics 实例
    });
  });

  it('should create pipeline observability', () => {
    expect(observability).toBeDefined();
    expect(observability.logger).toBe(mockLogger);
    expect(observability.tracing).toBeDefined();
    expect(observability.metrics).toBeDefined();
  });

  it('should observe pipeline execution', async () => {
    const executeFn = vi.fn().mockResolvedValue('result');

    const result = await observability.observePipelineExecution(
      mockWorkflow,
      mockExecution,
      executeFn
    );

    expect(result).toBe('result');
    expect(executeFn).toHaveBeenCalled();
  });

  it('should handle pipeline execution errors', async () => {
    const error = new Error('Pipeline error');
    const executeFn = vi.fn().mockRejectedValue(error);

    await expect(
      observability.observePipelineExecution(mockWorkflow, mockExecution, executeFn)
    ).rejects.toThrow(error);

    expect(executeFn).toHaveBeenCalled();
  });

  it('should observe node execution', async () => {
    const executeFn = vi.fn().mockResolvedValue('result');

    const result = await observability.observeNodeExecution(
      mockWorkflow,
      mockNode,
      mockExecution,
      executeFn
    );

    expect(result).toBe('result');
    expect(executeFn).toHaveBeenCalled();
  });

  it('should handle node execution errors', async () => {
    const error = new Error('Node error');
    const executeFn = vi.fn().mockRejectedValue(error);

    await expect(
      observability.observeNodeExecution(mockWorkflow, mockNode, mockExecution, executeFn)
    ).rejects.toThrow(error);

    expect(executeFn).toHaveBeenCalled();
  });

  it('should record retry', () => {
    observability.recordRetry(mockWorkflow, mockNode, 3);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Test Node retried 3 times')
    );
  });

  it('should record event', () => {
    observability.recordEvent('custom.event', { data: 'test' });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Recording event: custom.event',
      { data: 'test' }
    );
  });

  it('should record metric event', () => {
    // 先创建自定义 metric
    observability.metrics.createCounter('custom_counter', 'Custom counter metric', ['label1']);

    observability.recordEvent('metric.custom_counter', {
      labels: { label1: 'value1' },
      value: 5
    });

    // Metric should be recorded
    const counter = observability.metrics.getMetric('custom_counter');
    expect(counter).toBeDefined();
    expect(counter.get({ label1: 'value1' })).toBe(5);
  });

  it('should get stats', () => {
    const stats = observability.getStats();

    expect(stats).toHaveProperty('totalExecutions');
    expect(stats).toHaveProperty('successfulExecutions');
    expect(stats).toHaveProperty('failedExecutions');
    expect(stats).toHaveProperty('totalNodeExecutions');
    expect(stats).toHaveProperty('totalRetries');
    expect(stats).toHaveProperty('totalErrors');
  });

  it('should export prometheus metrics', () => {
    const metrics = observability.exportPrometheusMetrics();
    expect(typeof metrics).toBe('string');
    expect(metrics).toContain('hundunos_pipeline');
  });

  it('should reset metrics', () => {
    observability.recordRetry(mockWorkflow, mockNode, 1);

    const statsBefore = observability.getStats();
    expect(statsBefore.totalRetries).toBeGreaterThan(0);

    observability.resetMetrics();

    const statsAfter = observability.getStats();
    expect(statsAfter.totalRetries).toBe(0);
  });

  it('should track execution metrics', async () => {
    const executeFn = vi.fn().mockResolvedValue('result');

    await observability.observePipelineExecution(mockWorkflow, mockExecution, executeFn);

    const stats = observability.getStats();
    expect(stats.totalExecutions).toBe(1);
    expect(stats.successfulExecutions).toBe(1);
    expect(stats.failedExecutions).toBe(0);
  });

  it('should track node execution metrics', async () => {
    const executeFn = vi.fn().mockResolvedValue('result');

    await observability.observeNodeExecution(mockWorkflow, mockNode, mockExecution, executeFn);

    const stats = observability.getStats();
    expect(stats.totalNodeExecutions).toBe(1);
    expect(stats.successfulNodeExecutions).toBe(1);
    expect(stats.failedNodeExecutions).toBe(0);
  });

  it('should track error metrics', async () => {
    const error = new Error('Test error');
    const executeFn = vi.fn().mockRejectedValue(error);

    try {
      await observability.observePipelineExecution(mockWorkflow, mockExecution, executeFn);
    } catch (e) {
      // Expected to throw
    }

    const stats = observability.getStats();
    expect(stats.totalExecutions).toBe(1);
    expect(stats.failedExecutions).toBe(1);
    expect(stats.totalErrors).toBe(1);
  });
});
