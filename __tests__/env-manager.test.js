/**
 * 环境变量管理器测试
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { envManager } from '../kernel/config/env-manager.js';

// 保存原始环境变量
let originalEnv;

function setup() {
  originalEnv = { ...process.env };
  // 清除缓存
  envManager.clearCache();
}

function teardown() {
  // 恢复原始环境变量
  process.env = originalEnv;
  // 清除缓存
  envManager.clearCache();
}

test('EnvManager.get should return environment variable value', () => {
  setup();
  try {
    process.env.TEST_VAR = 'test value';
    const result = envManager.get('TEST_VAR');
    assert.strictEqual(result, 'test value');
  } finally {
    teardown();
  }
});

test('EnvManager.get should return default value when environment variable not set', () => {
  setup();
  try {
    delete process.env.TEST_VAR;
    const result = envManager.get('TEST_VAR', 'default value');
    assert.strictEqual(result, 'default value');
  } finally {
    teardown();
  }
});

test('EnvManager.get should apply transformer function', () => {
  setup();
  try {
    process.env.TEST_NUM = '123';
    const result = envManager.get('TEST_NUM', 0, (value) => parseInt(value, 10));
    assert.strictEqual(result, 123);
  } finally {
    teardown();
  }
});

test('EnvManager.get should return default value when transformer fails', () => {
  setup();
  try {
    process.env.TEST_NUM = 'invalid';
    const result = envManager.get('TEST_NUM', 0, (value) => {
      throw new Error('Invalid number');
    });
    assert.strictEqual(result, 0);
  } finally {
    teardown();
  }
});

test('EnvManager.get should cache the result', () => {
  setup();
  try {
    process.env.TEST_VAR = 'initial value';
    const firstResult = envManager.get('TEST_VAR');
    assert.strictEqual(firstResult, 'initial value');

    // Change the environment variable
    process.env.TEST_VAR = 'changed value';
    // Should return cached value
    const secondResult = envManager.get('TEST_VAR');
    assert.strictEqual(secondResult, 'initial value');
  } finally {
    teardown();
  }
});

test('EnvManager.getBoolean should return true for "true"', () => {
  setup();
  try {
    process.env.TEST_BOOL = 'true';
    const result = envManager.getBoolean('TEST_BOOL');
    assert.strictEqual(result, true);
  } finally {
    teardown();
  }
});

test('EnvManager.getBoolean should return true for "1"', () => {
  setup();
  try {
    process.env.TEST_BOOL = '1';
    const result = envManager.getBoolean('TEST_BOOL');
    assert.strictEqual(result, true);
  } finally {
    teardown();
  }
});

test('EnvManager.getBoolean should return true for "yes"', () => {
  setup();
  try {
    process.env.TEST_BOOL = 'yes';
    const result = envManager.getBoolean('TEST_BOOL');
    assert.strictEqual(result, true);
  } finally {
    teardown();
  }
});

test('EnvManager.getBoolean should return false for "false"', () => {
  setup();
  try {
    process.env.TEST_BOOL = 'false';
    const result = envManager.getBoolean('TEST_BOOL');
    assert.strictEqual(result, false);
  } finally {
    teardown();
  }
});

test('EnvManager.getBoolean should return default value when not set', () => {
  setup();
  try {
    delete process.env.TEST_BOOL;
    const result = envManager.getBoolean('TEST_BOOL', true);
    assert.strictEqual(result, true);
  } finally {
    teardown();
  }
});

test('EnvManager.getNumber should return parsed number', () => {
  setup();
  try {
    process.env.TEST_NUM = '123';
    const result = envManager.getNumber('TEST_NUM');
    assert.strictEqual(result, 123);
  } finally {
    teardown();
  }
});

test('EnvManager.getNumber should return default value for invalid number', () => {
  setup();
  try {
    process.env.TEST_NUM = 'invalid';
    const result = envManager.getNumber('TEST_NUM', 456);
    assert.strictEqual(result, 456);
  } finally {
    teardown();
  }
});

test('EnvManager.getNumber should return default value when not set', () => {
  setup();
  try {
    delete process.env.TEST_NUM;
    const result = envManager.getNumber('TEST_NUM', 789);
    assert.strictEqual(result, 789);
  } finally {
    teardown();
  }
});

test('EnvManager.getArray should return parsed array', () => {
  setup();
  try {
    process.env.TEST_ARRAY = 'a,b,c';
    const result = envManager.getArray('TEST_ARRAY');
    assert.deepStrictEqual(result, ['a', 'b', 'c']);
  } finally {
    teardown();
  }
});

test('EnvManager.getArray should return empty array when not set', () => {
  setup();
  try {
    delete process.env.TEST_ARRAY;
    const result = envManager.getArray('TEST_ARRAY');
    assert.deepStrictEqual(result, []);
  } finally {
    teardown();
  }
});

test('EnvManager.getArray should return default value when not set', () => {
  setup();
  try {
    delete process.env.TEST_ARRAY;
    const result = envManager.getArray('TEST_ARRAY', ['x', 'y', 'z']);
    assert.deepStrictEqual(result, ['x', 'y', 'z']);
  } finally {
    teardown();
  }
});

test('EnvManager.require should return environment variable value', () => {
  setup();
  try {
    process.env.REQUIRED_VAR = 'required value';
    const result = envManager.require('REQUIRED_VAR');
    assert.strictEqual(result, 'required value');
  } finally {
    teardown();
  }
});

test('EnvManager.require should throw error when environment variable not set', () => {
  setup();
  try {
    delete process.env.REQUIRED_VAR;
    assert.throws(() => {
      envManager.require('REQUIRED_VAR');
    });
  } finally {
    teardown();
  }
});

test('EnvManager.require should throw custom error message when environment variable not set', () => {
  setup();
  try {
    delete process.env.REQUIRED_VAR;
    assert.throws(() => {
      envManager.require('REQUIRED_VAR', 'Custom error message');
    }, (error) => {
      return error.message === 'Custom error message';
    });
  } finally {
    teardown();
  }
});

test('EnvManager.clearCache should clear the cache', () => {
  setup();
  try {
    process.env.TEST_VAR = 'initial value';
    const firstResult = envManager.get('TEST_VAR');
    assert.strictEqual(firstResult, 'initial value');

    // Change the environment variable
    process.env.TEST_VAR = 'changed value';
    // Should return cached value
    const secondResult = envManager.get('TEST_VAR');
    assert.strictEqual(secondResult, 'initial value');

    // Clear cache
    envManager.clearCache();
    // Should return new value
    const thirdResult = envManager.get('TEST_VAR');
    assert.strictEqual(thirdResult, 'changed value');
  } finally {
    teardown();
  }
});

test('EnvManager.getAll should return all environment variables', () => {
  setup();
  try {
    const result = envManager.getAll();
    assert.strictEqual(typeof result, 'object');
    assert.deepStrictEqual(result, process.env);
  } finally {
    teardown();
  }
});