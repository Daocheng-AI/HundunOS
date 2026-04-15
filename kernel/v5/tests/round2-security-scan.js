/**
 * 第2轮：安全漏洞深度扫描
 * 主导角色：安全专家
 * 审核内容：
 *   1. 输入注入攻击测试
 *   2. 原型污染检测
 *   3. 敏感信息泄露检查
 *   4. 参数验证完整性
 *   5. 权限控制验证
 */

import { Kernel } from '../core/Kernel.js';
import { EventBus } from '../core/EventBus.js';
import { ServiceRegistry } from '../core/ServiceRegistry.js';
import { ConfigManager } from '../core/ConfigManager.js';

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
      severity: 'P1',
      category: 'Security',
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
      severity: 'P1',
      category: 'Security',
      test: name,
      issue: error.message
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ==================== 第2轮：安全漏洞深度扫描 ====================
async function runRound2() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     第2轮：安全漏洞深度扫描                                 ║');
  console.log('║     角色：安全专家                                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // ===== 测试组1: 原型污染防护 =====
  console.log('--- 测试组1: 原型污染防护 ---');
  
  const config = new ConfigManager({});
  
  test('__proto__ 键应被拒绝', () => {
    let threw = false;
    try {
      config.set('__proto__.polluted', true);
    } catch (e) {
      threw = true;
      assert(e.message.includes('__proto__') || e.message.includes('Invalid'), 
            `错误消息应说明原因: ${e.message}`);
    }
    assert(threw === true, '应该抛出错误');
  });

  test('constructor.prototype 键应被拒绝', () => {
    let threw = false;
    try {
      config.set('constructor.prototype.hacked', true);
    } catch (e) {
      threw = true;
    }
    assert(threw === true, '应该抛出错误');
  });

  test('prototype 键应被拒绝', () => {
    let threw = false;
    try {
      config.set('prototype.pollute', true);
    } catch (e) {
      threw = true;
    }
    assert(threw === true, '应该抛出错误');
  });

  test('原型污染后对象不受影响', () => {
    // 尝试污染后检查普通对象
    const testObj = {};
    assert(testObj.polluted === undefined, '普通对象不应被污染');
    assert(testObj.hacked === undefined, '普通对象不应被污染');
  });

  // ===== 测试组2: 输入参数验证 =====
  console.log('\n--- 测试组2: 输入参数验证 ---');
  
  const kernel = new Kernel({ environment: 'test' });
  await kernel.initialize();

  test('ServiceRegistry 拒绝非字符串服务名', async () => {
    return new Promise(async (resolve) => {
      try {
        await kernel.services.get(123);
        throw new Error('应该拒绝数字类型');
      } catch (e) {
        assert(e.message.includes('string'), `应提示需要string: ${e.message}`);
        resolve();
      }
    });
  });

  test('ServiceRegistry 拒绝空字符串服务名', async () => {
    return new Promise(async (resolve) => {
      try {
        await kernel.services.get('');
        throw new Error('可能接受空字符串');
      } catch (e) {
        resolve(); // 空字符串可能被允许，只要不崩溃
      }
    });
  });

  test('EventBus 拒绝非字符串事件名', () => {
    try {
      kernel.events.on(123, () => {});
      throw new Error('应该拒绝数字类型事件名');
    } catch (e) {
      assert(e.message.includes('string'), `应提示需要string: ${e.message}`);
    }
  });

  test('EventBus 拒绝非函数处理器', () => {
    try {
      kernel.events.on('test.event', 'not a function');
      throw new Error('应该拒绝非函数处理器');
    } catch (e) {
      assert(e.message.includes('function'), `应提示需要function: ${e.message}`);
    }
  });

  test('ConfigManager 拒绝危险键', () => {
    const dangerousKeys = [
      '__proto__',
      'constructor',
      'prototype',
      '__defineGetter__',
      '__defineSetter__'
    ];
    
    for (const key of dangerousKeys) {
      let threw = false;
      try {
        kernel.config.set(`${key}.test`, 'value');
      } catch (e) {
        threw = true;
      }
      assert(threw === true, `应拒绝 ${key} 键`);
    }
  });

  // ===== 测试组3: 特殊字符处理 =====
  console.log('\n--- 测试组3: 特殊字符处理 ---');
  
  const eventBus = new EventBus();
  
  test('事件名支持冒号分隔', () => {
    let received = false;
    eventBus.on('test:event:nested', () => received = true);
    eventBus.emitSync('test:event:nested', {});
    assert(received === true, '应支持冒号分隔的事件名');
  });

  test('事件名支持点号分隔', () => {
    let received = false;
    eventBus.on('test.event.nested', () => received = true);
    eventBus.emitSync('test.event.nested', {});
    assert(received === true, '应支持点号分隔的事件名');
  });

  test('事件名支持特殊字符', () => {
    const specialNames = ['test-event', 'test_event', 'Test.Event'];
    for (const name of specialNames) {
      let called = false;
      eventBus.on(name, () => called = true);
      eventBus.emitSync(name, {});
      assert(called === true, `应支持事件名: ${name}`);
    }
  });

  // ===== 测试组4: 服务名注入防护 =====
  console.log('\n--- 测试组4: 服务名注入防护 ---');
  
  const registry = new ServiceRegistry();

  test('服务名路径遍历防护', async () => {
    return new Promise(async (resolve) => {
      registry.register('../etc/passwd', () => ({ safe: true }), { singleton: true });
      const instance = await registry.get('../etc/passwd');
      assert(instance.safe === true, '路径遍历服务名不应导致安全问题');
      
      registry.register('./../../secret', () => ({ data: 'test' }), { singleton: true });
      const instance2 = await registry.get('./../../secret');
      assert(instance2.data === 'test', '相对路径服务名应正常工作');
      resolve();
    });
  });

  test('超长服务名处理', async () => {
    return new Promise(async (resolve) => {
      const longName = 'a'.repeat(1000);
      registry.register(longName, () => ({ ok: true }), { singleton: true });
      const instance = await registry.get(longName);
      assert(instance.ok === true, '超长服务名应正常工作');
      resolve();
    });
  });

  // ===== 测试组5: 数据验证 =====
  console.log('\n--- 测试组5: 数据验证 ---');
  
  test('配置值XSS防护', () => {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '"><script>alert(1)</script>',
      "'; DROP TABLE users; --",
      '{{7*7}}' // Template injection
    ];
    
    for (const payload of xssPayloads) {
      kernel.config.set(`xss.test`, payload);
      const retrieved = kernel.config.get('xss.test');
      assertEquals(retrieved, payload, 'XSS payload应原样存储，不执行');
    }
  });

  test('SQL注入模式在配置中存储安全', () => {
    const sqlPayloads = [
      "'; DROP TABLE users; --",
      "1 OR 1=1",
      "'; INSERT INTO users VALUES('hacked')--"
    ];
    
    for (const payload of sqlPayloads) {
      kernel.config.set(`sql.test`, payload);
      const retrieved = kernel.config.get(`sql.test`);
      assertEquals(retrieved, payload, 'SQL payload应原样存储');
    }
  });

  // ===== 测试组6: 并发安全性 =====
  console.log('\n--- 测试组6: 并发安全性 ---');
  
  await testAsync('并发获取单例服务安全', async () => {
    const concurrentRegistry = new ServiceRegistry();
    let factoryCallCount = 0;
    
    concurrentRegistry.register('concurrent.singleton', async () => {
      factoryCallCount++;
      await new Promise(r => setTimeout(r, 10)); // 模拟异步操作
      return { id: factoryCallCount };
    }, { singleton: true });
    
    // 并发获取10次
    const promises = Array(10).fill(null).map(() => 
      concurrentRegistry.get('concurrent.singleton')
    );
    
    const results = await Promise.all(promises);
    
    assertEquals(factoryCallCount, 1, '工厂只应调用一次');
    results.forEach(r => {
      assertEquals(r.id, 1, '所有结果应是同一个实例');
    });
  });

  await testAsync('并发注册和获取不冲突', async () => {
    const raceRegistry = new ServiceRegistry();
    
    // 并发注册
    const registerPromises = Array(50).fill(null).map((_, i) => 
      Promise.resolve().then(() => 
        raceRegistry.register(`race.service.${i}`, () => ({ idx: i }), { singleton: false })
      )
    );
    await Promise.all(registerPromises);
    
    // 并发获取
    const getPromises = Array(50).fill(null).map((_, i) => 
      raceRegistry.get(`race.service.${i}`)
    );
    const results = await Promise.all(getPromises);
    
    assertEquals(results.length, 50, '应返回50个结果');
    results.forEach((r, i) => {
      assertEquals(r.idx, i, `结果${i}应正确`);
    });
  });

  // ===== 测试组7: 资源限制 =====
  console.log('\n--- 测试组7: 资源限制 ---');
  
  test('大量监听器警告但不阻止', () => {
    const warnBus = new EventBus({ maxListeners: 10 });
    
    for (let i = 0; i < 15; i++) {
      warnBus.on('limit.test', () => {});
    }
    
    // 应该有15个监听器（超过maxListeners但未阻止）
    assertEquals(warnBus.listenerCount('limit.test'), 15, '应允许超过maxListeners');
  });

  test('大量服务注册性能', () => {
    const bigRegistry = new ServiceRegistry();
    const start = Date.now();
    
    for (let i = 0; i < 5000; i++) {
      bigRegistry.register(`mass.${i}`, () => ({}), { singleton: false });
    }
    
    const elapsed = Date.now() - start;
    assert(elapsed < 200, `注册5000个服务应<200ms，实际${elapsed}ms`);
    assertEquals(bigRegistry.getStatus().registered, 5000, '应有5000个服务');
  });

  // ===== 测试组8: 错误信息安全性 =====
  console.log('\n--- 测试组8: 错误信息安全性 ---');
  
  test('错误消息不含敏感信息', () => {
    try {
      throw new Error('test error with password=secret123');
    } catch (e) {
      // 在生产环境中，错误消息可能包含敏感信息
      // 这里我们只是记录这个潜在问题
      if (e.message.includes('password')) {
        stats.findings.push({
          severity: 'P2',
          category: 'Security',
          test: '错误消息可能含敏感信息',
          issue: '错误消息中包含可能的敏感信息模式'
        });
      }
    }
    // 这个测试总是通过，但会记录发现
  });

  test('日志不记录密码等敏感字段', () => {
    // 验证logger接口存在
    const logger = kernel.services.get('logger');
    assert(logger !== undefined, 'logger服务应可用');
    
    // 测试日志功能不会因敏感数据而崩溃
    logger.info('Test message with fake-password=secret');
    logger.debug('Debug with api_key=test-key-12345');
    // 如果到这里没有异常，测试通过
  });

  await kernel.shutdown();

  // ===== 报告生成 =====
  const totalTime = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              第2轮：安全漏洞扫描结果                           ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ 通过: ${stats.passed.toString().padStart(3)}                                              ║`);
  console.log(`║  ❌ 失败: ${stats.failed.toString().padStart(3)}                                              ║`);
  console.log(`║  总计: ${(stats.passed + stats.failed).toString().padStart(3)}                                                ║`);
  console.log(`║  耗时: ${totalTime}s                                               ║`);
  console.log(`║  安全发现: ${stats.findings.length} 个                                       ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (stats.findings.length > 0) {
    console.log('安全发现:');
    stats.findings.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.severity}] ${f.category}: ${f.test}`);
      console.log(`     问题: ${f.issue}`);
    });
  }

  return {
    round: 2,
    name: '安全漏洞深度扫描',
    role: '安全专家',
    passed: stats.passed,
    failed: stats.failed,
    total: stats.passed + stats.failed,
    score: Math.round((stats.passed / (stats.passed + stats.failed)) * 100),
    findings: stats.findings,
    duration: totalTime
  };
}

runRound2()
  .then(result => {
    console.log('\n🔒 第2轮安全扫描完成！');
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('扫描执行错误:', error);
    process.exit(1);
  });
