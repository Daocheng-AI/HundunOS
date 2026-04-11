/**
 * HundunOS v3.0 - 边界条件测试
 * 测试系统在极端情况下的行为
 */

// ── Windows UTF-8 输出修复 ──────────────────────────────────────────────────
// chcp 65001 设置 Windows 代码页为 UTF-8（解决 PowerShell CLIXML 乱码问题）
if (process.platform === 'win32') {
    try {
        const { execSync } = await import('child_process');
        execSync('chcp 65001>nul', { stdio: 'ignore', windowsHide: true });
    } catch (_) { /* 非关键，静默跳过 */ }
}

import { CoreKernel } from '../kernel/core.js';
import { IntentEngine } from '../kernel/intent-engine.js';
import { ModelRouter } from '../kernel/model-router/index.js';
import { assert } from './test_runner.js';

// ============================================================================
// 测试工具
// ============================================================================

class BoundaryTestRunner {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async runTest(name, testFn) {
    const start = Date.now();
    try {
      await testFn();
      this.passed++;
      this.results.push({ name, status: 'PASS', elapsed: Date.now() - start });
      // review: removed // review: removed console.log(`✓ ${name}`);
    } catch (error) {
      this.failed++;
      this.results.push({ name, status: 'FAIL', elapsed: Date.now() - start, error: error.message });
      console.error(`✗ ${name}: ${error.message}`);
    }
  }

  getSummary() {
    return {
      total: this.passed + this.failed,
      passed: this.passed,
      failed: this.failed,
      tests: this.results
    };
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertThrows(fn, message) {
    try {
      fn();
      throw new Error(message || 'Expected function to throw');
    } catch (error) {
      if (error.message === message) {
        throw error;
      }
    }
  }
}

// ============================================================================
// 边界测试用例
// ============================================================================

const runner = new BoundaryTestRunner();

// 1. 空输入测试
await runner.runTest('test_empty_input', async () => {
  const engine = new IntentEngine();
  await engine.initialize();

  const intent = await engine.parse({ content: '' }, { id: 'test' });
  runner.assert(intent.type !== undefined, 'Empty input should return valid intent');
  runner.assert(intent.confidence <= 0.5, 'Empty input should have low confidence');
});

// 2. 超长输入测试
await runner.runTest('test_very_long_input', async () => {
  const engine = new IntentEngine();
  await engine.initialize();

  const longText = 'a'.repeat(10000);
  const intent = await engine.parse({ content: longText }, { id: 'test' });

  runner.assert(intent.type !== undefined, 'Very long input should return valid intent');
  runner.assert(intent.description !== undefined, 'Very long input should have description');
});

// 3. 特殊字符输入测试
await runner.runTest('test_special_characters', async () => {
  const engine = new IntentEngine();
  await engine.initialize();

  const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
  const intent = await engine.parse({ content: specialChars }, { id: 'test' });

  runner.assert(intent.type !== undefined, 'Special characters should not crash');
});

// 4. Unicode 输入测试
await runner.runTest('test_unicode_input', async () => {
  const engine = new IntentEngine();
  await engine.initialize();

  const unicodeText = '你好 世界 🌍 🎉 测试 测试';
  // IntentEngine.parse() 期望 message.content 属性，而非裸字符串
  const intent = await engine.parse({ content: unicodeText }, { id: 'test' });

  runner.assert(intent.type !== undefined, 'Unicode input should be handled');
  runner.assert(intent.description === unicodeText, 'Unicode content should be preserved');
});

// 5. 空消息对象测试
await runner.runTest('test_empty_message_object', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const result = await kernel.process({});
  runner.assert(result !== undefined, 'Empty message object should return result');
  runner.assert(result.success !== undefined, 'Result should have success flag');
});

// 6. 极端 sessionId 测试
await runner.runTest('test_extreme_session_id', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const longSessionId = 'a'.repeat(1000);
  const result = await kernel.process({
    content: 'test',
    sessionId: longSessionId
  });

  runner.assert(result !== undefined, 'Long sessionId should be handled');
});

// 7. 快速连续请求测试
await runner.runTest('test_rapid_requests', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(kernel.process({
      content: `test ${i}`,
      sessionId: 'test'
    }));
  }

  const results = await Promise.all(promises);
  runner.assert(results.length === 100, 'All requests should complete');
  runner.assert(results.every(r => r !== undefined), 'All results should be defined');
});

// 8. 内存压力测试
await runner.runTest('test_memory_pressure', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  // 创建大量会话
  for (let i = 0; i < 1000; i++) {
    await kernel.process({
      content: `session ${i}`,
      sessionId: `session_${i}`
    });
  }

  const status = kernel.getStatus();
  runner.assert(status.modules.total > 0, 'Modules should be loaded');
});

// 9. 路径穿越防护测试
await runner.runTest('test_path_traversal_protection', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const pathTraversalAttempts = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    'C:/Windows/System32/drivers/etc/hosts',
    '\\\\network\\share'
  ];

  for (const path of pathTraversalAttempts) {
    const result = await kernel.process({
      type: 'file',
      content: `读取 ${path}`,
      sessionId: 'test'
    });

    runner.assert(result !== undefined, 'Path traversal should not crash');
    // 应该被阻止或安全处理
  }
});

// 10. 空参数测试
await runner.runTest('test_null_parameters', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const result = await kernel.process({
    content: null,
    sessionId: 'test'
  });

  runner.assert(result !== undefined, 'Null content should be handled');
});

// 11. 未定义参数测试
await runner.runTest('test_undefined_parameters', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const result = await kernel.process({
    content: undefined,
    sessionId: 'test'
  });

  runner.assert(result !== undefined, 'Undefined content should be handled');
});

// 12. 数组输入测试
await runner.runTest('test_array_input', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const result = await kernel.process(['a', 'b', 'c']);
  runner.assert(result !== undefined, 'Array input should be handled');
});

// 13. 对象输入测试
await runner.runTest('test_object_input', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const result = await kernel.process({
    nested: {
      deep: {
        value: 'test'
      }
    }
  });
  runner.assert(result !== undefined, 'Object input should be handled');
});

// 14. 数字输入测试
await runner.runTest('test_number_input', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const result = await kernel.process(12345);
  runner.assert(result !== undefined, 'Number input should be handled');
});

// 15. 布尔值输入测试
await runner.runTest('test_boolean_input', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const result1 = await kernel.process(true);
  const result2 = await kernel.process(false);

  runner.assert(result1 !== undefined, 'Boolean true should be handled');
  runner.assert(result2 !== undefined, 'Boolean false should be handled');
});

// 16. 超时测试
await runner.runTest('test_timeout_handling', async () => {
  const kernel = new CoreKernel({
    system: {
      kernel: {
        timeout: 100
      }
    }
  });
  await kernel.initialize();

  // 模拟长时间运行的任务
  const result = await kernel.process({
    content: 'test',
    sessionId: 'test'
  });

  runner.assert(result !== undefined, 'Timeout should be handled');
  runner.assert(result.latency !== undefined, 'Result should have latency');
});

// 17. 并发会话测试
await runner.runTest('test_concurrent_sessions', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(kernel.process({
      content: `test ${i}`,
      sessionId: `session_${i % 10}` // 重用10个会话
    }));
  }

  const results = await Promise.all(promises);
  runner.assert(results.length === 50, 'All concurrent requests should complete');
});

// 18. 恶意意图测试
await runner.runTest('test_malicious_intent', async () => {
  const engine = new IntentEngine();
  await engine.initialize();

  const maliciousInputs = [
    'DROP TABLE users;--',
    '<script>alert("XSS")</script>',
    '../../../../etc/passwd',
    'system("rm -rf /")',
    'eval(malicious_code)'
  ];

  for (const input of maliciousInputs) {
    const intent = await engine.parse({ content: input }, { id: 'test' });
    runner.assert(intent !== undefined, 'Malicious input should not crash');
    runner.assert(intent.confidence < 1.0, 'Malicious input should have reduced confidence');
  }
});

// 19. 大文件路径测试
await runner.runTest('test_very_long_file_path', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const longPath = 'a'.repeat(500);
  const result = await kernel.process({
    content: `读取 ${longPath}`,
    sessionId: 'test'
  });

  runner.assert(result !== undefined, 'Very long file path should be handled');
});

// 20. 资源清理测试
await runner.runTest('test_resource_cleanup', async () => {
  let kernel = new CoreKernel();
  await kernel.initialize();

  const status1 = kernel.getStatus();
  runner.assert(status1.running === true, 'Kernel should be running');

  await kernel.shutdown();

  const status2 = kernel.getStatus();
  runner.assert(status2.running === false, 'Kernel should be stopped after shutdown');
});

// ============================================================================
// 保存测试结果
// ============================================================================

const summary = runner.getSummary();
const resultPath = 'tests/boundary_test_results.json';
await import('fs').then(fs => {
  fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2));
});

// review: removed // review: removed console.log('\n' + '='.repeat(50));
// review: removed // review: removed console.log('边界条件测试结果');
// review: removed // review: removed console.log('='.repeat(50));
// review: removed // review: removed console.log(`总计: ${summary.total}`);
// review: removed // review: removed console.log(`通过: ${summary.passed}`);
// review: removed // review: removed console.log(`失败: ${summary.failed}`);
// review: removed // review: removed console.log(`通过率: ${((summary.passed / summary.total) * 100).toFixed(2)}%`);
// review: removed // review: removed console.log('='.repeat(50));

// 清理 (runner is const, cannot reassign)
// runner = null;
