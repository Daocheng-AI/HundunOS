/**
 * Agent SDK - 表达式沙箱化测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExpressionResult,
  SandboxConfig,
  ExpressionParser,
  ExpressionSandbox,
  TypeValidator,
  createSandboxConfig,
  createExpressionSandbox
} from './expression-sandbox.js';

describe('ExpressionResult', () => {
  it('should create a successful result', () => {
    const result = ExpressionResult.success(42);
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
    expect(result.error).toBeNull();
  });

  it('should create a failed result', () => {
    const result = ExpressionResult.failure('Error occurred');
    
    expect(result.success).toBe(false);
    expect(result.value).toBeNull();
    expect(result.error).toBe('Error occurred');
  });

  it('should serialize to JSON', () => {
    const result = ExpressionResult.success(42, { type: 'number' });
    const json = result.toJSON();
    
    expect(json.success).toBe(true);
    expect(json.value).toBe(42);
    expect(json.metadata.type).toBe('number');
  });
});

describe('SandboxConfig', () => {
  it('should create default config', () => {
    const config = new SandboxConfig();
    
    expect(config.timeout).toBe(5000);
    expect(config.memoryLimit).toBe(64 * 1024 * 1024);
    expect(config.allowConsole).toBe(false);
    expect(config.allowRequire).toBe(false);
  });

  it('should set timeout', () => {
    const config = new SandboxConfig().setTimeout(10000);
    
    expect(config.timeout).toBe(10000);
  });

  it('should set memory limit', () => {
    const config = new SandboxConfig().setMemoryLimit(128 * 1024 * 1024);
    
    expect(config.memoryLimit).toBe(128 * 1024 * 1024);
  });

  it('should allow console', () => {
    const config = new SandboxConfig().allowConsoleLog(true);
    
    expect(config.allowConsole).toBe(true);
  });

  it('should add allowed global', () => {
    const config = new SandboxConfig().addAllowedGlobal('Math');
    
    expect(config.allowedGlobals).toContain('Math');
  });

  it('should add custom context', () => {
    const config = new SandboxConfig().addContext('customVar', 42);
    
    expect(config.customContext.customVar).toBe(42);
  });

  it('should chain methods', () => {
    const config = new SandboxConfig()
      .setTimeout(10000)
      .allowConsoleLog(true)
      .addAllowedGlobal('Math')
      .addContext('test', 'value');
    
    expect(config.timeout).toBe(10000);
    expect(config.allowConsole).toBe(true);
    expect(config.allowedGlobals).toContain('Math');
    expect(config.customContext.test).toBe('value');
  });
});

describe('ExpressionParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ExpressionParser();
  });

  it('should parse variables', () => {
    const expression = 'Hello {{name}}, your age is {{age}}';
    const variables = parser.parseVariables(expression);
    
    expect(variables).toEqual(['name', 'age']);
  });

  it('should parse functions', () => {
    const expression = 'Math.add(1, 2) + String.length("test")';
    const functions = parser.parseFunctions(expression);
    
    // parseFunctions 只返回函数名，不包含对象前缀
    expect(functions).toContain('add');
    expect(functions).toContain('length');
  });

  it('should detect safe expression', () => {
    const expression = 'Math.add(1, 2)';
    const result = parser.isSafe(expression);
    
    expect(result.safe).toBe(true);
  });

  it('should detect dangerous eval', () => {
    const expression = 'eval("malicious code")';
    const result = parser.isSafe(expression);
    
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('dangerous pattern');
  });

  it('should detect dangerous Function', () => {
    const expression = 'Function("return 1")()';
    const result = parser.isSafe(expression);
    
    expect(result.safe).toBe(false);
  });

  it('should detect dangerous require', () => {
    const expression = 'require("fs")';
    const result = parser.isSafe(expression);
    
    expect(result.safe).toBe(false);
  });

  it('should detect dangerous process access', () => {
    const expression = 'process.exit()';
    const result = parser.isSafe(expression);
    
    expect(result.safe).toBe(false);
  });

  it('should preprocess expression', () => {
    const expression = '  {{  name  }}  // comment';
    const processed = parser.preprocess(expression);
    
    expect(processed).toBe('{{ name }}');
  });

  it('should identify template type', () => {
    const expression = 'Hello {{name}}';
    const type = parser.getExpressionType(expression);
    
    expect(type).toBe('template');
  });

  it('should identify function type', () => {
    const expression = 'Math.add(1, 2)';
    const type = parser.getExpressionType(expression);
    
    expect(type).toBe('function');
  });

  it('should identify object type', () => {
    const expression = '{ key: "value" }';
    const type = parser.getExpressionType(expression);
    
    expect(type).toBe('object');
  });

  it('should identify array type', () => {
    const expression = '[1, 2, 3]';
    const type = parser.getExpressionType(expression);
    
    expect(type).toBe('array');
  });

  it('should identify number type', () => {
    const type = parser.getExpressionType('42');
    
    expect(type).toBe('number');
  });

  it('should identify string type', () => {
    const type = parser.getExpressionType('"hello"');
    
    expect(type).toBe('string');
  });

  it('should identify boolean type', () => {
    const type = parser.getExpressionType('true');
    
    expect(type).toBe('boolean');
  });
});

describe('ExpressionSandbox', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = new ExpressionSandbox();
  });

  it('should execute simple expression', async () => {
    const result = await sandbox.execute('1 + 1');
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(2);
  });

  it('should execute expression with context', async () => {
    const result = await sandbox.execute('x + y', { x: 1, y: 2 });
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(3);
  });

  it('should use Math functions', async () => {
    const result = await sandbox.execute('Math.abs(-5)');
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(5);
  });

  it('should use String functions', async () => {
    const result = await sandbox.execute('String.toUpperCase("hello")');
    
    expect(result.success).toBe(true);
    expect(result.value).toBe('HELLO');
  });

  it('should use Array functions', async () => {
    const result = await sandbox.execute('Array.length([1, 2, 3])');
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(3);
  });

  it('should use Logic functions', async () => {
    const result = await sandbox.execute('Logic.if(true, "yes", "no")');
    
    expect(result.success).toBe(true);
    expect(result.value).toBe('yes');
  });

  it('should use Type functions', async () => {
    const result = await sandbox.execute('Type.isString("hello")');
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('should block dangerous expression', async () => {
    const result = await sandbox.execute('eval("1 + 1")');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security violation');
  });

  it('should handle execution error', async () => {
    const result = await sandbox.execute('undefinedVariable');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle timeout', async () => {
    const config = new SandboxConfig().setTimeout(1); // 1ms 超时
    const timeoutSandbox = new ExpressionSandbox(config);
    
    // 使用一个会执行很长时间的递归函数
    const result = await timeoutSandbox.execute('(function() { return new Promise(resolve => setTimeout(() => resolve(1), 100)); })()');
    
    expect(result.success).toBe(false);
    // 兼容 vm2 和 Node.js 内置 vm 两种沙箱实现的不同超时消息格式
    // vm2: "Error: Script execution timed out after Xms"
    // Node.js vm: "Error: Script execution timed out after Xms"
    expect(result.error).toMatch(/timeout|timed out/i);
  }, 10000);

  it('should execute batch expressions', async () => {
    const results = await sandbox.executeBatch([
      '1 + 1',
      '2 + 2',
      '3 + 3'
    ]);
    
    expect(results).toHaveLength(3);
    expect(results[0].value).toBe(2);
    expect(results[1].value).toBe(4);
    expect(results[2].value).toBe(6);
  });

  it('should track execution stats', () => {
    expect(sandbox.getStats().totalExecutions).toBe(0);
    
    // 执行一些表达式
    sandbox.execute('1 + 1');
    sandbox.execute('2 + 2');
    
    expect(sandbox.getStats().totalExecutions).toBe(2);
  });

  it('should reset stats', async () => {
    await sandbox.execute('1 + 1');
    await sandbox.execute('2 + 2');
    
    sandbox.resetStats();
    
    expect(sandbox.getStats().totalExecutions).toBe(0);
    expect(sandbox.getStats().totalErrors).toBe(0);
  });

  it('should use custom context from config', async () => {
    const config = new SandboxConfig().addContext('customVar', 42);
    const customSandbox = new ExpressionSandbox(config);
    
    const result = await customSandbox.execute('customVar * 2');
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(84);
  });
});

describe('TypeValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new TypeValidator();
  });

  it('should validate string', () => {
    expect(validator.validate('hello', 'string')).toBe(true);
    expect(validator.validate(42, 'string')).toBe(false);
  });

  it('should validate number', () => {
    expect(validator.validate(42, 'number')).toBe(true);
    expect(validator.validate('42', 'number')).toBe(false);
    expect(validator.validate(NaN, 'number')).toBe(false);
  });

  it('should validate boolean', () => {
    expect(validator.validate(true, 'boolean')).toBe(true);
    expect(validator.validate(false, 'boolean')).toBe(true);
    expect(validator.validate(1, 'boolean')).toBe(false);
  });

  it('should validate object', () => {
    expect(validator.validate({}, 'object')).toBe(true);
    expect(validator.validate([], 'object')).toBe(false);
    expect(validator.validate(null, 'object')).toBe(false);
  });

  it('should validate array', () => {
    expect(validator.validate([], 'array')).toBe(true);
    expect(validator.validate({}, 'array')).toBe(false);
  });

  it('should validate null', () => {
    expect(validator.validate(null, 'null')).toBe(true);
    expect(validator.validate(undefined, 'null')).toBe(false);
  });

  it('should validate undefined', () => {
    expect(validator.validate(undefined, 'undefined')).toBe(true);
    expect(validator.validate(null, 'undefined')).toBe(false);
  });

  it('should validate any', () => {
    expect(validator.validate('anything', 'any')).toBe(true);
  });

  it('should coerce to string', () => {
    expect(validator.coerce(42, 'string')).toBe('42');
    expect(validator.coerce(true, 'string')).toBe('true');
  });

  it('should coerce to number', () => {
    expect(validator.coerce('42', 'number')).toBe(42);
    expect(validator.coerce('3.14', 'number')).toBe(3.14);
  });

  it('should coerce to boolean', () => {
    expect(validator.coerce(1, 'boolean')).toBe(true);
    expect(validator.coerce(0, 'boolean')).toBe(false);
    expect(validator.coerce('true', 'boolean')).toBe(true);
  });

  it('should coerce to object', () => {
    const result = validator.coerce('{"key": "value"}', 'object');
    expect(result).toEqual({ key: 'value' });
  });

  it('should get type', () => {
    expect(validator.getType('hello')).toBe('string');
    expect(validator.getType(42)).toBe('number');
    expect(validator.getType(true)).toBe('boolean');
    expect(validator.getType({})).toBe('object');
    expect(validator.getType([])).toBe('array');
    expect(validator.getType(null)).toBe('null');
  });
});

describe('Convenience Functions', () => {
  it('should create sandbox config', () => {
    const config = createSandboxConfig();
    
    expect(config).toBeInstanceOf(SandboxConfig);
  });

  it('should create expression sandbox', () => {
    const sandbox = createExpressionSandbox(new SandboxConfig());
    
    expect(sandbox).toBeInstanceOf(ExpressionSandbox);
  });
});

describe('Edge Cases', () => {
  it('should handle empty expression', async () => {
    const sandbox = new ExpressionSandbox();
    const result = await sandbox.execute('');
    
    // 空表达式可能返回 undefined，这是正常的
    expect(result.success).toBe(true);
  });

  it('should handle null context', async () => {
    const sandbox = new ExpressionSandbox();
    const result = await sandbox.execute('1 + 1', null);
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(2);
  });

  it('should handle undefined context', async () => {
    const sandbox = new ExpressionSandbox();
    const result = await sandbox.execute('1 + 1', undefined);
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(2);
  });

  it('should handle complex nested objects', async () => {
    const sandbox = new ExpressionSandbox();
    const context = {
      user: {
        name: 'John',
        age: 30,
        address: {
          city: 'New York',
          country: 'USA'
        }
      }
    };
    
    // 使用完整的对象路径
    const result = await sandbox.execute('context.user.name', { context });
    
    expect(result.success).toBe(true);
    expect(result.value).toBe('John');
  });

  it('should handle array operations', async () => {
    const sandbox = new ExpressionSandbox();
    const context = {
      items: [1, 2, 3, 4, 5]
    };
    
    // 使用完整的上下文路径
    const result = await sandbox.execute('context.items.length', { context });
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(5);
  });
});
