/**
 * 错误处理器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorHandler } from '../managers/error-handler.js';

describe('ErrorHandler', () => {
  let errorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler({
      maxAttempts: 3,
      delay: 100,
      backoffMultiplier: 2
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const defaultHandler = new ErrorHandler();
      expect(defaultHandler.config.maxAttempts).toBe(3);
      expect(defaultHandler.config.delay).toBe(1000);
      expect(defaultHandler.config.backoffMultiplier).toBe(2);
    });

    it('应该使用自定义配置', () => {
      const customHandler = new ErrorHandler({
        maxAttempts: 5,
        delay: 500,
        backoffMultiplier: 3
      });
      expect(customHandler.config.maxAttempts).toBe(5);
      expect(customHandler.config.delay).toBe(500);
      expect(customHandler.config.backoffMultiplier).toBe(3);
    });
  });

  describe('classifyError', () => {
    it('应该分类网络错误', () => {
      const error = new Error('Network error');
      error.code = 'ENOTFOUND';
      const classification = errorHandler.classifyError(error);
      expect(classification.type).toBe('NetworkError');
      expect(classification.retryable).toBe(true);
    });

    it('应该分类认证错误', () => {
      const error = new Error('Unauthorized');
      error.code = '401';
      const classification = errorHandler.classifyError(error);
      expect(classification.type).toBe('AuthError');
      expect(classification.retryable).toBe(false);
    });

    it('应该分类速率限制错误', () => {
      const error = new Error('Rate limit exceeded');
      error.code = '429';
      const classification = errorHandler.classifyError(error);
      expect(classification.type).toBe('RateLimitError');
      expect(classification.retryable).toBe(true);
    });

    it('应该分类服务器错误', () => {
      const error = new Error('Internal server error');
      error.code = '500';
      const classification = errorHandler.classifyError(error);
      expect(classification.type).toBe('ServerError');
      expect(classification.retryable).toBe(true);
    });

    it('应该分类未知错误', () => {
      const error = new Error('Unknown error');
      const classification = errorHandler.classifyError(error);
      expect(classification.type).toBe('UnknownError');
      expect(classification.retryable).toBe(false);
    });
  });

  describe('retry', () => {
    it('第一次成功时不应该重试', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await errorHandler.retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('应该在失败时重试直到成功', async () => {
      vi.useFakeTimers();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const retryPromise = errorHandler.retry(fn);

      // 第一次尝试
      await vi.advanceTimersByTimeAsync(0);

      // 第二次尝试（延迟 100ms）
      await vi.advanceTimersByTimeAsync(100);

      // 第三次尝试（延迟 200ms）
      await vi.advanceTimersByTimeAsync(200);

      const result = await retryPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('应该在达到最大重试次数后抛出错误', async () => {
      vi.useFakeTimers();
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));

      const retryPromise = errorHandler.retry(fn);

      // 等待所有重试完成
      await vi.advanceTimersByTimeAsync(100); // 第2次
      await vi.advanceTimersByTimeAsync(200); // 第3次

      await expect(retryPromise).rejects.toThrow('always fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('不应该重试不可重试的错误', async () => {
      const authError = new Error('Unauthorized');
      authError.code = '401';
      const fn = vi.fn().mockRejectedValue(authError);

      await expect(errorHandler.retry(fn)).rejects.toThrow('Unauthorized');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('应该使用正确的退避策略', async () => {
      vi.useFakeTimers();
      const delays = [];
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn((callback, delay) => {
        delays.push(delay);
        return originalSetTimeout(callback, delay);
      });

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      await errorHandler.retry(fn);

      expect(delays).toEqual([100, 200]); // 100, 100*2
    });
  });

  describe('getFallbackStrategy', () => {
    it('网络错误应该返回 OFFLINE 策略', () => {
      const error = new Error('Network error');
      error.code = 'ENOTFOUND';
      const strategy = errorHandler.getFallbackStrategy(error);
      expect(strategy).toBe('OFFLINE');
    });

    it('认证错误应该返回 ERROR 策略', () => {
      const error = new Error('Unauthorized');
      error.code = '401';
      const strategy = errorHandler.getFallbackStrategy(error);
      expect(strategy).toBe('ERROR');
    });

    it('速率限制错误应该返回 RETRY 策略', () => {
      const error = new Error('Rate limit exceeded');
      error.code = '429';
      const strategy = errorHandler.getFallbackStrategy(error);
      expect(strategy).toBe('RETRY');
    });

    it('服务器错误应该返回 CACHE 策略', () => {
      const error = new Error('Internal server error');
      error.code = '500';
      const strategy = errorHandler.getFallbackStrategy(error);
      expect(strategy).toBe('CACHE');
    });
  });

  describe('executeWithFallback', () => {
    it('成功时应该返回结果', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await errorHandler.executeWithFallback(fn, fallback);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('失败时应该执行 fallback', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await errorHandler.executeWithFallback(fn, fallback);
      expect(result).toBe('fallback');
      expect(fn).toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    it('fallback 失败时应该抛出错误', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const fallback = vi.fn().mockRejectedValue(new Error('fallback fail'));

      await expect(errorHandler.executeWithFallback(fn, fallback))
        .rejects.toThrow('fallback fail');
    });
  });

  describe('sleep', () => {
    it('应该等待指定时间', async () => {
      vi.useFakeTimers();
      const sleepPromise = errorHandler.sleep(1000);

      await vi.advanceTimersByTimeAsync(1000);

      await expect(sleepPromise).resolves.toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      await errorHandler.retry(fn);

      const stats = errorHandler.getStats();
      expect(stats.totalRetries).toBeGreaterThan(0);
      expect(stats.successfulRetries).toBeGreaterThan(0);
      expect(stats.failedRetries).toBe(0);
    });

    it('应该记录失败重试', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      try {
        await errorHandler.retry(fn);
      } catch (e) {
        // 忽略错误
      }

      const stats = errorHandler.getStats();
      expect(stats.failedRetries).toBeGreaterThan(0);
    });
  });

  describe('resetStats', () => {
    it('应该重置统计信息', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      await errorHandler.retry(fn);
      errorHandler.resetStats();

      const stats = errorHandler.getStats();
      expect(stats.totalRetries).toBe(0);
      expect(stats.successfulRetries).toBe(0);
      expect(stats.failedRetries).toBe(0);
    });
  });
});
