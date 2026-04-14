/**
 * 错误管理器测试
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { errorManager, HundunOSError, ErrorType } from '../kernel/error-manager.js';

test('ErrorManager.createError should create a HundunOSError instance', () => {
  const error = errorManager.createError('Test error', ErrorType.BUSINESS, 'TEST_ERROR', { details: 'Test details' });
  assert.ok(error instanceof HundunOSError);
  assert.strictEqual(error.message, 'Test error');
  assert.strictEqual(error.type, ErrorType.BUSINESS);
  assert.strictEqual(error.code, 'TEST_ERROR');
  assert.deepStrictEqual(error.details, { details: 'Test details' });
  assert.ok(error.timestamp);
});

test('ErrorManager.createError should use default values when not provided', () => {
  const error = errorManager.createError('Test error');
  assert.ok(error instanceof HundunOSError);
  assert.strictEqual(error.message, 'Test error');
  assert.strictEqual(error.type, ErrorType.UNKNOWN);
  assert.strictEqual(error.code, null);
  assert.strictEqual(error.details, null);
  assert.ok(error.timestamp);
});

test('ErrorManager.handleError should handle HundunOSError', () => {
  const error = errorManager.createError('Test error', ErrorType.BUSINESS, 'TEST_ERROR');
  const result = errorManager.handleError(error);
  assert.deepStrictEqual(result, {
    success: false,
    error: {
      message: 'Test error',
      type: ErrorType.BUSINESS,
      code: 'TEST_ERROR',
      details: null,
      timestamp: error.timestamp
    }
  });
});

test('ErrorManager.handleError should handle regular Error', () => {
  const error = new Error('Regular error');
  const result = errorManager.handleError(error);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error.message, 'Regular error');
  assert.strictEqual(result.error.type, ErrorType.UNKNOWN);
  assert.strictEqual(result.error.code, null);
  assert.ok(result.error.details);
  assert.ok(result.error.timestamp);
});

test('ErrorManager.handleAsyncError should handle successful async operation', async () => {
  const fn = async () => 'Success';
  const result = await errorManager.handleAsyncError(fn);
  assert.strictEqual(result, 'Success');
});

test('ErrorManager.handleAsyncError should handle async error', async () => {
  const error = new Error('Async error');
  const fn = async () => {
    throw error;
  };
  const result = await errorManager.handleAsyncError(fn);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error.message, 'Async error');
  assert.strictEqual(result.error.type, ErrorType.UNKNOWN);
  assert.strictEqual(result.error.code, null);
  assert.ok(result.error.details);
  assert.ok(result.error.timestamp);
});

test('ErrorManager.validateParam should not throw error when validation passes', () => {
  assert.doesNotThrow(() => {
    errorManager.validateParam('test', 'param', (value) => value.length > 0);
  });
});

test('ErrorManager.validateParam should throw error when validation fails', () => {
  assert.throws(() => {
    errorManager.validateParam('', 'param', (value) => value.length > 0, 'Param is invalid');
  }, (error) => {
    return error.message === 'Param is invalid';
  });
});

test('ErrorManager.validateParam should throw error with default message when validation fails', () => {
  assert.throws(() => {
    errorManager.validateParam('', 'param', (value) => value.length > 0);
  }, (error) => {
    return error.message === 'param is invalid';
  });
});

test('ErrorManager.requireParam should not throw error when param is provided', () => {
  assert.doesNotThrow(() => {
    errorManager.requireParam('value', 'param');
  });
});

test('ErrorManager.requireParam should throw error when param is undefined', () => {
  assert.throws(() => {
    errorManager.requireParam(undefined, 'param');
  }, (error) => {
    return error.message === 'param is required';
  });
});

test('ErrorManager.requireParam should throw error when param is null', () => {
  assert.throws(() => {
    errorManager.requireParam(null, 'param');
  }, (error) => {
    return error.message === 'param is required';
  });
});

test('HundunOSError.toResponse should convert error to response object', () => {
  const error = new HundunOSError('Test error', ErrorType.BUSINESS, 'TEST_ERROR', { details: 'Test details' });
  const response = error.toResponse();
  assert.deepStrictEqual(response, {
    success: false,
    error: {
      message: 'Test error',
      type: ErrorType.BUSINESS,
      code: 'TEST_ERROR',
      details: { details: 'Test details' },
      timestamp: error.timestamp
    }
  });
});