/**
 * 执行上下文测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseContext } from './base-context.js';
import { ExecuteContext } from './execute-context.js';
import { PollContext } from './poll-context.js';
import { TriggerContext } from './trigger-context.js';
import { ContextFactory } from './context-factory.js';
import { ContextManager } from './context-manager.js';

describe('BaseContext', () => {
  let context;
  let mockLogger;
  let mockExecutionStack;
  let mockWorkflow;
  let mockNode;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    mockExecutionStack = {
      get: (nodeId) => nodeId === 'test-node' ? { output: { data: 'test' } } : null,
      isCompleted: (nodeId) => nodeId === 'completed-node',
      isFailed: (nodeId) => nodeId === 'failed-node',
      getCompletedNodes: () => new Set(['completed-node']),
      getFailedNodes: () => new Set(['failed-node']),
      getProgress: () => 50
    };

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      version: '1.0.0',
      nodes: [
        { id: 'node-1', name: 'Node 1' },
        { id: 'node-2', name: 'Node 2' }
      ]
    };

    mockNode = {
      id: 'test-node',
      name: 'Test Node',
      type: 'test',
      parameters: {
        param1: 'value1',
        param2: 'value2'
      }
    };

    context = new BaseContext({
      executionId: 'exec-1',
      nodeId: 'test-node',
      workflow: mockWorkflow,
      node: mockNode,
      mode: 'manual',
      logger: mockLogger,
      executionStack: mockExecutionStack
    });
  });

  it('should create a context with correct properties', () => {
    expect(context.getExecutionId()).toBe('exec-1');
    expect(context.getNodeId()).toBe('test-node');
    expect(context.getMode()).toBe('manual');
    expect(context.getLogger()).toBe(mockLogger);
    expect(context.getExecutionStack()).toBe(mockExecutionStack);
  });

  it('should get node information', () => {
    const node = context.getNode();
    expect(node.id).toBe('test-node');
    expect(node.name).toBe('Test Node');
    expect(node.parameters).toBeDefined();
  });

  it('should get workflow information', () => {
    const workflow = context.getWorkflow();
    expect(workflow.id).toBe('workflow-1');
    expect(workflow.name).toBe('Test Workflow');
    expect(workflow.version).toBe('1.0.0');
  });

  it('should get node parameter', () => {
    expect(context.getNodeParameter('param1')).toBe('value1');
    expect(context.getNodeParameter('param2')).toBe('value2');
    expect(context.getNodeParameter('param3', 'default')).toBe('default');
  });

  it('should get node output', () => {
    expect(context.getNodeOutput('test-node')).toEqual({ data: 'test' });
    expect(context.getNodeOutput('non-existent')).toBeNull();
  });

  it('should check node completion status', () => {
    expect(context.isNodeCompleted('completed-node')).toBe(true);
    expect(context.isNodeCompleted('test-node')).toBe(false);
    expect(context.isNodeFailed('failed-node')).toBe(true);
    expect(context.isNodeFailed('test-node')).toBe(false);
  });

  it('should get execution progress', () => {
    const progress = context.getProgress();
    expect(progress.completed).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.total).toBe(2);
    expect(progress.percentage).toBe(50);
  });

  it('should manage context data', () => {
    context.setContextData('key1', 'value1');
    context.setContextData('key2', { nested: 'data' });

    expect(context.getContextData('key1')).toBe('value1');
    expect(context.getContextData('key2')).toEqual({ nested: 'data' });
    expect(context.getContextData('key3')).toBeUndefined();
  });

  it('should serialize to JSON', () => {
    context.setContextData('key1', 'value1');
    context.setContextData('key2', 'value2');

    const json = context.toJSON();
    expect(json.executionId).toBe('exec-1');
    expect(json.nodeId).toBe('test-node');
    expect(json.mode).toBe('manual');
    expect(json.contextData).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('should deserialize from JSON', () => {
    const json = {
      executionId: 'exec-2',
      nodeId: 'node-2',
      mode: 'trigger',
      contextData: { key1: 'value1', key2: 'value2' }
    };

    const deserialized = BaseContext.fromJSON(json, {
      executionId: 'exec-2',
      nodeId: 'node-2',
      workflow: mockWorkflow,
      node: mockNode,
      mode: 'trigger',
      logger: mockLogger,
      executionStack: mockExecutionStack
    });

    expect(deserialized.getExecutionId()).toBe('exec-2');
    expect(deserialized.getNodeId()).toBe('node-2');
    expect(deserialized.getMode()).toBe('trigger');
    expect(deserialized.getContextData('key1')).toBe('value1');
    expect(deserialized.getContextData('key2')).toBe('value2');
  });
});

describe('ExecuteContext', () => {
  let context;
  let mockLogger;
  let mockExecutionStack;
  let mockWorkflow;
  let mockNode;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    mockExecutionStack = {
      get: () => null,
      isCompleted: () => false,
      isFailed: () => false,
      getCompletedNodes: () => new Set(),
      getFailedNodes: () => new Set(),
      getProgress: () => 0
    };

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      version: '1.0.0',
      nodes: []
    };

    mockNode = {
      id: 'test-node',
      name: 'Test Node',
      type: 'test',
      parameters: {
        continueOnFail: true
      }
    };

    context = new ExecuteContext({
      executionId: 'exec-1',
      nodeId: 'test-node',
      workflow: mockWorkflow,
      node: mockNode,
      mode: 'manual',
      logger: mockLogger,
      executionStack: mockExecutionStack,
      inputData: [{ data: 'input1' }],
      metadata: { source: 'manual' }
    });
  });

  it('should create execute context with input data', () => {
    expect(context.getInputData()).toEqual([{ data: 'input1' }]);
    expect(context.getMetadata()).toEqual({ source: 'manual' });
  });

  it('should manage input data', () => {
    context.setInputData([{ data: 'input2' }, { data: 'input3' }]);
    expect(context.getInputData()).toHaveLength(2);

    expect(context.getInputItem(0)).toEqual({ data: 'input2' });
    expect(context.getInputItem(1)).toEqual({ data: 'input3' });

    context.addInputItem({ data: 'input4' });
    expect(context.getInputData()).toHaveLength(3);
  });

  it('should manage metadata', () => {
    context.setMetadata({ key1: 'value1' });
    expect(context.getMetadata()).toEqual({ source: 'manual', key1: 'value1' });

    context.setMetadata({ key2: 'value2' });
    expect(context.getMetadata()).toEqual({ source: 'manual', key1: 'value1', key2: 'value2' });
  });

  it('should check continue on fail', () => {
    // 测试 continueOnFail 为 true 的情况
    const nodeWithContinueOnFail = {
      ...mockNode,
      parameters: { continueOnFail: true }
    };

    const context1 = new ExecuteContext({
      executionId: 'exec-1',
      nodeId: 'test-node',
      workflow: mockWorkflow,
      node: nodeWithContinueOnFail,
      mode: 'manual',
      logger: mockLogger,
      executionStack: mockExecutionStack,
      inputData: [{ data: 'input1' }],
      metadata: { source: 'manual' }
    });

    expect(context1.continueOnFail()).toBe(true);

    // 测试 continueOnFail 为 false 的情况
    const nodeWithoutContinueOnFail = {
      ...mockNode,
      parameters: { continueOnFail: false }
    };

    const context2 = new ExecuteContext({
      executionId: 'exec-1',
      nodeId: 'test-node',
      workflow: mockWorkflow,
      node: nodeWithoutContinueOnFail,
      mode: 'manual',
      logger: mockLogger,
      executionStack: mockExecutionStack,
      inputData: [{ data: 'input1' }],
      metadata: { source: 'manual' }
    });

    expect(context2.continueOnFail()).toBe(false);
  });

  it('should manage retry count', () => {
    expect(context.canRetry()).toBe(true);
    expect(context.getRetryCount()).toBe(0);

    context.incrementRetryCount();
    expect(context.getRetryCount()).toBe(1);
    expect(context.canRetry()).toBe(true);

    context.incrementRetryCount();
    context.incrementRetryCount();
    expect(context.getRetryCount()).toBe(3);
    expect(context.canRetry()).toBe(false);
  });

  it('should calculate duration', () => {
    const startTimestamp = context.getStartTimestamp();
    expect(startTimestamp).toBeDefined();
    expect(startTimestamp).toBeLessThanOrEqual(Date.now());

    const duration = context.getDuration();
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should serialize to JSON', () => {
    const json = context.toJSON();
    expect(json.contextType).toBe('execute');
    expect(json.inputData).toBeDefined();
    expect(json.metadata).toBeDefined();
    expect(json.startTimestamp).toBeDefined();
    expect(json.duration).toBeDefined();
  });
});

describe('PollContext', () => {
  let context;
  let mockLogger;
  let mockExecutionStack;
  let mockWorkflow;
  let mockNode;
  let mockEmit;
  let mockEmitError;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    mockExecutionStack = {
      get: () => null,
      isCompleted: () => false,
      isFailed: () => false,
      getCompletedNodes: () => new Set(),
      getFailedNodes: () => new Set(),
      getProgress: () => 0
    };

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      version: '1.0.0',
      nodes: []
    };

    mockNode = {
      id: 'test-node',
      name: 'Test Node',
      type: 'poll-test',
      parameters: {
        pollInterval: 30000
      }
    };

    mockEmit = vi.fn().mockResolvedValue(undefined);
    mockEmitError = vi.fn().mockResolvedValue(undefined);

    context = new PollContext({
      executionId: 'exec-1',
      nodeId: 'test-node',
      workflow: mockWorkflow,
      node: mockNode,
      mode: 'trigger',
      logger: mockLogger,
      executionStack: mockExecutionStack,
      activationMode: 'manual',
      emit: mockEmit,
      emitError: mockEmitError
    });
  });

  it('should create poll context with activation mode', () => {
    expect(context.getActivationMode()).toBe('manual');
  });

  it('should emit data', async () => {
    await context.emit([{ data: 'test' }]);

    expect(mockEmit).toHaveBeenCalledWith([{ data: 'test' }]);
    expect(context.getPollCount()).toBe(1);
    expect(context.getLastPollTime()).toBeDefined();
  });

  it('should emit error', async () => {
    const error = new Error('Test error');
    await context.emitError(error);

    expect(mockEmitError).toHaveBeenCalledWith(error);
  });

  it('should manage poll count', () => {
    expect(context.getPollCount()).toBe(0);

    context.resetPollCount();
    expect(context.getPollCount()).toBe(0);
  });

  it('should get poll interval', () => {
    expect(context.getPollInterval()).toBe(30000);

    mockNode.parameters.pollInterval = 60000;
    expect(context.getPollInterval()).toBe(60000);
  });

  it('should check if should poll', () => {
    expect(context.shouldPoll()).toBe(true);

    // After first poll, should not poll immediately
    context._lastPollTime = new Date().toISOString();
    expect(context.shouldPoll()).toBe(false);
  });

  it('should wait for next poll', async () => {
    // Mock setTimeout to avoid actual waiting
    vi.useFakeTimers();

    const promise = context.waitForNextPoll();

    // Fast-forward time
    vi.advanceTimersByTime(30000);

    await promise;

    vi.useRealTimers();
  });

  it('should serialize to JSON', () => {
    const json = context.toJSON();
    expect(json.contextType).toBe('poll');
    expect(json.activationMode).toBe('manual');
    expect(json.pollCount).toBe(0);
  });
});

describe('TriggerContext', () => {
  let context;
  let mockLogger;
  let mockExecutionStack;
  let mockWorkflow;
  let mockNode;
  let mockEmit;
  let mockEmitError;
  let mockSaveFailedExecution;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    mockExecutionStack = {
      get: () => null,
      isCompleted: () => false,
      isFailed: () => false,
      getCompletedNodes: () => new Set(),
      getFailedNodes: () => new Set(),
      getProgress: () => 0
    };

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      version: '1.0.0',
      nodes: []
    };

    mockNode = {
      id: 'test-node',
      name: 'Test Node',
      type: 'trigger-test',
      parameters: {
        triggerConfig: { enabled: true }
      }
    };

    mockEmit = vi.fn().mockResolvedValue(undefined);
    mockEmitError = vi.fn().mockResolvedValue(undefined);
    mockSaveFailedExecution = vi.fn().mockResolvedValue(undefined);

    context = new TriggerContext({
      executionId: 'exec-1',
      nodeId: 'test-node',
      workflow: mockWorkflow,
      node: mockNode,
      mode: 'trigger',
      logger: mockLogger,
      executionStack: mockExecutionStack,
      activationMode: 'manual',
      emit: mockEmit,
      emitError: mockEmitError,
      saveFailedExecution: mockSaveFailedExecution
    });
  });

  it('should create trigger context with activation mode', () => {
    expect(context.getActivationMode()).toBe('manual');
  });

  it('should emit data', async () => {
    await context.emit([{ data: 'test' }]);

    expect(mockEmit).toHaveBeenCalledWith([{ data: 'test' }]);
    expect(context.getTriggerCount()).toBe(1);
    expect(context.getLastTriggerTime()).toBeDefined();
  });

  it('should emit error', async () => {
    const error = new Error('Test error');
    await context.emitError(error);

    expect(mockEmitError).toHaveBeenCalledWith(error);
  });

  it('should save failed execution', async () => {
    const error = new Error('Test error');
    const executionData = { data: 'test' };

    await context.saveFailedExecution(error, executionData);

    expect(mockSaveFailedExecution).toHaveBeenCalledWith(error, executionData);
  });

  it('should manage trigger count', () => {
    expect(context.getTriggerCount()).toBe(0);

    context.resetTriggerCount();
    expect(context.getTriggerCount()).toBe(0);
  });

  it('should get trigger config', () => {
    const config = context.getTriggerConfig();
    expect(config).toEqual({ enabled: true });
  });

  it('should check if should activate', () => {
    expect(context.shouldActivate()).toBe(true);
  });

  it('should get trigger type', () => {
    expect(context.getTriggerType()).toBe('trigger-test');
  });

  it('should serialize to JSON', () => {
    const json = context.toJSON();
    expect(json.contextType).toBe('trigger');
    expect(json.activationMode).toBe('manual');
    expect(json.triggerCount).toBe(0);
  });
});

describe('ContextFactory', () => {
  let mockLogger;
  let mockExecutionStack;
  let mockWorkflow;
  let mockNode;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    mockExecutionStack = {
      get: () => null,
      isCompleted: () => false,
      isFailed: () => false,
      getCompletedNodes: () => new Set(),
      getFailedNodes: () => new Set(),
      getProgress: () => 0
    };

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      version: '1.0.0',
      nodes: []
    };

    mockNode = {
      id: 'test-node',
      name: 'Test Node',
      type: 'test',
      parameters: {}
    };
  });

  const baseOptions = {
    executionId: 'exec-1',
    nodeId: 'test-node',
    workflow: mockWorkflow,
    node: mockNode,
    mode: 'manual',
    logger: mockLogger,
    executionStack: mockExecutionStack
  };

  it('should create base context', () => {
    const context = ContextFactory.create('base', baseOptions);
    expect(context).toBeInstanceOf(BaseContext);
  });

  it('should create execute context', () => {
    const context = ContextFactory.create('execute', baseOptions);
    expect(context).toBeInstanceOf(ExecuteContext);
  });

  it('should create poll context', () => {
    const context = ContextFactory.create('poll', {
      ...baseOptions,
      activationMode: 'manual',
      emit: () => {},
      emitError: () => {}
    });
    expect(context).toBeInstanceOf(PollContext);
  });

  it('should create trigger context', () => {
    const context = ContextFactory.create('trigger', {
      ...baseOptions,
      activationMode: 'manual',
      emit: () => {},
      emitError: () => {},
      saveFailedExecution: () => {}
    });
    expect(context).toBeInstanceOf(TriggerContext);
  });

  it('should throw error for unknown context type', () => {
    expect(() => ContextFactory.create('unknown', baseOptions)).toThrow('Unknown context type: unknown');
  });

  it('should create context for node', () => {
    mockNode.type = 'execute-test';
    let context = ContextFactory.createForNode(mockNode, baseOptions);
    expect(context).toBeInstanceOf(ExecuteContext);

    mockNode.type = 'poll-test';
    context = ContextFactory.createForNode(mockNode, {
      ...baseOptions,
      activationMode: 'manual',
      emit: () => {},
      emitError: () => {}
    });
    expect(context).toBeInstanceOf(PollContext);

    mockNode.type = 'trigger-test';
    context = ContextFactory.createForNode(mockNode, {
      ...baseOptions,
      activationMode: 'manual',
      emit: () => {},
      emitError: () => {},
      saveFailedExecution: () => {}
    });
    expect(context).toBeInstanceOf(TriggerContext);
  });

  it('should register custom context type', () => {
    class CustomContext extends BaseContext {}

    ContextFactory.register('custom', CustomContext);
    expect(ContextFactory.isRegistered('custom')).toBe(true);

    const context = ContextFactory.create('custom', baseOptions);
    expect(context).toBeInstanceOf(CustomContext);
  });

  it('should throw error when registering invalid context type', () => {
    expect(() => ContextFactory.register('invalid', 'not a class')).toThrow('ContextClass must be a class');

    // 创建一个不继承 BaseContext 的类
    class InvalidContext {}
    expect(() => ContextFactory.register('invalid2', InvalidContext)).toThrow('ContextClass must extend BaseContext');
  });

  it('should get registered types', () => {
    const types = ContextFactory.getRegisteredTypes();
    expect(types).toContain('base');
    expect(types).toContain('execute');
    expect(types).toContain('poll');
    expect(types).toContain('trigger');
  });

  it('should deserialize from JSON', () => {
    const json = {
      executionId: 'exec-1',
      nodeId: 'test-node',
      mode: 'manual',
      contextType: 'execute',
      contextData: { key1: 'value1' },
      inputData: [],
      metadata: {},
      startTimestamp: Date.now(),
      duration: 0
    };

    const context = ContextFactory.fromJSON(json, baseOptions);
    expect(context).toBeInstanceOf(ExecuteContext);
    expect(context.getExecutionId()).toBe('exec-1');
    expect(context.getNodeId()).toBe('test-node');
    expect(context.getContextData('key1')).toBe('value1');
  });
});

describe('ContextManager', () => {
  let manager;
  let mockLogger;
  let mockWorkflow;
  let mockNode;
  let mockExecutionStack;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    mockExecutionStack = {
      get: () => null,
      isCompleted: () => false,
      isFailed: () => false,
      getCompletedNodes: () => new Set(),
      getFailedNodes: () => new Set(),
      getProgress: () => 0
    };

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      version: '1.0.0',
      nodes: []
    };

    mockNode = {
      id: 'test-node',
      name: 'Test Node',
      type: 'test',
      parameters: {}
    };

    manager = new ContextManager({ logger: mockLogger });
  });

  const baseOptions = {
    workflow: mockWorkflow,
    node: mockNode,
    mode: 'manual',
    logger: mockLogger,
    executionStack: mockExecutionStack
  };

  it('should create context', () => {
    const context = manager.createContext('exec-1', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-1'
    });

    expect(context).toBeInstanceOf(ExecuteContext);
    expect(context.getExecutionId()).toBe('exec-1');
    expect(context.getNodeId()).toBe('node-1');
  });

  it('should get context', () => {
    manager.createContext('exec-1', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-1'
    });

    const context = manager.getContext('exec-1', 'node-1');
    expect(context).toBeDefined();
    expect(context.getExecutionId()).toBe('exec-1');
    expect(context.getNodeId()).toBe('node-1');
  });

  it('should return undefined for non-existent context', () => {
    const context = manager.getContext('exec-1', 'node-1');
    expect(context).toBeUndefined();
  });

  it('should get all execution contexts', () => {
    manager.createContext('exec-1', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-1'
    });
    manager.createContext('exec-1', 'node-2', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-2'
    });

    const contexts = manager.getExecutionContexts('exec-1');
    expect(contexts.size).toBe(2);
    expect(contexts.has('node-1')).toBe(true);
    expect(contexts.has('node-2')).toBe(true);
  });

  it('should remove context', () => {
    manager.createContext('exec-1', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-1'
    });

    manager.removeContext('exec-1', 'node-1');
    const context = manager.getContext('exec-1', 'node-1');
    expect(context).toBeUndefined();
  });

  it('should clear execution contexts', () => {
    manager.createContext('exec-1', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-1'
    });
    manager.createContext('exec-1', 'node-2', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-2'
    });

    manager.clearExecutionContexts('exec-1');

    const contexts = manager.getExecutionContexts('exec-1');
    expect(contexts.size).toBe(0);
  });

  it('should set and get parent context', () => {
    const parentContext = { executionId: 'parent-exec', contextData: { key: 'value' } };
    manager.setParentContext('child-exec', parentContext);

    const retrieved = manager.getParentContext('child-exec');
    expect(retrieved).toEqual(parentContext);
  });

  it('should create child context', () => {
    manager.setParentContext('parent-exec', { executionId: 'parent-exec', contextData: { key: 'value' } });

    const childContext = manager.createChildContext('parent-exec', 'child-exec', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'child-exec',
      nodeId: 'node-1'
    });

    expect(childContext).toBeInstanceOf(ExecuteContext);
    expect(childContext.getExecutionId()).toBe('child-exec');

    const parentContext = manager.getParentContext('child-exec');
    expect(parentContext).toBeDefined();
    expect(parentContext.executionId).toBe('parent-exec');
  });

  it('should serialize execution contexts', () => {
    manager.createContext('exec-1', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-1'
    });
    manager.createContext('exec-1', 'node-2', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-2'
    });

    const serialized = manager.serializeExecutionContexts('exec-1');
    expect(serialized).toBeDefined();
    expect(serialized['node-1']).toBeDefined();
    expect(serialized['node-2']).toBeDefined();
    expect(serialized['node-1'].contextType).toBe('execute');
    expect(serialized['node-2'].contextType).toBe('execute');
  });

  it('should deserialize execution contexts', () => {
    const json = {
      'node-1': {
        executionId: 'exec-1',
        nodeId: 'node-1',
        mode: 'manual',
        contextType: 'execute',
        contextData: {},
        inputData: [],
        metadata: {},
        startTimestamp: Date.now(),
        duration: 0
      },
      'node-2': {
        executionId: 'exec-1',
        nodeId: 'node-2',
        mode: 'manual',
        contextType: 'execute',
        contextData: {},
        inputData: [],
        metadata: {},
        startTimestamp: Date.now(),
        duration: 0
      }
    };

    const contexts = manager.deserializeExecutionContexts('exec-1', json);
    expect(contexts.size).toBe(2);
    expect(contexts.has('node-1')).toBe(true);
    expect(contexts.has('node-2')).toBe(true);
  });

  it('should get stats', () => {
    manager.createContext('exec-1', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-1'
    });
    manager.createContext('exec-1', 'node-2', 'poll', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-2',
      activationMode: 'manual',
      emit: () => {},
      emitError: () => {}
    });
    manager.createContext('exec-2', 'node-3', 'trigger', {
      ...baseOptions,
      executionId: 'exec-2',
      nodeId: 'node-3',
      activationMode: 'manual',
      emit: () => {},
      emitError: () => {},
      saveFailedExecution: () => {}
    });

    const stats = manager.getStats();
    expect(stats.totalExecutionContexts).toBe(2);
    expect(stats.totalContexts).toBe(3);
    expect(stats.contextsByType['ExecuteContext']).toBe(1);
    expect(stats.contextsByType['PollContext']).toBe(1);
    expect(stats.contextsByType['TriggerContext']).toBe(1);
  });

  it('should clear all contexts', () => {
    manager.createContext('exec-1', 'node-1', 'execute', {
      ...baseOptions,
      executionId: 'exec-1',
      nodeId: 'node-1'
    });
    manager.createContext('exec-2', 'node-2', 'execute', {
      ...baseOptions,
      executionId: 'exec-2',
      nodeId: 'node-2'
    });

    manager.clearAll();

    const stats = manager.getStats();
    expect(stats.totalExecutionContexts).toBe(0);
    expect(stats.totalContexts).toBe(0);
  });
});
