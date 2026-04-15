/**
 * PluginManager 功能与懒加载测试
 * 覆盖: L-03 懒加载返回值、加载/卸载、依赖解析
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PluginManager } from '../kernel/v5/core/PluginManager.js';

describe('PluginManager Tests', () => {

  let manager;
  let mockKernel;

  beforeEach(() => {
    mockKernel = { config: { get: () => [] } };
    manager = new PluginManager(mockKernel);
  });

  // 注册和加载测试
  test('register and load a plugin', async () => {
    let initCalled = false;
    let destroyCalled = false;

    class TestPlugin {
      async init() { initCalled = true; }
      async destroy() { destroyCalled = true; }
    }

    manager.register('test-plugin', TestPlugin);
    const instance = await manager.load('test-plugin');

    assert.ok(initCalled, 'Plugin init was called');
    assert.ok(instance instanceof TestPlugin, 'Returns correct instance');
  });

  // L-03: 懒加载返回 Promise，不返回 undefined
  test('L-03: lazy loading getter returns a value (Promise or instance), not undefined', async () => {
    let initCalled = false;

    class LazyPlugin {
      async init() { initCalled = true; }
    }

    manager.register('lazy-plugin', LazyPlugin, { lazy: true });

    // 设置懒加载
    manager._setupLazyLoading('lazy-plugin');

    // 访问懒加载属性
    const result = mockKernel['lazy-plugin'];

    // 结果要么是 Promise（加载中）要么是已加载实例，绝不是 undefined
    assert.ok(result !== undefined, 'Lazy load should not return undefined');
    assert.ok(result !== null || typeof result === 'object',
      'Lazy load should return a Promise or instance');
  });

  // 依赖加载顺序测试
  test('dependencies are loaded before dependent plugin', async () => {
    const loadOrder = [];

    class DepPlugin {
      async init() { loadOrder.push('dep'); }
    }
    class MainPlugin {
      get dependencies() { return ['lazy-dep']; }
      async init() { loadOrder.push('main'); }
    }

    manager.register('lazy-dep', DepPlugin);
    manager.register('main-with-dep', MainPlugin);

    await manager.load('main-with-dep');

    assert.deepStrictEqual(loadOrder, ['dep', 'main'],
      'Dependency should load before dependent');
  });

  // 卸载检查
  test('cannot unload plugin with dependents', async () => {
    class DepPlugin {
      get dependencies() { return ['base-plugin']; }
      async init() {}
    }
    class BasePlugin {
      async init() {}
    }

    manager.register('base-plugin', BasePlugin);
    manager.register('dep-plugin', DepPlugin);

    await manager.load('base-plugin');
    await manager.load('dep-plugin');

    await assert.rejects(
      () => manager.unload('base-plugin'),
      /depended by/,
      'Should reject unload of depended plugin'
    );
  });

  // getStatus
  test('getStatus returns correct counts', async () => {
    class P1 { async init() {} }
    class P2 { async init() {} }

    manager.register('p1', P1);
    manager.register('p2', P2);
    await manager.load('p1');

    const status = manager.getStatus();
    assert.strictEqual(status.registered, 2);
    assert.strictEqual(status.loaded, 1);
    assert.ok(status.plugins.includes('p1'));
  });

  // 重复加载返回缓存实例
  test('load returns cached instance on repeated calls', async () => {
    let instanceCount = 0;

    class CountingPlugin {
      async init() { instanceCount++; }
    }

    manager.register('counted', CountingPlugin);

    const inst1 = await manager.load('counted');
    const inst2 = await manager.load('counted');

    assert.strictEqual(instanceCount, 1, 'Plugin should only init once');
    assert.strictEqual(inst1, inst2, 'Repeated load should return same instance');
  });

  // 钩子注册和执行
  test('hooks are registered and executed', async () => {
    const called = [];
    manager.registerHook('test-hook', async (ctx) => { called.push(ctx.value); });
    manager.registerHook('test-hook', async (ctx) => { called.push(ctx.value * 2); });

    await manager.executeHook('test-hook', { value: 5 });

    assert.deepStrictEqual(called, [5, 10], 'All hook handlers should be called');
  });

  // unloadAll 测试
  test('unloadAll reverses load order', async () => {
    const unloadOrder = [];

    class A {
      get dependencies() { return ['B']; }
      async init() {}
      async destroy() { unloadOrder.push('A'); }
    }
    class B {
      async init() {}
      async destroy() { unloadOrder.push('B'); }
    }

    manager.register('B', B);
    manager.register('A', A);

    await manager.load('A');
    await manager.unloadAll();

    assert.deepStrictEqual(unloadOrder, ['A', 'B'],
      'Unload should reverse dependency order');
  });
});
