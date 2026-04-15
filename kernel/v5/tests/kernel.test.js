/**
 * HundunOS v5 Kernel Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../core/Kernel.js';
import { LoggerPlugin } from '../plugins/core/LoggerPlugin.js';
import { SecurityPlugin } from '../plugins/core/SecurityPlugin.js';
import { ConfigPlugin } from '../plugins/core/ConfigPlugin.js';
import { EventsPlugin } from '../plugins/core/EventsPlugin.js';
import { CachePlugin } from '../plugins/features/CachePlugin.js';

describe('Kernel', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel({
      plugins: {
        enabled: ['logger', 'config', 'events', 'security', 'cache']
      }
    });
  });

  afterEach(async () => {
    if (kernel) {
      await kernel.shutdown();
    }
  });

  it('should create kernel instance', () => {
    expect(kernel).toBeDefined();
    expect(kernel.config).toBeDefined();
    expect(kernel.events).toBeDefined();
    expect(kernel.services).toBeDefined();
    expect(kernel.plugins).toBeDefined();
  });

  it('should initialize successfully', async () => {
    await kernel.initialize();
    expect(kernel.state.current).toBe('initialized');
  });

  it('should register and retrieve services', async () => {
    kernel.services.register('test.service', () => ({ value: 42 }), { singleton: true });
    await kernel.initialize();
    
    const service = kernel.get('test.service');
    expect(service).toEqual({ value: 42 });
  });

  it('should emit and listen to events', async () => {
    const handler = vi.fn();
    kernel.events.on('test:event', handler);
    
    await kernel.events.emit('test:event', { data: 'test' });
    
    expect(handler).toHaveBeenCalledWith({ data: 'test' });
  });

  it('should handle plugin lifecycle', async () => {
    const initSpy = vi.fn();
    
    class TestPlugin extends (await import('../core/BasePlugin.js')).BasePlugin {
      get name() { return 'test'; }
      async onInit() { initSpy(); }
    }
    
    await kernel.plugins.register(TestPlugin);
    await kernel.initialize();
    
    expect(initSpy).toHaveBeenCalled();
  });
});

describe('SecurityPlugin', () => {
  let kernel;

  beforeEach(async () => {
    kernel = new Kernel();
    await kernel.plugins.register(LoggerPlugin);
    await kernel.plugins.register(SecurityPlugin);
    await kernel.initialize();
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  it('should sanitize strings', () => {
    const security = kernel.get('security.sanitize');
    const result = security.sanitize('<script>alert("xss")</script>', 'string');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('should validate CORS origins', () => {
    const cors = kernel.get('security.cors');
    kernel.config.set('security.cors.origins', ['https://example.com']);
    
    expect(cors.validateOrigin('https://example.com')).toBe(true);
    expect(cors.validateOrigin('https://evil.com')).toBe(false);
  });

  it('should rate limit requests', () => {
    const rateLimit = kernel.get('security.rateLimit');
    
    const result1 = rateLimit.check('test-key', { maxRequests: 2, windowMs: 60000 });
    expect(result1.allowed).toBe(true);
    
    rateLimit.check('test-key', { maxRequests: 2, windowMs: 60000 });
    const result3 = rateLimit.check('test-key', { maxRequests: 2, windowMs: 60000 });
    expect(result3.allowed).toBe(false);
  });
});

describe('CachePlugin', () => {
  let kernel;
  let cache;

  beforeEach(async () => {
    kernel = new Kernel();
    await kernel.plugins.register(LoggerPlugin);
    await kernel.plugins.register(CachePlugin);
    await kernel.initialize();
    cache = kernel.get('cache');
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  it('should store and retrieve values', async () => {
    await cache.set('key1', 'value1');
    const value = await cache.get('key1');
    expect(value).toBe('value1');
  });

  it('should return default for missing keys', async () => {
    const value = await cache.get('missing', 'default');
    expect(value).toBe('default');
  });

  it('should support remember pattern', async () => {
    const factory = vi.fn().mockResolvedValue('computed');
    
    const value1 = await cache.remember('remember-key', 60, factory);
    expect(value1).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1);
    
    const value2 = await cache.remember('remember-key', 60, factory);
    expect(value2).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should delete values', async () => {
    await cache.set('delete-key', 'value');
    await cache.delete('delete-key');
    const value = await cache.get('delete-key');
    expect(value).toBeNull();
  });
});

describe('EventBus', () => {
  let eventBus;

  beforeEach(async () => {
    const { EventBus } = await import('../core/EventBus.js');
    eventBus = new EventBus();
  });

  it('should support basic pub/sub', async () => {
    const handler = vi.fn();
    eventBus.on('test', handler);
    
    await eventBus.emit('test', { data: 123 });
    expect(handler).toHaveBeenCalledWith({ data: 123 });
  });

  it('should support wildcards', async () => {
    const handler = vi.fn();
    eventBus.on('user.*', handler);
    
    await eventBus.emit('user:login', { id: 1 });
    await eventBus.emit('user:logout', { id: 2 });
    
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should support once listeners', async () => {
    const handler = vi.fn();
    eventBus.once('test', handler);
    
    await eventBus.emit('test', {});
    await eventBus.emit('test', {});
    
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support middleware', async () => {
    const order = [];
    
    eventBus.use(async (event, next) => {
      order.push('before');
      await next();
      order.push('after');
    });
    
    eventBus.on('test', () => order.push('handler'));
    await eventBus.emit('test', {});
    
    expect(order).toEqual(['before', 'handler', 'after']);
  });
});

describe('ServiceRegistry', () => {
  let registry;

  beforeEach(async () => {
    const { ServiceRegistry } = await import('../core/ServiceRegistry.js');
    registry = new ServiceRegistry();
  });

  it('should register and retrieve services', async () => {
    registry.register('test', () => ({ value: 42 }));
    const service = await registry.get('test');
    expect(service.value).toBe(42);
  });

  it('should support singletons', async () => {
    let counter = 0;
    registry.register('counter', () => ({ id: ++counter }), { singleton: true });
    
    const s1 = await registry.get('counter');
    const s2 = await registry.get('counter');
    
    expect(s1.id).toBe(1);
    expect(s2.id).toBe(1); // Same instance
  });

  it('should detect circular dependencies', async () => {
    registry.register('a', async (r) => ({ b: await r.get('b') }));
    registry.register('b', async (r) => ({ a: await r.get('a') }));
    
    await expect(registry.get('a')).rejects.toThrow('Circular dependency');
  });

  it('should support lazy loading', async () => {
    const factory = vi.fn().mockReturnValue({ value: 1 });
    registry.register('lazy', factory, { lazy: true });
    
    expect(factory).not.toHaveBeenCalled();
    
    await registry.get('lazy');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
