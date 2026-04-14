/**
 * Agent SDK - 工具运行时测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Tool,
  ToolContext,
  ToolExecutionResult,
  ToolRegistry,
  ToolStates,
  createTool,
  createToolRegistry
} from './tool.js';

// 导出 Tool 类供测试使用
export { Tool, ToolContext, ToolExecutionResult };
import { z } from 'zod';

describe('ToolContext', () => {
  it('should create a tool context with default values', () => {
    const context = new ToolContext();
    
    expect(context.agentId).toBeNull();
    expect(context.executionId).toBeNull();
    expect(context.metadata).toEqual({});
    expect(context.parentTelemetry).toBeNull();
  });

  it('should create a tool context with options', () => {
    const context = new ToolContext({
      agentId: 'agent-1',
      executionId: 'exec-1',
      metadata: { key: 'value' }
    });
    
    expect(context.agentId).toBe('agent-1');
    expect(context.executionId).toBe('exec-1');
    expect(context.metadata.key).toBe('value');
  });

  it('should create child context', () => {
    const parentContext = new ToolContext({
      agentId: 'agent-1',
      metadata: { parentKey: 'parentValue' }
    });
    
    const childContext = parentContext.createChildContext({
      metadata: { childKey: 'childValue' }
    });
    
    expect(childContext.agentId).toBe('agent-1');
    expect(childContext.metadata.parentKey).toBe('parentValue');
    expect(childContext.metadata.childKey).toBe('childValue');
    expect(childContext.parentTelemetry).toBe(parentContext);
  });

  it('should get and set metadata', () => {
    const context = new ToolContext();
    
    context.setMetadata('key', 'value');
    expect(context.getMetadata('key')).toBe('value');
  });

  it('should record events', () => {
    const telemetry = {
      recordEvent: vi.fn()
    };
    
    const context = new ToolContext({ parentTelemetry: telemetry });
    context.recordEvent('test_event', { data: 'test' });
    
    expect(telemetry.recordEvent).toHaveBeenCalledWith('test_event', { data: 'test' });
  });
});

describe('ToolExecutionResult', () => {
  it('should create a successful result', () => {
    const result = new ToolExecutionResult(true, { output: 'test' });
    
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ output: 'test' });
    expect(result.error).toBeNull();
    expect(result.state).toBe(ToolStates.COMPLETED);
  });

  it('should create a failed result', () => {
    const result = new ToolExecutionResult(false, null, 'Error occurred');
    
    expect(result.success).toBe(false);
    expect(result.output).toBeNull();
    expect(result.error).toBe('Error occurred');
    expect(result.state).toBe(ToolStates.ERROR);
  });

  it('should calculate duration', () => {
    const startTime = Date.now();
    const endTime = startTime + 1000;
    
    const result = new ToolExecutionResult(true, { output: 'test' }, null, {
      startTime,
      endTime
    });
    
    expect(result.getDuration()).toBe(1000);
  });

  it('should serialize to JSON', () => {
    const result = new ToolExecutionResult(true, { output: 'test' });
    const json = result.toJSON();
    
    expect(json.success).toBe(true);
    expect(json.output).toEqual({ output: 'test' });
    expect(json.state).toBe(ToolStates.COMPLETED);
    expect(json.metadata).toBeDefined();
  });
});

describe('Tool', () => {
  let tool;

  beforeEach(() => {
    tool = createTool('test-tool')
      .setDescription('A test tool')
      .setInputSchema(z.object({ query: z.string() }))
      .setOutputSchema(z.object({ result: z.string() }))
      .setHandler(async ({ query }) => ({ result: `Found: ${query}` }));
  });

  it('should build a tool successfully', () => {
    const builtTool = tool.build();
    
    expect(builtTool.name).toBe('test-tool');
    expect(builtTool.description).toBe('A test tool');
    expect(builtTool.handler).toBeDefined();
  });

  it('should throw error when building without description', () => {
    const invalidTool = createTool('invalid-tool')
      .setHandler(async () => ({}));
    
    expect(() => invalidTool.build()).toThrow('must have a description');
  });

  it('should throw error when building without handler', () => {
    const invalidTool = createTool('invalid-tool')
      .setDescription('Invalid tool');
    
    expect(() => invalidTool.build()).toThrow('must have a handler');
  });

  it('should validate valid input', () => {
    const validation = tool.validateInput({ query: 'test' });
    
    expect(validation.valid).toBe(true);
    expect(validation.validated).toEqual({ query: 'test' });
  });

  it('should validate invalid input', () => {
    const validation = tool.validateInput({ query: 123 }); // Invalid type
    
    expect(validation.valid).toBe(false);
    expect(validation.error).toBeDefined();
  });

  it('should validate valid output', () => {
    const validation = tool.validateOutput({ result: 'test' });
    
    expect(validation.valid).toBe(true);
    expect(validation.validated).toEqual({ result: 'test' });
  });

  it('should validate invalid output', () => {
    const validation = tool.validateOutput({ result: 123 }); // Invalid type
    
    expect(validation.valid).toBe(false);
    expect(validation.error).toBeDefined();
  });

  it('should execute tool successfully', async () => {
    const result = await tool.execute({ query: 'test' });
    
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ result: 'Found: test' });
    expect(result.state).toBe(ToolStates.COMPLETED);
  });

  it('should fail on invalid input', async () => {
    const result = await tool.execute({ query: 123 });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid input');
    expect(result.state).toBe(ToolStates.ERROR);
  });

  it('should fail on invalid output', async () => {
    const invalidTool = createTool('invalid-output-tool')
      .setDescription('Tool with invalid output')
      .setInputSchema(z.object({}))
      .setOutputSchema(z.object({ result: z.string() }))
      .setHandler(async () => ({ result: 123 })); // Invalid output type
    
    const result = await invalidTool.execute({});
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid output');
    });

  it('should set type', () => {
    const typedTool = createTool('typed-tool')
      .setDescription('Typed tool')
      .setType('database')
      .setHandler(async () => ({}));
    
    const builtTool = typedTool.build();
    expect(builtTool.type).toBe('database');
  });

  it('should set required', () => {
    const requiredTool = createTool('required-tool')
      .setDescription('Required tool')
      .setRequired(true)
      .setHandler(async () => ({}));
    
    const builtTool = requiredTool.build();
    expect(builtTool.required).toBe(true);
  });

  it('should set timeout', () => {
    const timeoutTool = createTool('timeout-tool')
      .setDescription('Timeout tool')
      .setTimeout(5000)
      .setHandler(async () => ({}));
    
    const builtTool = timeoutTool.build();
    expect(builtTool.timeout).toBe(5000);
  });

  it('should set retry count', () => {
    const retryTool = createTool('retry-tool')
      .setDescription('Retry tool')
      .setRetry(3)
      .setHandler(async () => ({}));
    
    const builtTool = retryTool.build();
    expect(builtTool.retryCount).toBe(3);
  });

  it('should set metadata', () => {
    const metadataTool = createTool('metadata-tool')
      .setDescription('Metadata tool')
      .setMetadata({ category: 'test', version: '1.0' })
      .setHandler(async () => ({}));
    
    const builtTool = metadataTool.build();
    expect(builtTool.metadata.category).toBe('test');
    expect(builtTool.metadata.version).toBe('1.0');
  });

  it('should timeout on long-running execution', async () => {
    const slowTool = createTool('slow-tool')
      .setDescription('Slow tool')
      .setTimeout(100)
      .setHandler(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return {};
      });
    
    const result = await slowTool.execute({});
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    
    const retryTool = createTool('retry-tool')
      .setDescription('Retry tool')
      .setRetry(2)
      .setHandler(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary error');
        }
        return { success: true };
      });
    
    const result = await retryTool.execute({});
    
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ success: true });
    expect(result.metadata.retries).toBe(1); // 只重试了1次
  });

  it('should fail after max retries', async () => {
    const failingTool = createTool('failing-tool')
      .setDescription('Failing tool')
      .setRetry(1)
      .setHandler(async () => {
        throw new Error('Always fails');
      });
    
    const result = await failingTool.execute({});
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Always fails');
    expect(result.metadata.retries).toBe(2); // 1 retry + initial attempt
  });

  it('should serialize to JSON', () => {
    const json = tool.toJSON();
    
    expect(json.name).toBe('test-tool');
    expect(json.description).toBe('A test tool');
    expect(json.type).toBe('function');
    expect(json.required).toBe(false);
    expect(json.timeout).toBe(30000);
    expect(json.retryCount).toBe(0);
  });
});

describe('ToolRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  it('should register a tool', () => {
    const tool = createTool('test-tool')
      .setDescription('Test tool')
      .setHandler(async () => ({}));
    
    registry.register(tool);
    
    expect(registry.has('test-tool')).toBe(true);
    expect(registry.get('test-tool')).toBeDefined();
  });

  it('should register multiple tools', () => {
    const tool1 = createTool('tool-1')
      .setDescription('Tool 1')
      .setHandler(async () => ({}));
    
    const tool2 = createTool('tool-2')
      .setDescription('Tool 2')
      .setHandler(async () => ({}));
    
    registry.registerAll([tool1, tool2]);
    
    expect(registry.size()).toBe(2);
    expect(registry.has('tool-1')).toBe(true);
    expect(registry.has('tool-2')).toBe(true);
  });

  it('should get all tool names', () => {
    const tool1 = createTool('tool-1')
      .setDescription('Tool 1')
      .setHandler(async () => ({}));
    
    const tool2 = createTool('tool-2')
      .setDescription('Tool 2')
      .setHandler(async () => ({}));
    
    registry.registerAll([tool1, tool2]);
    
    const names = registry.getToolNames();
    expect(names).toEqual(['tool-1', 'tool-2']);
  });

  it('should get tools by category', () => {
    const tool1 = createTool('tool-1')
      .setDescription('Tool 1')
      .setMetadata({ category: 'search' })
      .setHandler(async () => ({}));
    
    const tool2 = createTool('tool-2')
      .setDescription('Tool 2')
      .setMetadata({ category: 'search' })
      .setHandler(async () => ({}));
    
    const tool3 = createTool('tool-3')
      .setDescription('Tool 3')
      .setMetadata({ category: 'database' })
      .setHandler(async () => ({}));
    
    registry.registerAll([tool1, tool2, tool3]);
    
    const searchTools = registry.getToolsByCategory('search');
    const databaseTools = registry.getToolsByCategory('database');
    
    expect(searchTools).toHaveLength(2);
    expect(searchTools[0].name).toBe('tool-1');
    expect(searchTools[1].name).toBe('tool-2');
    expect(databaseTools).toHaveLength(1);
    expect(databaseTools[0].name).toBe('tool-3');
  });

  it('should get all categories', () => {
    const tool1 = createTool('tool-1')
      .setDescription('Tool 1')
      .setMetadata({ category: 'search' })
      .setHandler(async () => ({}));
    
    const tool2 = createTool('tool-2')
      .setDescription('Tool 2')
      .setMetadata({ category: 'database' })
      .setHandler(async () => ({}));
    
    registry.registerAll([tool1, tool2]);
    
    const categories = registry.getCategories();
    expect(categories).toContain('search');
    expect(categories).toContain('database');
  });

  it('should search tools', () => {
    const tool1 = createTool('search-tool')
      .setDescription('Search the web')
      .setHandler(async () => ({}));
    
    const tool2 = createTool('calculator')
      .setDescription('Perform calculations')
      .setHandler(async () => ({}));
    
    registry.registerAll([tool1, tool2]);
    
    const results = registry.search('search');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('search-tool');
  });

  it('should unregister a tool', () => {
    const tool = createTool('test-tool')
      .setDescription('Test tool')
      .setHandler(async () => ({}));
    
    registry.register(tool);
    expect(registry.has('test-tool')).toBe(true);
    
    registry.unregister('test-tool');
    expect(registry.has('test-tool')).toBe(false);
  });

  it('should clear all tools', () => {
    const tool1 = createTool('tool-1')
      .setDescription('Tool 1')
      .setHandler(async () => ({}));
    
    const tool2 = createTool('tool-2')
      .setDescription('Tool 2')
      .setHandler(async () => ({}));
    
    registry.registerAll([tool1, tool2]);
    expect(registry.size()).toBe(2);
    
    registry.clear();
    expect(registry.size()).toBe(0);
  });

  it('should serialize to JSON', () => {
    const tool = createTool('test-tool')
      .setDescription('Test tool')
      .setMetadata({ category: 'test' })
      .setHandler(async () => ({}));
    
    registry.register(tool);
    const json = registry.toJSON();
    
    expect(json.tools).toHaveLength(1);
    expect(json.tools[0].name).toBe('test-tool');
    expect(json.categories).toHaveProperty('test');
  });
});

describe('createTool', () => {
  it('should create a tool builder', () => {
    const builder = createTool('test-tool');
    
    expect(builder).toBeInstanceOf(Tool);
    expect(builder.name).toBe('test-tool');
  });
});

describe('createToolRegistry', () => {
  it('should create a tool registry', () => {
    const registry = createToolRegistry();
    
    expect(registry).toBeInstanceOf(ToolRegistry);
    expect(registry.size()).toBe(0);
  });
});

describe('Edge Cases', () => {
  it('should handle tool without input schema', async () => {
    const tool = createTool('no-input-tool')
      .setDescription('Tool without input schema')
      .setHandler(async () => ({ result: 'success' }));
    
    const result = await tool.execute({});
    
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ result: 'success' });
  });

  it('should handle tool without output schema', async () => {
    const tool = createTool('no-output-tool')
      .setDescription('Tool without output schema')
      .setInputSchema(z.object({}))
      .setHandler(async () => ({ result: 123 }));
    
    const result = await tool.execute({});
    
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ result: 123 });
  });

  it('should handle tool execution with context', async () => {
    const context = new ToolContext({
      agentId: 'test-agent',
      metadata: { key: 'value' }
    });
    
    const tool = createTool('context-tool')
      .setDescription('Tool with context')
      .setInputSchema(z.object({}))
      .setHandler(async (input, ctx) => ({
        agentId: ctx.agentId,
        metadata: ctx.metadata
      }));
    
    const result = await tool.execute({}, context);
    
    expect(result.success).toBe(true);
    expect(result.output.agentId).toBe('test-agent');
    expect(result.output.metadata.key).toBe('value');
  });
});
