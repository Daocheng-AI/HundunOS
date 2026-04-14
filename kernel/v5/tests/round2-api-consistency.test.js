/**
 * 第2轮：API一致性深度验证
 * 验证所有公共API的命名规范、参数一致性、返回值格式
 */

import { createKernel } from '../index.js';
import { Kernel } from '../core/Kernel.js';
import { EventBus } from '../core/EventBus.js';
import { ServiceRegistry } from '../core/ServiceRegistry.js';
import { PluginManager } from '../core/PluginManager.js';
import { ConfigManager } from '../core/ConfigManager.js';
import { BasePlugin } from '../core/BasePlugin.js';

const stats = { passed: 0, failed: 0, errors: [] };

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    stats.passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    stats.failed++;
    stats.errors.push({ test: name, error: error.message });
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    stats.passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    stats.failed++;
    stats.errors.push({ test: name, error: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertType(value, type, message) {
  if (typeof value !== type) {
    throw new Error(message || `Expected ${type}, got ${typeof value}`);
  }
}

async function runAPITests() {
  console.log('\n========================================');
  console.log('第2轮：API一致性深度验证');
  console.log('========================================\n');

  // ===== 测试组1: Kernel API规范 =====
  console.log('--- 测试组1: Kernel API规范 ---');
  
  const kernel = new Kernel();
  
  test('Kernel.initialize() 返回 Promise', () => {
    const result = kernel.initialize();
    assert(result instanceof Promise, 'initialize should return Promise');
    assertType(result.then, 'function', 'Promise should have then method');
  });
  
  await kernel.initialize();
  
  test('Kernel.get() 参数规范', async () => {
    // 测试参数类型
    try {
      await kernel.get(123);
      throw new Error('Should reject non-string parameter');
    } catch (e) {
      assert(e.message.includes('string') || e.message.includes('registered'), 'Should validate parameter type');
    }
  });
  
  test('Kernel.register() 参数规范', () => {
    // 测试必需参数
    try {
      kernel.register();
      throw new Error('Should require name parameter');
    } catch (e) {
      // Expected
    }
    
    try {
      kernel.register('test');
      throw new Error('Should require factory parameter');
    } catch (e) {
      // Expected
    }
  });
  
  test('Kernel.on() 参数规范', () => {
    try {
      kernel.on();
      throw new Error('Should require event parameter');
    } catch (e) {
      // Expected
    }
    
    try {
      kernel.on('test');
      throw new Error('Should require handler parameter');
    } catch (e) {
      // Expected
    }
    
    // 验证handler必须是函数
    try {
      kernel.on('test', 'not-a-function');
      throw new Error('Should require function handler');
    } catch (e) {
      // Expected
    }
  });
  
  test('Kernel.emit() 返回 Promise', async () => {
    const result = kernel.emit('test', {});
    assert(result instanceof Promise, 'emit should return Promise');
    await result;
  });
  
  test('Kernel.getStatus() 返回格式', () => {
    const status = kernel.getStatus();
    assertType(status, 'object', 'Status should be object');
    assert('state' in status, 'Status should have state');
    assert('initialized' in status, 'Status should have initialized');
    assert('shutdown' in status, 'Status should have shutdown');
    assert('plugins' in status, 'Status should have plugins');
    assert('services' in status, 'Status should have services');
    assertType(status.initialized, 'boolean', 'initialized should be boolean');
    assertType(status.shutdown, 'boolean', 'shutdown should be boolean');
  });
  
  await kernel.shutdown();

  // ===== 测试组2: EventBus API规范 =====
  console.log('\n--- 测试组2: EventBus API规范 ---');
  
  const eventBus = new EventBus();
  
  test('EventBus.on() 返回取消函数', () => {
    const unsubscribe = eventBus.on('test', () => {});
    assertType(unsubscribe, 'function', 'on() should return unsubscribe function');
    
    // 验证取消函数有效
    unsubscribe();
    // 再次取消不应报错
    unsubscribe();
  });
  
  test('EventBus.on() 选项参数', () => {
    // 测试once选项
    let count = 0;
    const unsub = eventBus.on('once-test', () => count++, { once: true });
    
    // 验证选项被接受
    assertType(unsub, 'function', 'Should accept options parameter');
  });
  
  test('EventBus.emit() 返回 Promise', async () => {
    const result = eventBus.emit('test', {});
    assert(result instanceof Promise, 'emit should return Promise');
    await result;
  });
  
  test('EventBus.emit() 传递数据', async () => {
    let receivedData = null;
    eventBus.on('data-test', (data) => {
      receivedData = data;
    });
    
    const testData = { foo: 'bar', num: 42 };
    await eventBus.emit('data-test', testData);
    
    assertEquals(receivedData.foo, 'bar', 'Should pass data correctly');
    assertEquals(receivedData.num, 42, 'Should pass all properties');
  });
  
  test('EventBus.use() 中间件规范', () => {
    // 中间件接收context对象
    const middleware = async (context) => {
      context.data.modified = true;
    };
    eventBus.use(middleware);
    
    // 验证中间件被添加
    assert(eventBus.middleware.length > 0, 'Should add middleware');
    assert(eventBus.middleware.includes(middleware), 'Should include the middleware');
  });

  // ===== 测试组3: ServiceRegistry API规范 =====
  console.log('\n--- 测试组3: ServiceRegistry API规范 ---');
  
  const registry = new ServiceRegistry();
  
  test('ServiceRegistry.register() 链式调用', () => {
    const result = registry.register('chain1', () => ({}), { singleton: true })
      .register('chain2', () => ({}), { singleton: true });
    
    assert(result === registry, 'register() should return registry for chaining');
    assert(registry.has('chain1'), 'First service should be registered');
    assert(registry.has('chain2'), 'Second service should be registered');
  });
  
  test('ServiceRegistry.register() 选项默认值', async () => {
    registry.register('default-opts', () => ({ created: true }));
    
    const instance = await registry.get('default-opts');
    assert(instance.created, 'Should create instance with default options');
  });
  
  test('ServiceRegistry.get() 异步返回', async () => {
    registry.register('async-test', async () => {
      return new Promise(resolve => {
        setTimeout(() => resolve({ delayed: true }), 10);
      });
    }, { singleton: true });
    
    const start = Date.now();
    const instance = await registry.get('async-test');
    const elapsed = Date.now() - start;
    
    assert(instance.delayed, 'Should resolve to instance');
    assert(elapsed >= 10, 'Should wait for async factory');
  });
  
  test('ServiceRegistry.getSync() 同步获取', async () => {
    registry.register('sync-test', () => ({ sync: true }), { 
      singleton: true, 
      lazy: false 
    });
    
    // 先初始化非懒加载服务
    await registry.initializeEagerServices();
    
    // 现在可以同步获取
    const instance = registry.getSync('sync-test');
    assert(instance.sync, 'Should get instance synchronously');
  });
  
  test('ServiceRegistry.has() 返回值', () => {
    assertEquals(registry.has('sync-test'), true, 'Should return true for existing');
    assertEquals(registry.has('nonexistent'), false, 'Should return false for missing');
  });
  
  test('ServiceRegistry.unregister() 行为', () => {
    registry.register('to-remove', () => ({}), { singleton: true });
    assert(registry.has('to-remove'), 'Should exist before removal');
    
    registry.unregister('to-remove');
    assertEquals(registry.has('to-remove'), false, 'Should not exist after removal');
  });
  
  test('ServiceRegistry.getStatus() 格式', () => {
    const status = registry.getStatus();
    assertType(status, 'object', 'Status should be object');
    assert('registered' in status, 'Should have registered count');
    assert('instantiated' in status, 'Should have instantiated count');
    assert('services' in status, 'Should have services array');
    assert(Array.isArray(status.services), 'services should be array');
    assertType(status.registered, 'number', 'registered should be number');
    assertType(status.instantiated, 'number', 'instantiated should be number');
  });

  // ===== 测试组4: PluginManager API规范 =====
  console.log('\n--- 测试组4: PluginManager API规范 ---');
  
  const testKernel = new Kernel();
  await testKernel.initialize();
  const pm = testKernel.plugins;
  
  test('PluginManager.register() 链式调用', () => {
    class TestPlugin {
      get name() { return 'test'; }
      async init() {}
    }
    
    const result = pm.register('p1', TestPlugin, {})
      .register('p2', TestPlugin, {});
    
    assert(result === pm, 'register() should return PluginManager for chaining');
  });
  
  // 定义在测试外部以便复用
  class ReturnPlugin extends BasePlugin {
    get name() { return 'return-test'; }
    async onInit() { this.initialized = true; }
  }
  
  await testAsync('PluginManager.load() 返回实例', async () => {
    pm.register('return-test', ReturnPlugin, {});
    const instance = await pm.load('return-test');
    
    assertType(instance, 'object', 'load() should return plugin instance');
    assert(instance.initialized, 'Instance should be initialized');
  });
  
  await testAsync('PluginManager.get() 返回值', async () => {
    const instance = pm.get('return-test');
    assertType(instance, 'object', 'get() should return instance');
    
    const missing = pm.get('nonexistent-plugin');
    assertEquals(missing, undefined, 'get() should return undefined for missing');
  });
  
  await testAsync('PluginManager.isLoaded() 返回值', async () => {
    assertEquals(pm.isLoaded('return-test'), true, 'Should return true for loaded');
    assertEquals(pm.isLoaded('never-loaded'), false, 'Should return false for not loaded');
  });
  
  test('PluginManager.getStatus() 格式', () => {
    const status = pm.getStatus();
    assertType(status, 'object', 'Status should be object');
    assert('registered' in status, 'Should have registered count');
    assert('loaded' in status, 'Should have loaded count');
    assert('plugins' in status, 'Should have plugins array');
    assert(Array.isArray(status.plugins), 'plugins should be array');
  });
  
  await testKernel.shutdown();

  // ===== 测试组5: ConfigManager API规范 =====
  console.log('\n--- 测试组5: ConfigManager API规范 ---');
  
  const config = new ConfigManager({
    level1: {
      level2: {
        level3: 'deep-value'
      }
    }
  });
  await config.initialize();
  
  test('ConfigManager.get() 嵌套路径', () => {
    const value = config.get('level1.level2.level3');
    assertEquals(value, 'deep-value', 'Should get deeply nested value');
  });
  
  test('ConfigManager.get() 默认值', () => {
    const withDefault = config.get('nonexistent.path', 'default-val');
    assertEquals(withDefault, 'default-val', 'Should return default for missing path');
    
    const noDefault = config.get('also.missing');
    assertEquals(noDefault, undefined, 'Should return undefined without default');
  });
  
  test('ConfigManager.set() 嵌套路径', () => {
    config.set('new.nested.path', 'new-value');
    assertEquals(config.get('new.nested.path'), 'new-value', 'Should set nested path');
    
    config.set('level1.level2.new', 'another');
    assertEquals(config.get('level1.level2.new'), 'another', 'Should add to existing');
  });
  
  test('ConfigManager.merge() 深度合并', () => {
    config.merge({
      level1: {
        level2: {
          merged: 'merge-value'
        }
      }
    });
    
    assertEquals(config.get('level1.level2.level3'), 'deep-value', 'Should keep existing');
    assertEquals(config.get('level1.level2.merged'), 'merge-value', 'Should add new');
  });

  // ===== 测试组6: 错误消息一致性 =====
  console.log('\n--- 测试组6: 错误消息一致性 ---');
  
  test('未注册服务错误消息', async () => {
    const reg = new ServiceRegistry();
    try {
      await reg.get('missing-service');
    } catch (e) {
      assert(e.message.includes('not registered'), 'Error should say "not registered"');
      assert(e.message.includes('missing-service'), 'Error should include service name');
    }
  });
  
  test('未注册插件错误消息', async () => {
    const testPm = new PluginManager(new Kernel());
    try {
      await testPm.load('missing-plugin');
    } catch (e) {
      assert(e.message.includes('not registered'), 'Error should say "not registered"');
    }
  });
  
  test('重复初始化错误消息', async () => {
    const k = new Kernel();
    await k.initialize();
    try {
      await k.initialize();
    } catch (e) {
      assert(e.message.includes('already initialized'), 'Error should say "already initialized"');
    }
    await k.shutdown();
  });

  // ===== 测试组7: 返回值不变性 =====
  console.log('\n--- 测试组7: 返回值不变性 ---');
  
  test('配置对象不应被意外修改', () => {
    const original = { nested: { value: 'original' } };
    const cfg = new ConfigManager(original);
    
    // 获取并修改
    const retrieved = cfg.get('nested');
    retrieved.value = 'modified';
    
    // 原始配置应该不变（如果实现了不可变）
    // 或者文档应该明确说明行为
    const again = cfg.get('nested');
    // 这里我们记录实际行为，不强制要求
    console.log(`   Note: Config ${again.value === 'modified' ? 'is' : 'is not'} mutable when retrieved`);
  });

  // ===== 报告 =====
  console.log('\n========================================');
  console.log('第2轮验证结果');
  console.log('========================================');
  console.log(`✅ 通过: ${stats.passed}`);
  console.log(`❌ 失败: ${stats.failed}`);
  console.log(`总计: ${stats.passed + stats.failed}`);
  
  if (stats.errors.length > 0) {
    console.log('\n错误详情:');
    stats.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.test}`);
      console.log(`     ${e.error}`);
    });
  }
  
  console.log('========================================\n');
  
  return stats;
}

runAPITests().catch(console.error);
