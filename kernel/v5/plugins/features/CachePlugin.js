import { BasePlugin } from '../../core/BasePlugin.js';

export class CachePlugin extends BasePlugin {
  #stores = new Map();
  #defaultStore = 'memory';
  #config = null;
  #cleanupInterval = null;

  get name() {
    return 'cache';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    
    this.#stores.set('memory', new MemoryCacheStore());
    
    const redisConfig = this.#config.get('cache.redis');
    if (redisConfig) {
      try {
        const redisStore = await this.#createRedisStore(redisConfig);
        this.#stores.set('redis', redisStore);
        this.#defaultStore = 'redis';
        this.logger.info('Redis cache store initialized');
      } catch (err) {
        this.logger.warn('Failed to initialize Redis store, falling back to memory:', err.message);
      }
    }

    this.kernel.services.register('cache', () => ({
      get: this.get.bind(this),
      set: this.set.bind(this),
      delete: this.delete.bind(this),
      has: this.has.bind(this),
      clear: this.clear.bind(this),
      remember: this.remember.bind(this),
      tags: this.tags.bind(this),
      store: this.store.bind(this)
    }), { singleton: true, lazy: true });

    this.#startCleanupInterval();
    this.logger.info(`CachePlugin initialized with default store: ${this.#defaultStore}`);
  }

  async #createRedisStore(config) {
    const Redis = await import('ioredis');
    const client = new Redis.default(config);
    return new RedisCacheStore(client);
  }

  #startCleanupInterval() {
    const interval = this.#config.get('cache.cleanupInterval', 60000);
    this.#cleanupInterval = setInterval(() => {
      for (const store of this.#stores.values()) {
        if (typeof store.cleanup === 'function') {
          store.cleanup();
        }
      }
    }, interval);
    
    // Prevent interval from blocking process exit
    if (this.#cleanupInterval.unref) {
      this.#cleanupInterval.unref();
    }
  }

  store(name = null) {
    const storeName = name || this.#defaultStore;
    const store = this.#stores.get(storeName);
    if (!store) {
      throw new Error(`Cache store not found: ${storeName}`);
    }
    return store;
  }

  async get(key, defaultValue = null, storeName = null) {
    const store = this.store(storeName);
    const value = await store.get(key);
    return value !== undefined ? value : defaultValue;
  }

  async set(key, value, ttl = null, storeName = null) {
    const store = this.store(storeName);
    const effectiveTtl = ttl || this.#config.get('cache.defaultTtl', 3600);
    await store.set(key, value, effectiveTtl);
    this.kernel.events.emit('cache:set', { key, ttl: effectiveTtl, store: storeName || this.#defaultStore });
    return this;
  }

  async delete(key, storeName = null) {
    const store = this.store(storeName);
    await store.delete(key);
    this.kernel.events.emit('cache:delete', { key, store: storeName || this.#defaultStore });
    return this;
  }

  async has(key, storeName = null) {
    const store = this.store(storeName);
    return await store.has(key);
  }

  async clear(storeName = null) {
    if (storeName) {
      const store = this.store(storeName);
      await store.clear();
    } else {
      for (const store of this.#stores.values()) {
        await store.clear();
      }
    }
    this.kernel.events.emit('cache:clear', { store: storeName || 'all' });
    return this;
  }

  async remember(key, ttl, callback, storeName = null) {
    const cached = await this.get(key, undefined, storeName);
    if (cached !== undefined) {
      return cached;
    }

    const value = await callback();
    await this.set(key, value, ttl, storeName);
    return value;
  }

  tags(names) {
    const tagNames = Array.isArray(names) ? names : [names];
    return {
      get: async (key) => this.get(`tag:${tagNames.join(',')}:${key}`),
      set: async (key, value, ttl) => this.set(`tag:${tagNames.join(',')}:${key}`, value, ttl),
      delete: async (key) => this.delete(`tag:${tagNames.join(',')}:${key}`),
      flush: async () => {
        // In a real implementation, would track tagged keys
        this.logger.debug(`Flush cache tags: ${tagNames.join(', ')}`);
      }
    };
  }

  async onDestroy() {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
    }
    for (const store of this.#stores.values()) {
      if (typeof store.close === 'function') {
        await store.close();
      }
    }
    this.#stores.clear();
    this.logger.info('CachePlugin destroyed');
  }
}

class MemoryCacheStore {
  #data = new Map();

  async get(key) {
    const item = this.#data.get(key);
    if (!item) return undefined;
    
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.#data.delete(key);
      return undefined;
    }
    
    return item.value;
  }

  async set(key, value, ttl) {
    const expiresAt = ttl ? Date.now() + (ttl * 1000) : null;
    this.#data.set(key, { value, expiresAt });
  }

  async delete(key) {
    this.#data.delete(key);
  }

  async has(key) {
    const item = this.#data.get(key);
    if (!item) return false;
    
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.#data.delete(key);
      return false;
    }
    
    return true;
  }

  async clear() {
    this.#data.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.#data.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.#data.delete(key);
      }
    }
  }
}

class RedisCacheStore {
  #client = null;

  constructor(client) {
    this.#client = client;
  }

  async get(key) {
    const value = await this.#client.get(key);
    return value ? JSON.parse(value) : undefined;
  }

  async set(key, value, ttl) {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.#client.setex(key, ttl, serialized);
    } else {
      await this.#client.set(key, serialized);
    }
  }

  async delete(key) {
    await this.#client.del(key);
  }

  async has(key) {
    const exists = await this.#client.exists(key);
    return exists === 1;
  }

  async clear() {
    await this.#client.flushdb();
  }

  async close() {
    await this.#client.quit();
  }
}
