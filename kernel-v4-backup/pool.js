/**
 * HundunOS v4.3 - 连接池管理器
 * 实现 Redis 连接池、PostgreSQL 连接池
 */

import { Pool } from 'pg';

/**
 * Redis 连接池管理器
 */
export class RedisPoolManager {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password || null,
      db: config.db || 0,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryStrategy: config.retryStrategy || ((times) => Math.min(times * 50, 2000)),
      enableReadyCheck: true,
    };
    this.pool = null;
    this.degraded = false;
  }

  /**
   * 初始化连接池
   */
  async initialize() {
    if (!this.enabled) {
      this.degraded = true;
      return;
    }
    try {
      const { createClient } = await import('redis');
      
      this.pool = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
        },
        password: this.config.password,
        database: this.config.db,
      });

      this.pool.on('error', (err) => {
        if (!this.degraded) {
          console.warn('[RedisPool] Connection error, entering degraded mode:', err.message);
          this.degraded = true;
        }
      });

      await this.pool.connect();
      this.degraded = false;
      // console.log('[RedisPool] Connected');
    } catch (e) {
      console.warn('[RedisPool] Connection failed, entering degraded mode:', e.message);
      this.degraded = true;
      this.pool = null;
    }
  }

  /**
   * 获取客户端
   */
  getClient() {
    if (this.degraded || !this.pool) {
      return null;
    }
    return this.pool;
  }

  /**
   * 检查是否降级运行
   */
  isDegraded() {
    return this.degraded;
  }

  /**
   * 关闭连接池
   */
  async close() {
    if (this.pool) {
      await this.pool.quit();
      // console.log('[RedisPool] Closed');
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this.pool.ping();
      return { healthy: true };
    } catch (e) {
      return { healthy: false, error: e.message };
    }
  }
}

/**
 * PostgreSQL 连接池管理器
 */
export class PostgresPoolManager {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 5432,
      database: config.database || 'hundunos',
      user: config.user || 'hundunos',
      password: config.password || '',
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    };
    this.pool = null;
    this.degraded = false;
  }

  /**
   * 初始化连接池
   */
  async initialize() {
    if (!this.enabled) {
      this.degraded = true;
      return;
    }
    try {
      this.pool = new Pool(this.config);
      
      this.pool.on('error', (err) => {
        if (!this.degraded) {
          console.warn('[PostgresPool] Connection error, entering degraded mode:', err.message);
          this.degraded = true;
        }
      });

      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.degraded = false;
      // console.log('[PostgresPool] Connected');
    } catch (e) {
      console.warn('[PostgresPool] Connection failed, entering degraded mode:', e.message);
      this.degraded = true;
      this.pool = null;
    }
  }

  /**
   * 获取客户端
   */
  async getClient() {
    if (this.degraded || !this.pool) {
      return null;
    }
    return await this.pool.connect();
  }

  /**
   * 执行查询
   */
  async query(text, params) {
    if (this.degraded || !this.pool) {
      return { rows: [], degraded: true };
    }
    const client = await this.getClient();
    if (!client) {
      return { rows: [], degraded: true };
    }
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * 检查是否降级运行
   */
  isDegraded() {
    return this.degraded;
  }

  /**
   * 关闭连接池
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      // console.log('[PostgresPool] Closed');
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1');
      return { healthy: result.rows.length > 0 };
    } catch (e) {
      return { healthy: false, error: e.message };
    }
  }

  /**
   * 获取统计
   */
  async getStats() {
    try {
      const result = await this.query("SELECT count(*) as total, count(*) FILTER (state != 'idle') as active FROM pg_stat_activity");
      return {
        total: result.rows[0].total,
        active: result.rows[0].active,
        max: this.config.max,
      };
    } catch (e) {
      console.error('[PostgresPool] Get stats failed:', e.message);
      return null;
    }
  }
}

export default { RedisPoolManager, PostgresPoolManager };
