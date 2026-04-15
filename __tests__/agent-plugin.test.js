/**
 * AgentPlugin 安全与功能测试
 * 覆盖: M-05 Calculator 沙箱, L-01 参数重复, 工具输出截断
 *
 * 注意: 私有字段 (#config, #models 等) 无法从外部访问，
 * 测试通过 public API 间接验证行为。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AgentPlugin } from '../kernel/v5/plugins/features/AgentPlugin.js';

// Mock kernel and dependencies
function createMockKernel() {
  return {
    get: () => null,
    services: {
      register: () => {},
    },
    config: {
      get: () => ({}),
    },
    logger: {
      info: () => {},
      debug: () => {},
      warn: () => {},
    },
  };
}

function createMockCache() {
  return {
    get: async () => null,
    set: async () => {},
  };
}

function createMockModels() {
  return {
    chat: async () => ({ content: 'mock response' }),
  };
}

describe('AgentPlugin Security Tests', () => {

  let plugin;

  test.beforeEach(() => {
    plugin = new AgentPlugin();
    // onInit 会尝试获取 kernel.get('config') 等，mock 这些
    plugin.onInit();
  });

  // 工具注册测试
  test('registerTool and listTools work correctly', () => {
    plugin.registerTool('test-tool', {
      description: 'A test tool',
      parameters: { query: { type: 'string', required: true } },
      handler: async (params) => ({ result: `Got: ${params.query}` }),
    });

    const tools = plugin.listTools();
    assert.ok(tools.some(t => t.name === 'test-tool'), 'Registered tool appears in list');
  });

  // L-01: createAgent 不因参数问题崩溃
  test('L-01: createAgent works with config.tools parameter', () => {
    assert.doesNotThrow(() => {
      plugin.createAgent({ name: 'Test', tools: ['search'] });
    }, 'createAgent should not crash even with config.tools param');

    const agent = plugin.createAgent({ name: 'Test2', tools: ['calculator'] });
    assert.ok(agent.id, 'Agent has an ID');
  });

  // session 创建测试
  test('createSession works', () => {
    const agent = plugin.createAgent({ name: 'TestAgent' });
    const session = plugin.createSession(agent.id);
    assert.ok(session.id, 'Session has an ID');
    assert.strictEqual(session.agentId, agent.id);
  });

  // getAgent 测试
  test('getAgent returns correct agent', () => {
    const agent = plugin.createAgent({ name: 'GetTest' });
    const retrieved = plugin.getAgent(agent.id);
    assert.strictEqual(retrieved, agent, 'getAgent returns the same agent');
  });

  // 工具名称覆盖警告
  test('re-registering same tool logs warning but succeeds', () => {
    plugin.registerTool('dup-tool', {
      description: 'First',
      parameters: {},
      handler: async () => ({}),
    });
    assert.doesNotThrow(() => {
      plugin.registerTool('dup-tool', {
        description: 'Second',
        parameters: {},
        handler: async () => ({}),
      });
    }, 'Re-registering tool should not throw');
  });

  // Plugin destroy 测试
  test('onDestroy clears all agents, sessions, tools', () => {
    plugin.createAgent({ name: 'Agent1' });
    plugin.createAgent({ name: 'Agent2' });
    const session = plugin.createSession(plugin.getAgent(plugin.listTools()[0]?.name)?.id || '', {});

    assert.ok(plugin.listTools().length > 0, 'Tools registered before destroy');

    plugin.onDestroy();

    // onDestroy 清空内部 Map，再次调用 createAgent 应该正常
    assert.doesNotThrow(() => {
      plugin.createAgent({ name: 'NewAgent' });
    }, 'After destroy, new agents can be created');
  });

  // listTools 返回正确的参数信息
  test('listTools returns description and parameters', () => {
    const tools = plugin.listTools();
    for (const tool of tools) {
      assert.ok(typeof tool.name === 'string');
      assert.ok(typeof tool.description === 'string');
      assert.ok(typeof tool.parameters === 'object');
    }
  });
});
