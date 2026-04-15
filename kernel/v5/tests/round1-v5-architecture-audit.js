/**
 * 第1轮：架构完整性深度审计（v5微内核架构）
 * 主导角色：系统架构师 + 经济学家
 * 审核内容：
 *   1. 微内核架构验证
 *   2. 模块依赖关系检查
 *   3. 接口一致性验证
 *   4. 生命周期管理验证
 *   5. 插件系统完整性
 */

import { Kernel } from '../core/Kernel.js';
import { EventBus } from '../core/EventBus.js';
import { ServiceRegistry } from '../core/ServiceRegistry.js';
import { PluginManager } from '../core/PluginManager.js';
import { ConfigManager } from '../core/ConfigManager.js';
import { BasePlugin } from '../core/BasePlugin.js';
import { performance } from 'perf_hooks';

const stats = {
  passed: 0,
  failed: 0,
  errors: [],
  findings: [],
  startTime: Date.now()
};

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    stats.passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    stats.failed++;
    stats.errors.push({ test: name, error: error.message });
    stats.findings.push({
      severity: 'P2',
      category: 'Architecture',
      test: name,
      issue: error.message
    });
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    stats.passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    stats.failed++;
    stats.errors.push({ test: name, error: error.message });
    stats.findings.push({
      severity: 'P2',
      category: 'Architecture',
      test: name,
      issue: error.message
    });
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

// ==================== 第1轮：架构完整性审计 ====================
async function runRound1() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第1轮：架构完整性深度审计                              ║');
  console.log('║     角色：系统架构师 + 经济学家                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // ===== 测试组1: 微内核核心组件验证 =====
  console.log('--- 测试组1: 微内核核心组件验证 ---');
  
  const kernelStart = performance.now();
  const kernel = new Kernel({ 
    environment: 'test',
    debug: true 
  });
  const kernelCreateTime = performance.now() - kernelStart;
  
  test('Kernel实例创建时间 <50ms', () => {
    assert(kernelCreateTime < 50, `Kernel创建耗时${kernelCreateTime.toFixed(2)}ms，应<50ms`);
  });

  test('Kernel核心组件已初始化', () => {
    assert(kernel.config instanceof ConfigManager, '应有ConfigManager');
    assert(kernel.events instanceof EventBus, '应有EventBus');
    assert(kernel.services instanceof ServiceRegistry, '应有ServiceRegistry');
    assert(kernel.plugins instanceof PluginManager, '应有PluginManager');
  });

  test('Kernel初始状态正确', () => {
    const status = kernel.getStatus();
    assertEquals(status.initialized, false, '未初始化时应为false');
    assertEquals(status.shutdown, false, '未关闭时应为false');
    assertEquals(status.state, 'created', '状态应为created');
  });

  test('Kernel配置正确传递', () => {
    assertEquals(kernel.config.get('environment'), 'test', '环境变量应正确设置');
  });

  // ===== 测试组2: 初始化流程验证 =====
  console.log('\n--- 测试组2: 初始化流程验证 ---');
  
  let initEvents = [];
  kernel.on('kernel:*', (event) => {
    initEvents.push(event.type);
  });

  const initStart = performance.now();
  await kernel.initialize();
  const initTime = performance.now() - initStart;

  test('Kernel初始化时间 <200ms', () => {
    assert(initTime < 200, `初始化耗时${initTime.toFixed(2)}ms，应<200ms`);
  });

  test('Kernel初始化状态更新', () => {
    const status = kernel.getStatus();
    assertEquals(status.initialized, true, '初始化后应为true');
    assertEquals(status.state, 'initialized', '状态应为initialized');
  });

  test('初始化事件序列正确', () => {
    assert(initEvents.includes('kernel:initialized'), '应触发kernel:initialized事件');
  });

  test('重复初始化抛出错误', async () => {
    try {
      await kernel.initialize();
      throw new Error('应该抛出已初始化错误');
    } catch (e) {
      assert(e.message.includes('already initialized') || e.message.includes('Already'), 
            `错误消息应包含'already initialized': ${e.message}`);
    }
  });

  // ===== 测试组3: ServiceRegistry服务注册表验证 =====
  console.log('\n--- 测试组3: ServiceRegistry服务注册表验证 ---');
  
  test('核心服务已注册', () => {
    assert(kernel.services.has('config'), 'config服务应注册');
    assert(kernel.services.has('events'), 'events服务应注册');
    assert(kernel.services.has('logger'), 'logger服务应注册');
  });

  await testAsync('单例服务缓存机制', async () => {
    let factoryCallCount = 0;
    
    kernel.services.register('singleton.test', () => {
      factoryCallCount++;
      return { id: factoryCallCount, created: Date.now() };
    }, { singleton: true });
    
    const instance1 = await kernel.services.get('singleton.test');
    const instance2 = await kernel.services.get('singleton.test');
    
    assertEquals(factoryCallCount, 1, '工厂函数只应调用一次');
    assertEquals(instance1.id, instance2.id, '应返回相同实例');
  });

  await testAsync('非单例服务每次创建新实例', async () => {
    let callCount = 0;
    
    kernel.services.register('transient.test', () => {
      callCount++;
      return { id: callCount };
    }, { singleton: false });
    
    const inst1 = await kernel.services.get('transient.test');
    const inst2 = await kernel.services.get('transient.test');
    
    assertEquals(callCount, 2, '工厂函数应调用两次');
    assert(inst1.id !== inst2.id, '应返回不同实例');
  });

  await testAsync('循环依赖检测', async () => {
    const reg = new ServiceRegistry();
    
    reg.register('circ.a', async () => ({
      b: await reg.get('circ.b')
    }), { singleton: true });
    
    reg.register('circ.b', async () => ({
      a: await reg.get('circ.a')
    }), { singleton: true });
    
    try {
      await reg.get('circ.a');
      throw new Error('应该检测到循环依赖');
    } catch (e) {
      assert(e.message.includes('Circular'), `应包含Circular: ${e.message}`);
    }
  });

  await testAsync('未注册服务访问报错', async () => {
    try {
      await kernel.services.get('nonexistent.service.12345');
      throw new Error('应该抛出未注册错误');
    } catch (e) {
      assert(e.message.includes('not registered'), `应包含not registered: ${e.message}`);
    }
  });

  // ===== 测试组4: EventBus事件总线验证 =====
  console.log('\n--- 测试组4: EventBus事件总线验证 ---');
  
  test('事件监听和触发', async () => {
    return new Promise(async (resolve) => {
      let received = null;
      kernel.events.on('audit:test.event', (data) => {
        received = data;
      });
      
      await kernel.events.emit('audit:test.event', { value: 42, text: 'hello' });
      
      assert(received !== null, '应收到事件数据');
      assertEquals(received.value, 42, '值应正确');
      assertEquals(received.text, 'hello', '文本应正确');
      resolve();
    });
  });

  test('多监听器并行调用', async () => {
    return new Promise(async (resolve) => {
      let count = 0;
      
      for (let i = 0; i < 5; i++) {
        kernel.events.on('multi.listener.test', () => count++);
      }
      
      await kernel.events.emit('multi.listener.test', {});
      assertEquals(count, 5, '所有监听器都应被调用');
      resolve();
    });
  });

  test('一次性监听器', async () => {
    return new Promise(async (resolve) => {
      let onceCount = 0;
      
      kernel.events.on('once.listener.test', () => onceCount++, { once: true });
      
      await kernel.events.emit('once.listener.test', {});
      await kernel.events.emit('once.listener.test', {});
      
      assertEquals(onceCount, 1, '一次性监听器只应触发一次');
      resolve();
    });
  });

  test('事件中间件', async () => {
    return new Promise(async (resolve) => {
      let middlewareCalled = false;
      
      kernel.events.use(async (context) => {
        middlewareCalled = true;
        context.data.modifiedByMiddleware = true;
      });
      
      let receivedData = null;
      kernel.events.on('middleware.audit.test', (data) => {
        receivedData = data;
      });
      
      await kernel.events.emit('middleware.audit.test', { original: true });
      
      assert(middlewareCalled, '中间件应被调用');
      assert(receivedData.modifiedByMiddleware === true, '数据应被中间件修改');
      resolve();
    });
  });

  test('参数类型验证', () => {
    try {
      kernel.events.on(123, () => {});
      throw new Error('应该拒绝非字符串事件名');
    } catch (e) {
      assert(e.message.includes('string'), `应提示需要string: ${e.message}`);
    }
    
    try {
      kernel.events.on('test.event', 'not a function');
      throw new Error('应该拒绝非函数处理器');
    } catch (e) {
      assert(e.message.includes('function'), `应提示需要function: ${e.message}`);
    }
  });

  // ===== 测试组5: PluginManager插件管理器验证 =====
  console.log('\n--- 测试组5: PluginManager插件管理器验证 ---');
  
  class AuditTestPlugin extends BasePlugin {
    get name() { return 'audit-test-plugin'; }
    get version() { return '1.0.0'; }
    get dependencies() { return []; }
    
    async onInit() {
      this.initialized = true;
      this.initTime = Date.now();
    }
    
    async destroy() {
      this.destroyed = true;
      this.destroyTime = Date.now();
    }
  }

  await testAsync('插件注册和加载', async () => {
    kernel.plugins.register('audit-test-plugin', AuditTestPlugin, {});
    
    assert(kernel.plugins.isRegistered('audit-test-plugin'), '插件应已注册');
    
    const instance = await kernel.plugins.load('audit-test-plugin');
    
    assert(instance instanceof AuditTestPlugin, '应返回插件实例');
    assert(instance.initialized === true, '插件应已完成初始化');
    assert(kernel.plugins.isLoaded('audit-test-plugin'), '插件应标记为已加载');
  });

  await testAsync('插件依赖解析', async () => {
    const loadOrder = [];
    
    class DepPluginA extends BasePlugin {
      get name() { return 'dep-audit-a'; }
      get dependencies() { return []; }
      async onInit() { loadOrder.push('a'); }
    }
    
    class DepPluginB extends BasePlugin {
      get name() { return 'dep-audit-b'; }
      get dependencies() { return ['dep-audit-a']; }
      async onInit() { loadOrder.push('b'); }
    }
    
    class DepPluginC extends BasePlugin {
      get name() { return 'dep-audit-c'; }
      get dependencies() { return ['dep-audit-b']; }
      async onInit() { loadOrder.push('c'); }
    }
    
    kernel.plugins.register('dep-audit-a', DepPluginA, {});
    kernel.plugins.register('dep-audit-b', DepPluginB, { dependencies: ['dep-audit-a'] });
    kernel.plugins.register('dep-audit-c', DepPluginC, { dependencies: ['dep-audit-b'] });
    
    await kernel.plugins.load('dep-audit-c');
    
    assertEquals(loadOrder[0], 'a', '依赖A应先加载');
    assertEquals(loadOrder[1], 'b', '依赖B应第二加载');
    assertEquals(loadOrder[2], 'c', '依赖C应最后加载');
  });

  await testAsync('插件卸载依赖检查', async () => {
    class UnloadDepA extends BasePlugin {
      get name() { return 'unload-dep-a'; }
      get dependencies() { return []; }
      async onInit() {}
    }
    
    class UnloadDepB extends BasePlugin {
      get name() { return 'unload-dep-b'; }
      get dependencies() { return ['unload-dep-a']; }
      async onInit() {}
    }
    
    kernel.plugins.register('unload-dep-a', UnloadDepA, {});
    kernel.plugins.register('unload-dep-b', UnloadDepB, { dependencies: ['unload-dep-a'] });
    
    await kernel.plugins.load('unload-dep-b'); // 这会先加载unload-dep-a
    
    try {
      await kernel.plugins.unload('unload-dep-a'); // unload-dep-b依赖它
      throw new Error('应该阻止卸载有依赖的插件');
    } catch (e) {
      assert(e.message.includes('still depended') || e.message.includes('dependency'), 
            `应提示仍有依赖: ${e.message}`);
    }
  });

  await testAsync('插件生命周期destroy', async () => {
    class LifecyclePlugin extends BasePlugin {
      get name() { return 'lifecycle-test'; }
      async onInit() { this.wasInitialized = true; }
      async destroy() { this.wasDestroyed = true; }
    }
    
    kernel.plugins.register('lifecycle-test', LifecyclePlugin, {});
    const plugin = await kernel.plugins.load('lifecycle-test');
    
    assert(plugin.wasInitialized === true, 'onInit应被调用');
    
    await kernel.plugins.unload('lifecycle-test');
    
    assert(plugin.wasDestroyed === true, 'destroy应被调用');
    assert(!kernel.plugins.isLoaded('lifecycle-test'), '插件应标记为未加载');
  });

  // ===== 测试组6: ConfigManager配置管理器验证 =====
  console.log('\n--- 测试组6: ConfigManager配置管理器验证 ---');
  
  test('配置获取和设置', () => {
    kernel.config.set('audit.test.key', 'value123');
    assertEquals(kernel.config.get('audit.test.key'), 'value123', '应能获取设置的值');
  });

  test('嵌套配置路径', () => {
    kernel.config.set('level1.level2.level3.deep', 'deepValue');
    assertEquals(kernel.config.get('level1.level2.level3.deep'), 'deepValue', '应支持深层嵌套');
  });

  test('默认值处理', () => {
    assertEquals(kernel.config.get('nonexistent.key', 'defaultVal'), 'defaultVal', '应返回默认值');
    assertEquals(kernel.config.get('another.missing'), undefined, '无默认值应返回undefined');
  });

  test('配置合并', () => {
    kernel.config.merge({ audit: { merged: true, existing: 'keep' } });
    assertEquals(kernel.config.get('audit.merged'), true, '新值应合并');
    assertEquals(kernel.config.get('audit.existing'), 'keep', '旧值应保留');
  });

  test('原型污染防护', () => {
    let protoError = false;
    try {
      kernel.config.set('__proto__.polluted', true);
    } catch (e) {
      protoError = true;
    }
    assert(protoError === true, '应阻止__proto__键');

    let constructorError = false;
    try {
      kernel.config.set('constructor.prototype.hacked', true);
    } catch (e) {
      constructorError = true;
    }
    assert(constructorError === true, '应阻止constructor.prototype键');
  });

  // ===== 测试组7: 关闭流程验证 =====
  console.log('\n--- 测试组7: 关闭流程验证 ---');
  
  let shutdownBeforeFired = false;
  let shutdownAfterFired = false;
  
  kernel.on('kernel:shutdown:before', () => { shutdownBeforeFired = true; });
  kernel.on('kernel:shutdown:after', () => { shutdownAfterFired = true; });

  const shutdownStart = performance.now();
  await kernel.shutdown();
  const shutdownTime = performance.now() - shutdownStart;

  test('Kernel关闭时间 <100ms', () => {
    assert(shutdownTime < 100, `关闭耗时${shutdownTime.toFixed(2)}ms，应<100ms`);
  });

  test('Kernel关闭状态正确', () => {
    const status = kernel.getStatus();
    assertEquals(status.shutdown, true, '关闭后应为true');
    assertEquals(status.state, 'shutdown', '状态应为shutdown');
  });

  test('关闭事件序列正确', () => {
    assert(shutdownBeforeFired === true, '应触发shutdown:before事件');
    assert(shutdownAfterFired === true, '应触发shutdown:after事件');
  });

  test('重复关闭安全', async () => {
    await kernel.shutdown(); // 不应抛出异常
    const status = kernel.getStatus();
    assertEquals(status.shutdown, true, '仍应为关闭状态');
  });

  // ===== 测试组8: 边界条件和极端情况 =====
  console.log('\n--- 测试组8: 边界条件和极端情况 ---');
  
  await testAsync('空配置初始化', async () => {
    const emptyKernel = new Kernel();
    await emptyKernel.initialize();
    assertEquals(emptyKernel.getStatus().initialized, true, '空配置应能初始化');
    await emptyKernel.shutdown();
  });

  await testAsync('大量服务注册性能', async () => {
    const perfRegistry = new ServiceRegistry();
    const start = performance.now();
    
    for (let i = 0; i < 1000; i++) {
      perfRegistry.register(`perf.service.${i}`, () => ({ idx: i }), { singleton: true });
    }
    
    const elapsed = performance.now() - start;
    assert(elapsed < 100, `注册1000个服务应<100ms，实际${elapsed.toFixed(2)}ms`);
    assertEquals(perfRegistry.getStatus().registered, 1000, '应注册1000个服务');
  });

  test('大量事件监听器', async () => {
    return new Promise(async (resolve) => {
      const perfEventBus = new EventBus();
      let count = 0;
      
      for (let i = 0; i < 500; i++) {
        perfEventBus.on('stress:event', () => count++);
      }
      
      const start = performance.now();
      await perfEventBus.emit('stress:event', {});
      const elapsed = performance.now() - start;
      
      assertEquals(count, 500, '500个监听器都应被触发');
      assert(elapsed < 50, `触发500个监听器应<50ms，实际${elapsed.toFixed(2)}ms`);
      resolve();
    });
  });

  await testAsync('深度嵌套配置', () => {
    const deepConfig = new ConfigManager({});
    deepConfig.set('a.b.c.d.e.f.g.h.i.j.k.l', 'veryDeep');
    assertEquals(deepConfig.get('a.b.c.d.e.f.g.h.i.j.k.l'), 'veryDeep', '应支持12层嵌套');
  });

  // ===== 报告生成 =====
  const totalTime = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              第1轮：架构完整性审计结果                       ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ 通过: ${stats.passed.toString().padStart(3)}                                              ║`);
  console.log(`║  ❌ 失败: ${stats.failed.toString().padStart(3)}                                              ║`);
  console.log(`║  总计: ${(stats.passed + stats.failed).toString().padStart(3)}                                                ║`);
  console.log(`║  耗时: ${totalTime}s                                               ║`);
  console.log(`║  发现问题: ${stats.findings.length} 个                                       ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (stats.findings.length > 0) {
    console.log('发现的问题:');
    stats.findings.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.severity}] ${f.category}: ${f.test}`);
      console.log(`     问题: ${f.issue}`);
    });
  }

  // 返回统计信息
  return {
    round: 1,
    name: '架构完整性审计',
    role: '系统架构师 + 经济学家',
    passed: stats.passed,
    failed: stats.failed,
    total: stats.passed + stats.failed,
    score: Math.round((stats.passed / (stats.passed + stats.failed)) * 100),
    findings: stats.findings,
    duration: totalTime
  };
}

runRound1()
  .then(result => {
    console.log('\n📊 第1轮审核完成！');
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('审核执行错误:', error);
    process.exit(1);
  });
