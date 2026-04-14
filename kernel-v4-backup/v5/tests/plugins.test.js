/**
 * HundunOS v5 Plugin Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kernel } from '../core/Kernel.js';
import { BasePlugin } from '../core/BasePlugin.js';
import { LoggerPlugin } from '../plugins/core/LoggerPlugin.js';
import { SecurityPlugin } from '../plugins/core/SecurityPlugin.js';
import { CachePlugin } from '../plugins/features/CachePlugin.js';
import { DatabasePlugin } from '../plugins/features/DatabasePlugin.js';

describe('BasePlugin', () => {
  it('should require name getter implementation', () => {
    class TestPlugin extends BasePlugin {
      async onInit() {}
    }

    const plugin = new TestPlugin();
    expect(() => plugin.name).toThrow('Plugin must define name getter');
  });

  it('should have default version', () => {
    class TestPlugin extends BasePlugin {
      get name() { return 'test'; }
      async onInit() {}
    }

    const plugin = new TestPlugin();
    expect(plugin.version).toBe('1.0.0');
  });

  it('should track initialization state', async () => {
    class TestPlugin extends BasePlugin {
      get name() { return 'test'; }
      async onInit() {}
    }

    const kernel = new Kernel();
    const plugin = new TestPlugin();

    expect(plugin._initialized).toBe(false);
    await plugin.init(kernel);
    expect(plugin._initialized).toBe(true);
  });
});

describe('LoggerPlugin', () => {
  let kernel;

  beforeEach(async () => {
    kernel = new Kernel();
    await kernel.plugins.register(LoggerPlugin);
    await kernel.initialize();
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  it('should provide logger service', () => {
    const logger = kernel.get('logger');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should create child loggers', () => {
    const logger = kernel.get('logger');
    const child = logger.child('test-module');
    expect(child).toBeDefined();
    expect(child.module).toBe('test-module');
  });

  it('should respect log level', () => {
    const logger = kernel.get('logger');
    const debugSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    logger.level = 'info';
    logger.debug('debug message');
    expect(debugSpy).not.toHaveBeenCalled();
    
    logger.info('info message');
    expect(debugSpy).toHaveBeenCalled();
    
    debugSpy.mockRestore();
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

  it('should sanitize HTML', () => {
    const security = kernel.get('security.sanitize');
    const dirty = '<script>alert("xss")</script>Hello';
    const clean = security.sanitize(dirty, 'html');
    expect(clean).not.toContain('<script>');
    expect(clean).toContain('&lt;script&gt;');
  });

  it('should sanitize commands', () => {
    const security = kernel.get('security.sanitize');
    const dangerous = 'file; rm -rf /';
    const safe = security.sanitize(dangerous, 'command');
    expect(safe).not.toContain(';');
    expect(safe).not.toContain('rm');
  });

  it('should validate CORS origins', () => {
    const cors = kernel.get('security.cors');
    kernel.config.set('security.cors.origins', ['https://example.com']);
    
    expect(cors.validateOrigin('https://example.com')).toBe(true);
    expect(cors.validateOrigin('https://evil.com')).toBe(false);
  });

  it('should rate limit correctly', () => {
    const rateLimit = kernel.get('security.rateLimit');
    
    // First 3 requests should be allowed
    for (let i = 0; i < 3; i++) {
      const result = rateLimit.check('key1', { maxRequests: 3, windowMs: 60000 });
      expect(result.allowed).toBe(true);
    }
    
    // 4th request should be blocked
    const blocked = rateLimit.check('key1', { maxRequests: 3, windowMs: 60000 });
    expect(blocked.allowed).toBe(false);
  });

  it('should hash and verify passwords', () => {
    const security = kernel.plugins.get('security');
    const password = 'mysecretpassword';
    
    const { hash, salt } = security.hashPassword(password);
    expect(hash).toBeDefined();
    expect(salt).toBeDefined();
    
    const isValid = security.verifyPassword(password, hash, salt);
    expect(isValid).toBe(true);
    
    const isInvalid = security.verifyPassword('wrongpassword', hash, salt);
    expect(isInvalid).toBe(false);
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

  it('should check existence', async () => {
    await cache.set('exists-key', 'value');
    expect(await cache.has('exists-key')).toBe(true);
    expect(await cache.has('not-exists')).toBe(false);
  });
});

describe('DatabasePlugin', () => {
  let kernel;
  let db;

  beforeEach(async () => {
    kernel = new Kernel({
      database: { type: 'sqlite', path: ':memory:' }
    });
    await kernel.plugins.register(LoggerPlugin);
    await kernel.plugins.register(DatabasePlugin);
    await kernel.initialize();
    db = kernel.get('db');
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  it('should execute queries', async () => {
    await db.query('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await db.query('INSERT INTO test (name) VALUES (?)', ['Alice']);
    
    const results = await db.query('SELECT * FROM test');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Alice');
  });

  it('should support transactions', async () => {
    await db.query('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
    await db.query('INSERT INTO accounts (balance) VALUES (100), (200)');

    await db.transaction(async (trx) => {
      await trx.query('UPDATE accounts SET balance = balance - 50 WHERE id = 1');
      await trx.query('UPDATE accounts SET balance = balance + 50 WHERE id = 2');
    });

    const results = await db.query('SELECT * FROM accounts ORDER BY id');
    expect(results[0].balance).toBe(50);
    expect(results[1].balance).toBe(250);
  });

  it('should rollback failed transactions', async () => {
    await db.query('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
    await db.query('INSERT INTO accounts (balance) VALUES (100)');

    try {
      await db.transaction(async (trx) => {
        await trx.query('UPDATE accounts SET balance = 50 WHERE id = 1');
        throw new Error('Simulated error');
      });
    } catch (err) {
      // Expected
    }

    const results = await db.query('SELECT * FROM accounts');
    expect(results[0].balance).toBe(100); // Should be unchanged
  });

  it('should pass health check', async () => {
    const health = await db.healthCheck();
    expect(health.healthy).toBe(true);
  });
});

describe('Plugin Dependencies', () => {
  it('should resolve dependencies in correct order', async () => {
    const kernel = new Kernel();
    const initOrder = [];

    class PluginA extends BasePlugin {
      get name() { return 'pluginA'; }
      get dependencies() { return []; }
      async onInit() { initOrder.push('A'); }
    }

    class PluginB extends BasePlugin {
      get name() { return 'pluginB'; }
      get dependencies() { return ['pluginA']; }
      async onInit() { initOrder.push('B'); }
    }

    class PluginC extends BasePlugin {
      get name() { return 'pluginC'; }
      get dependencies() { return ['pluginB']; }
      async onInit() { initOrder.push('C'); }
    }

    await kernel.plugins.register(PluginA);
    await kernel.plugins.register(PluginB);
    await kernel.plugins.register(PluginC);
    await kernel.initialize();

    expect(initOrder).toEqual(['A', 'B', 'C']);
    await kernel.shutdown();
  });

  it('should throw on missing dependencies', async () => {
    const kernel = new Kernel();

    class PluginWithMissingDep extends BasePlugin {
      get name() { return 'pluginX'; }
      get dependencies() { return ['nonexistent']; }
      async onInit() {}
    }

    await kernel.plugins.register(PluginWithMissingDep);
    await expect(kernel.initialize()).rejects.toThrow('Missing dependencies');
  });

  it('should detect circular dependencies', async () => {
    const kernel = new Kernel();

    class PluginA extends BasePlugin {
      get name() { return 'pluginA'; }
      get dependencies() { return ['pluginB']; }
      async onInit() {}
    }

    class PluginB extends BasePlugin {
      get name() { return 'pluginB'; }
      get dependencies() { return ['pluginA']; }
      async onInit() {}
    }

    await kernel.plugins.register(PluginA);
    await kernel.plugins.register(PluginB);
    await expect(kernel.initialize()).rejects.toThrow('Circular dependency');
  });
});
