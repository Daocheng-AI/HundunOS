/**
 * HundunOS v4.3 - 性能基准测试
 * 测试三层压缩机制的性能提升
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreKernelV4 } from '../../kernel/core.v4.js';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('HundunOS v4.3 Performance Benchmarks', () => {
  let kernel;
  const storageDir = '.hundunos/test-benchmark';

  beforeEach(async () => {
    mkdirSync(storageDir, { recursive: true });
    
    kernel = new CoreKernelV4({
      projectRoot: process.cwd(),
      storageDir,
      system: {
        compact: {
          enabled: true,
          contextWindowThreshold: 8000,
          summaryModel: 'gpt-4o-mini',
          maxSummaryTokens: 500,
          microCompactEnabled: true,
          keepRecentToolResults: 3,
          maxHistoryRounds: 10,
        },
      },
    });

    // Mock modelRouter with realistic response
    kernel.modelRouter = {
      route: vi.fn().mockImplementation(async (request) => {
        const messages = request.messages || [];
        const tokenCount = estimateTokens(messages);
        return {
          success: true,
          content: [{ text: `Response (${tokenCount} tokens)` }],
          usage: { total_tokens: tokenCount },
        };
      }),
    };

    await kernel.initialize();
  });

  afterEach(async () => {
    if (kernel) {
      await kernel.shutdown?.();
    }
    rmSync(storageDir, { recursive: true, force: true });
  });

  function estimateTokens(messages) {
    let count = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      count += Math.ceil(content.length / 4);
    }
    return count;
  }

  function generateToolOutput(size) {
    return 'x'.repeat(size);
  }

  describe('PersistedOutputMarker 性能', () => {
    it('should persist large tool outputs', async () => {
      const largeOutput = generateToolOutput(60000);
      
      const result = await kernel.toolBridge.execute('Bash', JSON.stringify({
        command: 'echo "test"',
      }));

      // Mock large output
      result.stdout = largeOutput;
      
      const { maybePersistedOutput } = await import('../../kernel/tool-bridge.js');
      const persisted = maybePersistedOutput('test-tool', largeOutput, kernel);

      expect(persisted).toContain('<persisted-output>');
      expect(persisted).toContain('Full output saved to:');
      expect(persisted.length).toBeLessThan(largeOutput.length);
    });

    it('should not persist small outputs', () => {
      const smallOutput = 'Small output';
      
      const { maybePersistedOutput } = require('../../kernel/tool-bridge.js');
      const persisted = maybePersistedOutput('test-tool', smallOutput, kernel);

      expect(persisted).toBe(smallOutput);
    });
  });

  describe('Microcompact 性能', () => {
    it('should reduce tool result count', async () => {
      const { microcompact } = await import('../../kernel/mixins/ProcessMixin.js');

      const messages = [];
      for (let i = 0; i < 10; i++) {
        messages.push({ role: 'user', content: [{ tool_use_id: `${i}`, name: 'Bash', input: `echo "${i}"` }] });
        messages.push({ role: 'tool', content: `Output ${i}` });
      }

      const start = Date.now();
      const compacted = microcompact(messages);
      const duration = Date.now() - start;

      const toolResultsBefore = messages.filter(m => m.role === 'tool' || (m.role === 'user' && Array.isArray(m.content)));
      const toolResultsAfter = compacted.filter(m => m.role === 'tool' || (m.role === 'user' && Array.isArray(m.content)));

      expect(toolResultsAfter.length).toBeLessThan(toolResultsBefore.length);
      expect(duration).toBeLessThan(100); // Should be fast
    });
  });

  describe('LLM Summarization 性能', () => {
    it('should compress long conversations', async () => {
      const session = {
        id: 'test-session',
        messages: [],
      };

      // Generate 20 rounds of conversation
      for (let i = 0; i < 20; i++) {
        session.messages.push({ role: 'user', content: `User message ${i}` });
        session.messages.push({ role: 'assistant', content: `Assistant response ${i}` });
      }

      const originalTokenCount = estimateTokens(session.messages);
      expect(originalTokenCount).toBeGreaterThan(8000);

      const start = Date.now();
      const compressed = await kernel.compactor.compact(session.messages, {
        model: 'gpt-4o-mini',
      });
      const duration = Date.now() - start;

      const compressedTokenCount = estimateTokens(compressed.summary ? [compressed.summary, ...compressed.preservedMessages, ...compressed.recent] : compressed);

      expect(compressedTokenCount).toBeLessThan(originalTokenCount);
      expect(compressed.stats.originalCount).toBe(session.messages.length);
      expect(compressed.stats.compressedCount).toBeLessThan(session.messages.length);
    });
  });

  describe('Token 消耗对比', () => {
    it('should measure token reduction with compact enabled', async () => {
      const messages = [];
      for (let i = 0; i < 30; i++) {
        messages.push({ role: 'user', content: `User message ${i}` });
        messages.push({ role: 'assistant', content: `Assistant response ${i}` });
      }

      const originalTokens = estimateTokens(messages);

      const start = Date.now();
      const compressed = await kernel.compactor.compact(messages, {
        model: 'gpt-4o-mini',
      });
      const duration = Date.now() - start;

      const compressedTokens = estimateTokens(
        compressed.summary ? [compressed.summary, ...compressed.preservedMessages, ...compressed.recent] : compressed
      );

      const reduction = originalTokens - compressedTokens;
      const reductionPercent = (reduction / originalTokens * 100).toFixed(2);

      console.log(`\nToken Reduction Benchmark:`);
      console.log(`  Original tokens: ${originalTokens}`);
      console.log(`  Compressed tokens: ${compressedTokens}`);
      console.log(`  Reduction: ${reduction} tokens (${reductionPercent}%)`);
      console.log(`  Compression time: ${duration}ms\n`);

      expect(reduction).toBeGreaterThan(0);
    });
  });

  describe('Autonomous Agents 调度性能', () => {
    it('should measure task dispatch latency', async () => {
      const agentManager = kernel.autonomousAgentManager;
      await agentManager.initialize();

      // Register agents
      for (let i = 0; i < 5; i++) {
        agentManager.registerAgent({
          name: `agent-${i}`,
          capabilities: ['code'],
        });
      }

      // Submit tasks
      const taskIds = [];
      const submitTimes = [];

      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        const taskId = agentManager.submitTask({
          subject: `Task ${i}`,
          priority: i % 2 === 0 ? 'high' : 'normal',
          requiredCapabilities: ['code'],
        });
        const duration = Date.now() - start;
        
        taskIds.push(taskId);
        submitTimes.push(duration);
      }

      const avgSubmitTime = submitTimes.reduce((a, b) => a + b, 0) / submitTimes.length;
      const maxSubmitTime = Math.max(...submitTimes);
      const minSubmitTime = Math.min(...submitTimes);

      console.log(`\nTask Dispatch Benchmark:`);
      console.log(`  Tasks submitted: ${taskIds.length}`);
      console.log(`  Avg submit time: ${avgSubmitTime.toFixed(2)}ms`);
      console.log(`  Max submit time: ${maxSubmitTime}ms`);
      console.log(`  Min submit time: ${minSubmitTime}ms\n`);

      expect(avgSubmitTime).toBeLessThan(10); // Should be very fast
    });
  });

  describe('Todo Manager 性能', () => {
    it('should measure todo update latency', async () => {
      const iterations = 100;
      const latencies = [];

      for (let i = 0; i < iterations; i++) {
        const items = [
          { content: 'Task 1', status: 'pending' },
          { content: 'Task 2', status: 'in_progress', activeForm: 'Working on Task 2' },
          { content: 'Task 3', status: 'completed' },
        ];

        const start = Date.now();
        kernel.todoManager.update(items);
        const duration = Date.now() - start;
        
        latencies.push(duration);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      console.log(`\nTodo Update Benchmark (${iterations} iterations):`);
      console.log(`  Avg latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`  Max latency: ${maxLatency}ms`);
      console.log(`  Min latency: ${minLatency}ms\n`);

      expect(avgLatency).toBeLessThan(5); // Should be very fast
    });
  });

  describe('TaskGraph 性能', () => {
    it('should measure task operations latency', async () => {
      const createLatencies = [];
      const updateLatencies = [];
      const getLatencies = [];

      // Create tasks
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        await kernel.taskGraph.create(`Task ${i}`, `Description ${i}`);
        const duration = Date.now() - start;
        createLatencies.push(duration);
      }

      // Update tasks
      for (let i = 1; i <= 50; i++) {
        const start = Date.now();
        await kernel.taskGraph.update(i, 'in_progress', `agent-${i % 5}`);
        const duration = Date.now() - start;
        updateLatencies.push(duration);
      }

      // Get tasks
      for (let i = 1; i <= 50; i++) {
        const start = Date.now();
        await kernel.taskGraph.get(i);
        const duration = Date.now() - start;
        getLatencies.push(duration);
      }

      const avgCreate = createLatencies.reduce((a, b) => a + b, 0) / createLatencies.length;
      const avgUpdate = updateLatencies.reduce((a, b) => a + b, 0) / updateLatencies.length;
      const avgGet = getLatencies.reduce((a, b) => a + b, 0) / getLatencies.length;

      console.log(`\nTaskGraph Benchmark (50 tasks):`);
      console.log(`  Avg create latency: ${avgCreate.toFixed(2)}ms`);
      console.log(`  Avg update latency: ${avgUpdate.toFixed(2)}ms`);
      console.log(`  Avg get latency: ${avgGet.toFixed(2)}ms\n`);

      expect(avgCreate).toBeLessThan(10);
      expect(avgUpdate).toBeLessThan(10);
      expect(avgGet).toBeLessThan(5);
    });

    it('should measure dependency graph performance', async () => {
      // Create task chain: 1 -> 2 -> 3 -> ... -> 100
      const taskIds = [];
      for (let i = 0; i < 100; i++) {
        const task = await kernel.taskGraph.create(`Task ${i}`);
        taskIds.push(task.id);
      }

      // Add dependencies
      const dependencyLatencies = [];
      for (let i = 1; i < 100; i++) {
        const start = Date.now();
        await kernel.taskGraph.update(taskIds[i], null, null, [taskIds[i - 1]]);
        const duration = Date.now() - start;
        dependencyLatencies.push(duration);
      }

      const avgDependency = dependencyLatencies.reduce((a, b) => a + b, 0) / dependencyLatencies.length;

      // Get dependency graph
      const start = Date.now();
      const graph = await kernel.taskGraph.getDependencyGraph();
      const duration = Date.now() - start;

      console.log(`\nDependency Graph Benchmark (100 tasks):`);
      console.log(`  Avg add dependency latency: ${avgDependency.toFixed(2)}ms`);
      console.log(`  Get graph latency: ${duration}ms`);
      console.log(`  Nodes: ${graph.nodes.length}`);
      console.log(`  Edges: ${graph.edges.length}\n`);

      expect(graph.nodes.length).toBe(100);
      expect(graph.edges.length).toBe(99);
    });
  });

  describe('MessageBus 性能', () => {
    it('should measure message throughput', async () => {
      const messageBus = kernel.agentTeams.messageBus;
      const iterations = 1000;
      const latencies = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        messageBus.send(`sender-${i}`, `receiver-${i}`, `Message ${i}`, 'message');
        const duration = Date.now() - start;
        latencies.push(duration);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const throughput = iterations / (latencies.reduce((a, b) => a + b, 0) / 1000);

      console.log(`\nMessageBus Benchmark (${iterations} messages):`);
      console.log(`  Avg latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`  Max latency: ${maxLatency}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} msg/s\n`);

      expect(avgLatency).toBeLessThan(1); // Should be very fast
      expect(throughput).toBeGreaterThan(1000);
    });
  });

  describe('Plan Approval 性能', () => {
    it('should measure approval cycle latency', async () => {
      const approvalManager = kernel.agentTeams.planApprovalManager;
      const iterations = 100;
      const cycleLatencies = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        
        const requestId = await approvalManager.requestApproval(`worker-${i}`, {
          subject: `Task ${i}`,
        });
        
        await approvalManager.respond(requestId, 'approve', 'OK');
        
        const duration = Date.now() - start;
        cycleLatencies.push(duration);
      }

      const avgCycle = cycleLatencies.reduce((a, b) => a + b, 0) / cycleLatencies.length;
      const maxCycle = Math.max(...cycleLatencies);
      const minCycle = Math.min(...cycleLatencies);

      console.log(`\nPlan Approval Benchmark (${iterations} cycles):`);
      console.log(`  Avg cycle latency: ${avgCycle.toFixed(2)}ms`);
      console.log(`  Max cycle latency: ${maxCycle}ms`);
      console.log(`  Min cycle latency: ${minCycle}ms\n`);

      expect(avgCycle).toBeLessThan(10);
    });
  });

  describe('综合性能对比', () => {
    it('should compare performance with and without compact', async () => {
      const messages = [];
      for (let i = 0; i < 50; i++) {
        messages.push({ role: 'user', content: `User message ${i}` });
        messages.push({ role: 'assistant', content: `Assistant response ${i}` });
      }

      const originalTokens = estimateTokens(messages);

      // With compact
      const startCompact = Date.now();
      const compressed = await kernel.compactor.compact(messages, {
        model: 'gpt-4o-mini',
      });
      const durationCompact = Date.now() - startCompact;

      const compressedTokens = estimateTokens(
        compressed.summary ? [compressed.summary, ...compressed.preservedMessages, ...compressed.recent] : compressed
      );

      console.log(`\nComprehensive Performance Comparison:`);
      console.log(`  Original tokens: ${originalTokens}`);
      console.log(`  Compressed tokens: ${compressedTokens}`);
      console.log(`  Token reduction: ${originalTokens - compressedTokens} (${((originalTokens - compressedTokens) / originalTokens * 100).toFixed(2)}%)`);
      console.log(`  Compression time: ${durationCompact}ms`);
      console.log(`  Messages reduced: ${compressed.stats.originalCount} → ${compressed.stats.compressedCount}\n`);

      expect(compressedTokens).toBeLessThan(originalTokens);
    });
  });
});
