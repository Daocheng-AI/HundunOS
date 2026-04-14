/**
 * 第1轮：架构完整性深度验证
 * 验证微内核、插件管理器、服务注册表、事件总线的完整性和正确性
 */

import { Kernel } from '../core/Kernel.js';
import { EventBus } from '../core/EventBus.js';
import { ServiceRegistry } from '../core/ServiceRegistry.js';
import { PluginManager } from '../core/PluginManager.js';
import { ConfigManager } from '../core/ConfigManager.js';
import { BasePlugin } from '../core/BasePlugin.js';

// 测试统计
const stats = {
  passed: 0,
  failed: 0,
  errors: []
};

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runArchitectureTests() {
  console.log('\n========================================');
  console.log('第1轮：架构完整性深度验证');
  console.log('========================================\n');

  // ===== 测试1: Kernel 基础功能 =====
  console.log('--- 测试组1: Kernel 基础功能 ---');
  
  const kernel = new Kernel({ test: true });
  
  test('Kernel 实例创建成功', () => {
    assert(kernel instanceof Kernel, 'Kernel should be instance of Kernel');
    assert(kernel.config instanceof ConfigManager, 'Should have ConfigManager');
    assert(kernel.events instanceof EventBus, 'Should have EventBus');
    assert(kernel.services instanceof ServiceRegistry, 'Should have ServiceRegistry');
    assert(kernel.plugins instanceof PluginManager, 'Should have PluginManager');
  });

  test('Kernel 核心服务已注册', () => {
    assert(kernel.services.has('config'), 'Should have config service');
    assert(kernel.services.has('events'), 'Should have events service');
    assert(kernel.services.has('logger'), 'Should have logger service');
  });

  test('Kernel 初始状态正确', () => {
    const status = kernel.getStatus();
    assertEquals(status.initialized, false, 'Should not be initialized');
    assertEquals(status.shutdown, false, 'Should not be shutdown');
    assertEquals(status.state, 'created', 'State should be created');
  });

  // ===== 测试2: 初始化流程 =====
  console.log('\n--- 测试组2: 初始化流程 ---');
  
  let initEventFired = false;
  kernel.on('kernel:initialized', () => {
    initEventFired = true;
  });

  await kernel.initialize();

  test('Kernel 初始化成功', () => {
    assertEquals(kernel.getStatus().initialized, true, 'Should be initialized');
    assertEquals(kernel.getStatus().state, 'initialized', 'State should be initialized');
  });

  test('初始化事件已触发', () => {
    assertEquals(initEventFired, true, 'Init event should have fired');
  });

  test('重复初始化应抛出错误', async () => {
    try {
      await kernel.initialize();
      throw new Error('Should have thrown');
    } catch (e) {
      assert(e.message.includes('already initialized'), 'Should throw already initialized error');
    }
  });

  // ===== 测试3: 服务注册表 =====
  console.log('\n--- 测试组3: ServiceRegistry 功能 ---');
  
  const registry = new ServiceRegistry();
  
  test('服务注册成功', () => {
    registry.register('test.service', () => ({ value: 42 }), { singleton: true });
    assert(registry.has('test.service'), 'Service should be registered');
  });

  test('单例服务正确缓存', async () => {
    let callCount = 0;
    registry.register('singleton.test', () => {
      callCount++;
      return { id: callCount };
    }, { singleton: true });
    
    const instance1 = await registry.get('singleton.test');
    const instance2 = await registry.get('singleton.test');
    
    assertEquals(callCount, 1, 'Factory should only be called once');
    assertEquals(instance1.id, instance2.id, 'Should return same instance');
  });

  test('非单例服务每次创建新实例', async () => {
    let callCount = 0;
    registry.register('transient.test', () => {
      callCount++;
      return { id: callCount };
    }, { singleton: false });
    
    const instance1 = await registry.get('transient.test');
    const instance2 = await registry.get('transient.test');
    
    assertEquals(callCount, 2, 'Factory should be called twice');
    assert(instance1.id !== instance2.id, 'Should return different instances');
  });

  test('循环依赖检测', async () => {
    const testRegistry = new ServiceRegistry();
    
    // 注册相互依赖的服务
    testRegistry.register('circular.a', async () => {
      return { dep: await testRegistry.get('circular.b') };
    }, { singleton: true });
    
    testRegistry.register('circular.b', async () => {
      return { dep: await testRegistry.get('circular.a') };
    }, { singleton: true });
    
    try {
      await testRegistry.get('circular.a');
      throw new Error('Should have detected circular dependency');
    } catch (e) {
      assert(e.message.includes('Circular dependency'), `Should throw circular dependency error, got: ${e.message}`);
    }
  });

  test('未注册服务访问应报错', async () => {
    try {
      await registry.get('nonexistent');
      throw new Error('Should have thrown');
    } catch (e) {
      assert(e.message.includes('not registered'), 'Should throw not registered error');
    }
  });

  // ===== 测试4: 事件总线 =====
  console.log('\n--- 测试组4: EventBus 功能 ---');
  
  const eventBus = new EventBus();
  
  test('事件监听和触发', async () => {
    let received = null;
    eventBus.on('test:event', (data) => {
      received = data;
    });
    
    await eventBus.emit('test:event', { value: 123 });
    assertEquals(received.value, 123, 'Should receive event data');
  });

  test('多个监听器', async () => {
    let count = 0;
    eventBus.on('multi:test', () => count++);
    eventBus.on('multi:test', () => count++);
    eventBus.on('multi:test', () => count++);
    
    await eventBus.emit('multi:test', {});
    assertEquals(count, 3, 'All listeners should be called');
  });

  test('一次性监听器', async () => {
    let count = 0;
    eventBus.on('once:test', () => count++, { once: true });
    
    await eventBus.emit('once:test', {});
    await eventBus.emit('once:test', {});
    assertEquals(count, 1, 'Should only be called once');
  });

  test('事件中间件', async () => {
    let middlewareCalled = false;
    eventBus.use(async (context) => {
      middlewareCalled = true;
      context.data.modified = true;
    });
    
    let received = null;
    eventBus.on('middleware:test', (data) => {
      received = data;
    });
    
    await eventBus.emit('middleware:test', { value: 1 });
    assertEquals(middlewareCalled, true, 'Middleware should be called');
    assertEquals(received.modified, true, 'Data should be modified by middleware');
  });

  // ===== 测试5: 插件管理器 =====
  console.log('\n--- 测试组5: PluginManager 功能 ---');
  
  const testKernel = new Kernel();
  await testKernel.initialize();
  const pm = testKernel.plugins;

  test('插件注册', () => {
    class TestPlugin extends BasePlugin {
      get name() { return 'test-plugin'; }
      async onInit() {}
    }
    
    pm.register('test-plugin', TestPlugin, {});
    assertEquals(pm.plugins.has('test-plugin'), true, 'Plugin should be registered');
  });

  test('插件加载和初始化', async () => {
    let initCalled = false;
    
    class InitTestPlugin extends BasePlugin {
      get name() { return 'init-test'; }
      async onInit() {
        initCalled = true;
      }
    }
    
    pm.register('init-test', InitTestPlugin, {});
    await pm.load('init-test');
    
    assertEquals(initCalled, true, 'onInit should be called');
    assertEquals(pm.isLoaded('init-test'), true, 'Plugin should be loaded');
  });

  test('插件依赖解析', async () => {
    const loadOrder = [];
    
    class DepPluginA extends BasePlugin {
      get name() { return 'dep-a'; }
      async onInit() { loadOrder.push('a'); }
    }
    
    class DepPluginB extends BasePlugin {
      get name() { return 'dep-b'; }
      get dependencies() { return ['dep-a']; }
      async onInit() { loadOrder.push('b'); }
    }
    
    pm.register('dep-a', DepPluginA, {});
    pm.register('dep-b', DepPluginB, { dependencies: ['dep-a'] });
    
    await pm.load('dep-b');
    
    assertEquals(loadOrder[0], 'a', 'Dependency should load first');
    assertEquals(loadOrder[1], 'b', 'Dependent should load second');
  });

  test('插件卸载依赖检查', async () => {
    // 创建新的kernel和插件管理器进行此测试
    const testKernel2 = new Kernel();
    await testKernel2.initialize();
    const pm2 = testKernel2.plugins;
    
    class DepPluginX extends BasePlugin {
      get name() { return 'dep-x'; }
      async onInit() {}
    }
    
    class DepPluginY extends BasePlugin {
      get name() { return 'dep-y'; }
      get dependencies() { return ['dep-x']; }
      async onInit() {}
    }
    
    pm2.register('dep-x', DepPluginX, {});
    pm2.register('dep-y', DepPluginY, { dependencies: ['dep-x'] });
    
    await pm2.load('dep-y'); // 这会先加载dep-x
    
    try {
      await pm2.unload('dep-x'); // dep-y depends on dep-x
      throw new Error('Should have thrown');
    } catch (e) {
      assert(e.message.includes('still depended'), 'Should throw dependency error');
    }
    
    await testKernel2.shutdown();
  });

  test('插件生命周期 - destroy', async () => {
    let destroyCalled = false;
    
    class DestroyTestPlugin extends BasePlugin {
      get name() { return 'destroy-test'; }
      async onInit() {}
      async destroy() {
        destroyCalled = true;
      }
    }
    
    pm.register('destroy-test', DestroyTestPlugin, {});
    await pm.load('destroy-test');
    await pm.unload('destroy-test');
    
    assertEquals(destroyCalled, true, 'destroy should be called');
    assertEquals(pm.isLoaded('destroy-test'), false, 'Plugin should be unloaded');
  });

  // ===== 测试6: 配置管理器 =====
  console.log('\n--- 测试组6: ConfigManager 功能 ---');
  
  const config = new ConfigManager({
    app: { name: 'test', port: 3000 },
    db: { host: 'localhost', port: 5432 }
  });
  await config.initialize();

  test('配置获取', () => {
    assertEquals(config.get('app.name'), 'test', 'Should get nested value');
    assertEquals(config.get('app.port'), 3000, 'Should get number value');
    assertEquals(config.get('db.host'), 'localhost', 'Should get string value');
  });

  test('配置默认值', () => {
    assertEquals(config.get('nonexistent', 'default'), 'default', 'Should return default');
    assertEquals(config.get('app.nonexistent', 42), 42, 'Should return default for nested');
  });

  test('配置设置', () => {
    config.set('new.key', 'value');
    assertEquals(config.get('new.key'), 'value', 'Should set new value');
    
    config.set('app.name', 'updated');
    assertEquals(config.get('app.name'), 'updated', 'Should update existing');
  });

  test('配置合并', () => {
    config.merge({ app: { version: '1.0' }, extra: true });
    assertEquals(config.get('app.name'), 'updated', 'Should keep existing');
    assertEquals(config.get('app.version'), '1.0', 'Should add new');
    assertEquals(config.get('extra'), true, 'Should merge top level');
  });

  // ===== 测试7: 关闭流程 =====
  console.log('\n--- 测试组7: 关闭流程 ---');
  
  let shutdownBeforeFired = false;
  let shutdownAfterFired = false;
  
  kernel.on('kernel:shutdown:before', () => {
    shutdownBeforeFired = true;
  });
  
  kernel.on('kernel:shutdown:after', () => {
    shutdownAfterFired = true;
  });

  await kernel.shutdown();

  test('Kernel 关闭成功', () => {
    assertEquals(kernel.getStatus().shutdown, true, 'Should be shutdown');
    assertEquals(kernel.getStatus().state, 'shutdown', 'State should be shutdown');
  });

  test('关闭事件已触发', () => {
    assertEquals(shutdownBeforeFired, true, 'Shutdown before event should fire');
    assertEquals(shutdownAfterFired, true, 'Shutdown after event should fire');
  });

  test('重复关闭应安全', async () => {
    await kernel.shutdown(); // Should not throw
    assertEquals(kernel.getStatus().shutdown, true, 'Should still be shutdown');
  });

  // ===== 测试8: 边界条件 =====
  console.log('\n--- 测试组8: 边界条件测试 ---');
  
  test('空配置初始化', async () => {
    const emptyKernel = new Kernel();
    await emptyKernel.initialize();
    assertEquals(emptyKernel.getStatus().initialized, true, 'Should initialize with empty config');
    await emptyKernel.shutdown();
  });

  test('大量服务注册', async () => {
    const registry = new ServiceRegistry();
    for (let i = 0; i < 100; i++) {
      registry.register(`service.${i}`, () => ({ id: i }), { singleton: true });
    }
    assertEquals(registry.getStatus().registered, 100, 'Should register 100 services');
  });

  test('大量事件监听', async () => {
    const eb = new EventBus();
    let count = 0;
    for (let i = 0; i < 100; i++) {
      eb.on('load:test', () => count++);
    }
    await eb.emit('load:test', {});
    assertEquals(count, 100, 'All 100 listeners should be called');
  });

  // ===== 报告 =====
  console.log('\n========================================');
  console.log('第1轮验证结果');
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

// 运行测试
runArchitectureTests().catch(console.error);
