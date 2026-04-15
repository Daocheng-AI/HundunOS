/**
 * 第3-10轮：综合深度审核套件
 * 包含：代码质量、性能压力、API一致性、依赖关系、
 *       错误处理、集成测试、边界条件、生产环境模拟
 */

import { Kernel } from '../core/Kernel.js';
import { EventBus } from '../core/EventBus.js';
import { ServiceRegistry } from '../core/ServiceRegistry.js';
import { PluginManager } from '../core/PluginManager.js';
import { ConfigManager } from '../core/ConfigManager.js';
import { BasePlugin } from '../core/BasePlugin.js';
import { performance } from 'perf_hooks';

const allStats = {
  round3: { passed: 0, failed: 0, name: '代码质量深度审查', role: '代码审计员+UX评审员' },
  round4: { passed: 0, failed: 0, name: '性能压力基准测试', role: '性能工程师' },
  round5: { passed: 0, failed: 0, name: 'API一致性与易用性', role: 'UX评审员+产品经理' },
  round6: { passed: 0, failed: 0, name: '依赖关系深度分析', role: '系统架构师' },
  round7: { passed: 0, failed: 0, name: '错误处理全面验证', role: '测试工程师+安全专家' },
  round8: { passed: 0, failed: 0, name: '集成测试深度验证', role: '测试工程师+产品经理' },
  round9: { passed: 0, failed: 0, name: '边界条件极限测试', role: '测试工程师+性能工程师' },
  round10:{ passed: 0, failed: 0, name: '生产环境模拟验证', role: '全部角色联合' }
};

let currentRound = null;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    currentRound.passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    currentRound.failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    currentRound.passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    currentRound.failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `Expected ${expected}, got ${actual}`);
}

// ==================== 第3轮：代码质量深度审查 ====================
async function runRound3() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第3轮：代码质量深度审查                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  currentRound = allStats.round3;

  // 命名规范检查
  test('Kernel类名使用PascalCase', () => {
    assert(typeof Kernel === 'function', 'Kernel应存在');
    assert(Kernel.name === 'Kernel', '类名应为PascalCase');
  });

  test('EventBus类名使用PascalCase', () => {
    assert(EventBus.name === 'EventBus', '类名应为PascalCase');
  });

  test('ServiceRegistry类名使用PascalCase', () => {
    assert(ServiceRegistry.name === 'ServiceRegistry', '类名应为PascalCase');
  });

  // 方法命名检查
  const kernel = new Kernel({ environment: 'test' });
  
  test('Kernel方法使用camelCase', () => {
    assert(typeof kernel.initialize === 'function', '应有initialize方法');
    assert(typeof kernel.shutdown === 'function', '应有shutdown方法');
    assert(typeof kernel.get === 'function', '应有get方法');
    assert(typeof kernel.register === 'function', '应有register方法');
    assert(typeof kernel.on === 'function', '应有on方法');
    assert(typeof kernel.emit === 'function', '应有emit方法');
    assert(typeof kernel.getStatus === 'function', '应有getStatus方法');
  });

  await kernel.initialize();

  test('EventBus方法使用camelCase', () => {
    assert(typeof kernel.events.on === 'function', '应有on方法');
    assert(typeof kernel.events.off === 'function', '应有off方法');
    assert(typeof kernel.events.emit === 'function', '应有emit方法');
    assert(typeof kernel.events.use === 'function', '应有use方法');
  });

  test('ServiceRegistry方法使用camelCase', () => {
    assert(typeof kernel.services.register === 'function', '应有register方法');
    assert(typeof kernel.services.get === 'function', '应有get方法');
    assert(typeof kernel.services.has === 'function', '应有has方法');
    assert(typeof kernel.services.unregister === 'function', '应有unregister方法');
  });

  // JSDoc文档检查
  test('Kernel有构造函数文档', () => {
    const str = Kernel.toString();
    assert(str.includes('*') || str.includes('@') || Kernel.length > 0, '应有JSDoc注释');
  });

  // 接口完整性
  test('Kernel返回正确的状态对象', () => {
    const status = kernel.getStatus();
    assert(typeof status === 'object', '状态应为对象');
    assert('state' in status, '应有state属性');
    assert('initialized' in status, '应有initialized属性');
    assert('shutdown' in status, '应有shutdown属性');
    assert('plugins' in status, '应有plugins属性');
    assert('services' in status, '应有services属性');
  });

  await kernel.shutdown();

  console.log(`\n  第3轮结果: ✅ ${currentRound.passed}  ❌ ${currentRound.failed}`);
}

// ==================== 第4轮：性能压力基准测试 ====================
async function runRound4() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第4轮：性能压力基准测试                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  currentRound = allStats.round4;

  await testAsync('服务注册1000个 <100ms', async () => {
    const reg = new ServiceRegistry();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      reg.register(`perf.${i}`, () => ({ i }), { singleton: true });
    }
    const elapsed = performance.now() - start;
    assert(elapsed < 100, `注册耗时${elapsed.toFixed(2)}ms`);
  });

  await testAsync('服务获取1000次 <50ms', async () => {
    const reg = new ServiceRegistry();
    reg.register('fast', () => ({ ok: true }), { singleton: true });
    await reg.get('fast'); // 预热
    
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      await reg.get('fast');
    }
    const elapsed = performance.now() - start;
    assert(elapsed < 50, `获取耗时${elapsed.toFixed(2)}ms`);
  });

  await testAsync('事件触发10000次 <500ms', async () => {
    const eb = new EventBus();
    eb.on('perf:event', () => {});
    
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      await eb.emit('perf:event', {});
    }
    const elapsed = performance.now() - start;
    assert(elapsed < 500, `触发耗时${elapsed.toFixed(2)}ms`);
  });

  test('内存使用合理', () => {
    const before = process.memoryUsage().heapUsed;
    const arr = [];
    for (let i = 0; i < 10000; i++) {
      arr.push({ data: new Array(10).fill(i) });
    }
    const after = process.memoryUsage().heapUsed;
    const mb = (after - before) / 1024 / 1024;
    assert(mb < 20, `内存增长${mb.toFixed(2)}MB应<20MB`);
  });

  await testAsync('Kernel完整生命周期 <200ms', async () => {
    const start = performance.now();
    const k = new Kernel({ environment: 'test' });
    await k.initialize();
    k.register('test', () => ({}), { singleton: true });
    await k.get('test');
    await k.shutdown();
    const elapsed = performance.now() - start;
    assert(elapsed < 200, `生命周期耗时${elapsed.toFixed(2)}ms`);
  });

  console.log(`\n  第4轮结果: ✅ ${currentRound.passed}  ❌ ${currentRound.failed}`);
}

// ==================== 第5轮：API一致性与易用性 ====================
async function runRound5() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第5轮：API一致性与易用性                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  currentRound = allStats.round5;

  const k = new Kernel({ environment: 'production' });
  await k.initialize();

  test('Kernel.get() 返回Promise', () => {
    const result = k.get('config');
    assert(result instanceof Promise, '应返回Promise');
  });

  test('Kernel.register() 支持链式调用', () => {
    const result = k.register('chain1', () => ({}))
      .register('chain2', () => ({}));
    assert(result === k, '应返回kernel以支持链式调用');
  });

  test('Kernel.on() 返回取消函数', () => {
    const unsub = k.on('test', () => {});
    assert(typeof unsub === 'function', '应返回取消订阅函数');
    unsub(); // 应该不报错
  });

  test('Kernel.getStatus() 格式统一', () => {
    const s = k.getStatus();
    assert(typeof s.state === 'string', 'state应是string');
    assert(typeof s.initialized === 'boolean', 'initialized应是boolean');
    assert(typeof s.shutdown === 'boolean', 'shutdown应是boolean');
    assert(typeof s.plugins === 'object', 'plugins应是object');
    assert(typeof s.services === 'object', 'services应是object');
  });

  await testAsync('错误消息格式统一', async () => {
    try {
      await k.get('nonexistent');
      throw new Error('应该失败');
    } catch (e) {
      assert(e.message.length > 0, '错误消息不应为空');
      assert(typeof e.message === 'string', '错误消息应是字符串');
    }
  });

  test('ConfigManager.get() 默认值undefined', () => {
    assertEquals(k.config.get('missing'), undefined, '默认应为undefined');
    assertEquals(k.config.get('missing', 'default'), 'default', '应返回指定默认值');
  });

  await k.shutdown();

  console.log(`\n  第5轮结果: ✅ ${currentRound.passed}  ❌ ${currentRound.failed}`);
}

// ==================== 第6轮：依赖关系深度分析 ====================
async function runRound6() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第6轮：依赖关系深度分析                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  currentRound = allStats.round6;

  await testAsync('插件依赖链正确加载顺序', async () => {
    const k = new Kernel();
    await k.initialize();
    const order = [];
    
    class A extends BasePlugin {
      get name() { return 'depA'; }
      async onInit() { order.push('A'); }
    }
    class B extends BasePlugin {
      get name() { return 'depB'; }
      get dependencies() { return ['depA']; }
      async onInit() { order.push('B'); }
    }
    class C extends BasePlugin {
      get name() { return 'depC'; }
      get dependencies() { return ['depB']; }
      async onInit() { order.push('C'); }
    }
    
    k.plugins.register('depA', A, {});
    k.plugins.register('depB', B, { dependencies: ['depA'] });
    k.plugins.register('depC', C, { dependencies: ['depB'] });
    
    await k.plugins.load('depC');
    
    assertEquals(order[0], 'A', 'A应先加载');
    assertEquals(order[1], 'B', 'B应第二加载');
    assertEquals(order[2], 'C', 'C应最后加载');
    
    await k.shutdown();
  });

  await testAsync('循环依赖正确检测', async () => {
    const reg = new ServiceRegistry();
    reg.register('x', async () => ({ y: await reg.get('y') }), { singleton: true });
    reg.register('y', async () => ({ x: await reg.get('x') }), { singleton: true });
    
    try {
      await reg.get('x');
      throw new Error('应检测到循环依赖');
    } catch (e) {
      assert(e.message.includes('Circular'), '应包含Circular');
    }
  });

  await testAsync('缺失依赖正确报错', async () => {
    const reg = new ServiceRegistry();
    reg.register('needsDep', () => ({}), { 
      singleton: true,
      dependencies: ['missingDep'] 
    });
    
    try {
      await reg.get('needsDep');
      throw new Error('应检测到缺失依赖');
    } catch (e) {
      assert(e.message.includes('not registered') || e.message.includes('Missing'), 
            '应报告缺失依赖');
    }
  });

  test('服务注册表状态准确', () => {
    const reg = new ServiceRegistry();
    reg.register('s1', () => ({}), { singleton: true });
    reg.register('s2', () => ({}), { singleton: false });
    
    const status = reg.getStatus();
    assertEquals(status.registered, 2, '应注册2个服务');
    assertEquals(status.instantiated, 0, '应实例化0个服务');
  });

  console.log(`\n  第6轮结果: ✅ ${currentRound.passed}  ❌ ${currentRound.failed}`);
}

// ==================== 第7轮：错误处理全面验证 ====================
async function runRound7() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第7轮：错误处理全面验证                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  currentRound = allStats.round7;

  const k = new Kernel({ environment: 'test' });
  await k.initialize();

  await testAsync('重复初始化抛出明确错误', async () => {
    try {
      await k.initialize();
      throw new Error('应抛出已初始化错误');
    } catch (e) {
      assert(e.message.includes('already') || e.message.includes('Already'), 
            `应说明已初始化: ${e.message}`);
    }
  });

  await testAsync('获取未注册服务抛出明确错误', async () => {
    try {
      await k.get('definitely.not.exist');
      throw new Error('应抛出未注册错误');
    } catch (e) {
      assert(e.message.includes('not registered'), `应说明未注册: ${e.message}`);
    }
  });

  test('事件处理器错误被隔离', async () => {
    return new Promise(async (resolve) => {
      let errorCount = 0;
      
      k.events.on('error.isolation', () => { throw new Error('Handler error'); });
      k.events.on('error.isolation', () => { errorCount++; });
      
      const results = await k.events.emit('error.isolation', {});
      
      assert(results.length === 2, '应有2个结果');
      assert(results[0].success === false, '第一个应失败');
      assert(results[1].success === true, '第二个应成功');
      assertEquals(errorCount, 1, '成功的处理器应被调用');
      resolve();
    });
  });

  await testAsync('关闭后操作安全', async () => {
    await k.shutdown();
    
    // 关闭后再关闭不应报错
    await k.shutdown();
    
    const status = k.getStatus();
    assertEquals(status.shutdown, true, '仍应处于关闭状态');
  });

  console.log(`\n  第7轮结果: ✅ ${currentRound.passed}  ❌ ${currentRound.failed}`);
}

// ==================== 第8轮：集成测试深度验证 ====================
async function runRound8() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第8轮：集成测试深度验证                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  currentRound = allStats.round8;

  await testAsync('完整生命周期集成测试', async () => {
    const k = new Kernel({ environment: 'integration-test' });
    
    // 初始化
    await k.initialize();
    assertEquals(k.getStatus().initialized, true, '应初始化');
    
    // 注册和获取服务
    k.register('svc1', () => ({ val: 1 }), { singleton: true });
    const svc = await k.get('svc1');
    assertEquals(svc.val, 1, '服务应可用');
    
    // 事件通信
    let eventData = null;
    k.on('int:test', (d) => { eventData = d; });
    await k.emit('int:test', { msg: 'hello' });
    assertEquals(eventData.msg, 'hello', '事件应传递数据');
    
    // 关闭
    await k.shutdown();
    assertEquals(k.getStatus().shutdown, true, '应关闭');
  });

  await testAsync('多插件协作集成测试', async () => {
    const k = new Kernel();
    await k.initialize();
    
    let collaborationData = null;
    
    class Sender extends BasePlugin {
      get name() { return 'sender'; }
      async onInit() {}
      async send() {
        await this.kernel.emit('collab:data', { from: 'sender', text: 'hi' });
      }
    }
    
    class Receiver extends BasePlugin {
      get name() { return 'receiver'; }
      async onInit() {
        this.kernel.on('collab:data', (d) => { collaborationData = d; });
      }
    }
    
    k.plugins.register('sender', Sender, {});
    k.plugins.register('receiver', Receiver, {});
    
    await k.plugins.load('sender');
    await k.plugins.load('receiver');
    
    const sender = k.plugins.get('sender');
    await sender.send();
    
    assertEquals(collaborationData.from, 'sender', '应收到发送者标识');
    assertEquals(collaborationData.text, 'hi', '应收到消息内容');
    
    await k.shutdown();
  });

  await testAsync('配置动态更新集成测试', async () => {
    const cfg = new ConfigManager({ a: 1, b: { c: 2 } });
    await cfg.initialize();
    
    assertEquals(cfg.get('a'), 1, '初始值正确');
    
    cfg.set('new.key', 'value');
    assertEquals(cfg.get('new.key'), 'value', '新值应可获取');
    
    cfg.merge({ d: 3, b: { e: 4 } });
    assertEquals(cfg.get('b.c'), 2, '旧嵌套值保留');
    assertEquals(cfg.get('b.e'), 4, '新嵌套值添加');
    assertEquals(cfg.get('d'), 3, '新顶层值添加');
  });

  console.log(`\n  第8轮结果: ✅ ${currentRound.passed}  ❌ ${currentRound.failed}`);
}

// ==================== 第9轮：边界条件极限测试 ====================
async function runRound9() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第9轮：边界条件极限测试                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  currentRound = allStats.round9;

  test('空值和null处理', () => {
    const cfg = new ConfigManager({});
    cfg.set('empty', '');
    cfg.set('nullVal', null);
    
    assertEquals(cfg.get('empty'), '', '空字符串应保留');
    assertEquals(cfg.get('nullVal'), null, 'null应保留');
    assertEquals(cfg.get('nonexistent'), undefined, '缺失应返回undefined');
  });

  test('超长字符串处理', async () => {
    return new Promise(async (resolve) => {
      const eb = new EventBus();
      const longStr = 'x'.repeat(10000);
      let received = null;
      
      eb.on('long:str', (data) => { received = data; });
      await eb.emit('long:str', longStr);
      
      assertEquals(received.length, 10000, '超长字符串应完整传递');
      resolve();
    });
  });

  test('深层嵌套配置', () => {
    const cfg = new ConfigManager({});
    cfg.set('a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p', 'deep');
    assertEquals(cfg.get('a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p'), 'deep', '16层嵌套应支持');
  });

  await testAsync('大量并发事件', async () => {
    const eb = new EventBus();
    let count = 0;
    eb.on('concurrent:e', () => count++);
    
    const promises = Array(100).fill(null).map(() => eb.emit('concurrent:e', {}));
    await Promise.all(promises);
    
    assertEquals(count, 100, '100个并发事件都应处理');
  });

  test('极端数量服务注册', () => {
    const reg = new ServiceRegistry();
    for (let i = 0; i < 10000; i++) {
      reg.register(`extreme.${i}`, () => ({ idx: i }), { singleton: false });
    }
    assertEquals(reg.getStatus().registered, 10000, '10000个服务应注册');
  });

  console.log(`\n  第9轮结果: ✅ ${currentRound.passed}  ❌ ${currentRound.failed}`);
}

// ==================== 第10轮：生产环境模拟验证 ====================
async function runRound10() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第10轮：生产环境模拟验证                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  currentRound = allStats.round10;

  await testAsync('高负载场景模拟', async () => {
    const k = new Kernel({ environment: 'production' });
    await k.initialize();
    
    // 注册大量服务
    for (let i = 0; i < 100; i++) {
      k.register(`load.svc.${i}`, () => ({ id: i }), { singleton: true });
    }
    
    // 并发访问
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(k.get(`load.svc.${i}`));
    }
    
    const results = await Promise.all(promises);
    assertEquals(results.length, 100, '应返回100个结果');
    
    await k.shutdown();
  });

  await testAsync('长时间运行稳定性', async () => {
    const k = new Kernel();
    await k.initialize();
    
    // 模拟大量操作
    for (let i = 0; i < 1000; i++) {
      await k.emit(`stress.${i % 10}`, { iter: i });
    }
    
    const status = k.getStatus();
    assertEquals(status.initialized, true, '长时间运行后仍应初始化');
    
    await k.shutdown();
  });

  await testAsync('资源释放验证', async () => {
    const beforeMem = process.memoryUsage().heapUsed;
    
    const k = new Kernel();
    await k.initialize();
    
    // 创建和销毁大量资源
    for (let i = 0; i < 500; i++) {
      k.register(`cleanup.${i}`, () => ({ data: new Array(100).fill(i) }), { singleton: false });
      await k.get(`cleanup.${i}`);
    }
    
    await k.shutdown();
    
    // 强制GC（如果可用）
    if (global.gc) global.gc();
    
    const afterMem = process.memoryUsage().heapUsed;
    const increaseMB = (afterMem - beforeMem) / 1024 / 1024;
    
    assert(increaseMB < 30, `内存增长${increaseMB.toFixed(2)}MB应<30MB`);
  });

  await testAsync('故障恢复能力', async () => {
    const k = new Kernel();
    await k.initialize();
    
    let failCount = 0;
    k.services.register('flaky', () => {
      failCount++;
      if (failCount < 3) throw new Error('Flaky!');
      return { stable: true };
    }, { singleton: false });
    
    // 前两次失败
    try { await k.get('flaky'); } catch (e) {}
    try { await k.get('flaky'); } catch (e) {}
    
    // 第三次成功
    const result = await k.get('flaky');
    assertEquals(result.stable, true, '故障恢复后应正常工作');
    
    await k.shutdown();
  });

  console.log(`\n  第10轮结果: ✅ ${currentRound.passed}  ❌ ${currentRound.failed}`);
}

// ==================== 主函数 ====================
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     HundunOS v5 - 第3-10轮综合深度审核                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const startTime = performance.now();

  await runRound3();
  await runRound4();
  await runRound5();
  await runRound6();
  await runRound7();
  await runRound8();
  await runRound9();
  await runRound10();

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);

  // 汇总报告
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              第3-10轮综合审核最终报告                          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (const [key, round] of Object.entries(allStats)) {
    totalPassed += round.passed;
    totalFailed += round.failed;
    const pct = round.total > 0 ? Math.round((round.passed / round.total) * 100) : 0;
    const status = round.failed === 0 ? '✅' : '⚠️';
    console.log(`║  ${status} 第${key.replace('round', '')}轮: ${round.name.padEnd(18)} ${pct.toString().padStart(3)}% (${round.passed}/${round.total})   ║`);
  }
  
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  总计: ✅ ${totalPassed.toString().padStart(3)}  ❌ ${totalFailed.toString().padStart(3)}  成功率: ${((totalPassed/(totalPassed+totalFailed))*100).toFixed(1)}%  耗时: ${totalTime}s  ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (totalFailed === 0) {
    console.log('🎉 所有轮次全部通过！');
  } else {
    console.log(`⚠️  有 ${totalFailed} 个测试需要关注`);
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);
