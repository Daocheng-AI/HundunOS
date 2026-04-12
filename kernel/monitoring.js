/**
 * HundunOS v4.3 - 监控和可观测性
 * 添加 Prometheus 指标导出、健康检查和分布式追踪
 */

import { createServer } from 'http';
import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';

/**
 * 指标收集器
 */
export class MetricsCollector {
  constructor() {
    this.prefix = 'hundunos_';

    // Counter 指标
    this.toolExecutions = new Counter({
      name: `${this.prefix}tool_executions_total`,
      help: 'Total number of tool executions',
      labelNames: ['tool_name', 'status'],
    });

    this.llmRequests = new Counter({
      name: `${this.prefix}llm_requests_total`,
      help: 'Total number of LLM requests',
      labelNames: ['provider', 'model', 'status'],
    });

    this.compactions = new Counter({
      name: `${this.prefix}compactions_total`,
      help: 'Total number of context compressions',
      labelNames: ['method'],
    });

    this.errors = new Counter({
      name: `${this.prefix}errors_total`,
      help: 'Total number of errors',
      labelNames: ['module', 'error_type'],
    });

    // Histogram 指标
    this.toolExecutionDuration = new Histogram({
      name: `${this.prefix}tool_execution_duration_seconds`,
      help: 'Tool execution duration in seconds',
      labelNames: ['tool_name'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
    });

    this.llmRequestDuration = new Histogram({
      name: `${this.prefix}llm_request_duration_seconds`,
      help: 'LLM request duration in seconds',
      labelNames: ['provider', 'model'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    });

    // Gauge 指标
    this.activeSessions = new Gauge({
      name: `${this.prefix}active_sessions`,
      help: 'Number of active sessions',
    });

    this.pendingTasks = new Gauge({
      name: `${this.prefix}pending_tasks`,
      help: 'Number of pending tasks',
    });

    this.queueDepth = new Gauge({
      name: `${this.prefix}queue_depth`,
      help: 'Queue depth',
      labelNames: ['queue_name'],
    });

    // Summary 指标
    this.tokenUsage = new Summary({
      name: `${this.prefix}token_usage`,
      help: 'Token usage per request',
      labelNames: ['provider', 'model'],
      percentiles: [0.5, 0.9, 0.95, 0.99],
    });

    // 注册所有指标
    register.registerMetric(this.toolExecutions);
    register.registerMetric(this.llmRequests);
    register.registerMetric(this.compactions);
    register.registerMetric(this.errors);
    register.registerMetric(this.toolExecutionDuration);
    register.registerMetric(this.llmRequestDuration);
    register.registerMetric(this.activeSessions);
    register.registerMetric(this.pendingTasks);
    register.registerMetric(this.queueDepth);
    register.registerMetric(this.tokenUsage);
  }

  /**
   * 记录工具执行
   */
  recordToolExecution(toolName, status, duration) {
    this.toolExecutions.inc({ tool_name: toolName, status });
    this.toolExecutionDuration.observe({ tool_name: toolName }, duration);
  }

  /**
   * 记录 LLM 请求
   */
  recordLLMRequest(provider, model, status, duration, tokens) {
    this.llmRequests.inc({ provider, model, status });
    this.llmRequestDuration.observe({ provider, model }, duration);
    this.tokenUsage.observe({ provider, model }, tokens);
  }

  /**
   * 记录压缩
   */
  recordCompaction(method) {
    this.compactions.inc({ method });
  }

  /**
   * 记录错误
   */
  recordError(module, errorType) {
    this.errors.inc({ module, error_type: errorType });
  }

  /**
   * 更新会话数
   */
  updateActiveSessions(count) {
    this.activeSessions.set(count);
  }

  /**
   * 更新待处理任务数
   */
  updatePendingTasks(count) {
    this.pendingTasks.set(count);
  }

  /**
   * 更新队列深度
   */
  updateQueueDepth(queueName, depth) {
    this.queueDepth.set({ queue_name: queueName }, depth);
  }

  /**
   * 获取指标
   */
  async getMetrics() {
    return await register.metrics();
  }
}

/**
 * 健康检查器
 */
export class HealthChecker {
  constructor(kernel) {
    this.kernel = kernel;
    this.checks = new Map();
    this.registerDefaultChecks();
  }

  /**
   * 注册默认检查
   */
  registerDefaultChecks() {
    this.register('kernel', async () => {
      return {
        status: 'healthy',
        version: this.kernel.state?.version || 'unknown',
        uptime: process.uptime(),
      };
    });

    this.register('modelRouter', async () => {
      const stats = this.kernel.modelRouter?.getStats?.();
      if (!stats) {
        return { status: 'unhealthy', message: 'ModelRouter not available' };
      }
      return {
        status: 'healthy',
        providers: stats.providers?.length || 0,
      };
    });

    this.register('memoryGraph', async () => {
      const stats = this.kernel.memoryGraph?.getStats?.();
      if (!stats) {
        return { status: 'unhealthy', message: 'MemoryGraph not available' };
      }
      return {
        status: 'healthy',
        memories: stats.total || 0,
      };
    });

    this.register('toolBridge', async () => {
      const stats = this.kernel.toolBridge?.getStats?.();
      if (!stats) {
        return { status: 'unhealthy', message: 'ToolBridge not available' };
      }
      return {
        status: 'healthy',
        tools: stats.total || 0,
        available: stats.available || 0,
      };
    });

    this.register('storage', async () => {
      const fs = require('fs');
      const storageDir = this.kernel.config?.storageDir || '.hundunos';
      const exists = fs.existsSync(storageDir);
      return {
        status: exists ? 'healthy' : 'unhealthy',
        path: storageDir,
      };
    });

    this.register('autonomousAgents', async () => {
      const stats = this.kernel.autonomousAgentManager?.getStats?.();
      if (!stats) {
        return { status: 'unhealthy', message: 'AutonomousAgentManager not available' };
      }
      return {
        status: 'healthy',
        agents: stats.totalAgents || 0,
        tasks: stats.pendingTasks || 0,
      };
    });

    this.register('mcp', async () => {
      const tools = this.kernel.mcpManager?.listTools?.();
      if (!tools) {
        return { status: 'unhealthy', message: 'MCP Manager not available' };
      }
      return {
        status: 'healthy',
        tools: tools.length || 0,
      };
    });
  }

  /**
   * 注册检查
   */
  register(name, handler) {
    this.checks.set(name, handler);
  }

  /**
   * 执行所有检查
   */
  async checkAll() {
    const results = {};
    let overall = 'healthy';

    for (const [name, handler] of this.checks) {
      try {
        const result = await handler();
        results[name] = result;
        if (result.status === 'unhealthy') {
          overall = 'unhealthy';
        } else if (result.status === 'degraded' && overall !== 'unhealthy') {
          overall = 'degraded';
        }
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          error: error.message,
        };
        overall = 'unhealthy';
      }
    }

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }

  /**
   * 执行单个检查
   */
  async check(name) {
    const handler = this.checks.get(name);
    if (!handler) {
      return {
        status: 'unhealthy',
        message: `Check not found: ${name}`,
      };
    }

    try {
      return await handler();
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }
}

/**
 * 分布式追踪器
 */
export class Tracer {
  constructor() {
    this.spans = new Map();
    this.currentSpan = null;
  }

  /**
   * 开始 span
   */
  startSpan(name, parentSpanId = null) {
    const spanId = this.generateId();
    const span = {
      spanId,
      parentSpanId,
      name,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'in_progress',
      metadata: {},
    };

    this.spans.set(spanId, span);
    this.currentSpan = spanId;

    return spanId;
  }

  /**
   * 结束 span
   */
  endSpan(spanId, status = 'completed', metadata = {}) {
    const span = this.spans.get(spanId);
    if (!span) {
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    span.metadata = { ...span.metadata, ...metadata };

    if (this.currentSpan === spanId) {
      this.currentSpan = span.parentSpanId;
    }
  }

  /**
   * 添加 metadata
   */
  addMetadata(spanId, metadata) {
    const span = this.spans.get(spanId);
    if (span) {
      span.metadata = { ...span.metadata, ...metadata };
    }
  }

  /**
   * 获取 span
   */
  getSpan(spanId) {
    return this.spans.get(spanId);
  }

  /**
   * 获取当前 span
   */
  getCurrentSpan() {
    return this.currentSpan ? this.spans.get(this.currentSpan) : null;
  }

  /**
   * 获取 span 树
   */
  getSpanTree(rootSpanId) {
    const root = this.getSpan(rootSpanId);
    if (!root) {
      return null;
    }

    const children = [];
    for (const [id, span] of this.spans) {
      if (span.parentSpanId === rootSpanId) {
        children.push(this.getSpanTree(id));
      }
    }

    return {
      ...root,
      children,
    };
  }

  /**
   * 清理旧 spans
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    for (const [id, span] of this.spans) {
      if (span.endTime && now - span.endTime > maxAge) {
        this.spans.delete(id);
      }
    }
  }

  generateId() {
    return Math.random().toString(36).substring(2, 15);
  }
}

/**
 * 创建 Metrics 服务器
 */
export function createMetricsServer(port = 9090, metricsCollector) {
  const server = createServer(async (req, res) => {
    if (req.url === '/metrics') {
      const metrics = await metricsCollector.getMetrics();
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics);
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    console.log(`[Metrics] Server listening on port ${port}`);
  });

  return server;
}

export default { MetricsCollector, HealthChecker, Tracer, createMetricsServer };
