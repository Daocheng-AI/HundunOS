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
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password || null,
      db: config.db || 0,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryStrategy: config.retryStrategy || (times) => Math.min(times * 50, 2000),
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    };
    this.pool = null;
  }

  /**
   * 初始化连接池
   */
  async initialize() {
    const { createClient } = await import('redis');
    
    this.pool = createClient({
      socket: {
        host: this.config.host,
        port: this.config.port,
      },
      password: this.config.password,
      database: this.config.db,
    });

    await this.pool.connect();
    console.log('[RedisPool] Connected');
  }

  /**
   * 获取客户端
   */
  getClient() {
    return this.pool;
  }

  /**
   * 关闭连接池
   */
  async close() {
    if (this.pool) {
      await this.pool.quit();
      console.log('[RedisPool] Closed');
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
  }

  /**
   * 初始化连接池
   */
  async initialize() {
    this.pool = new Pool(this.config);
    
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('[PostgresPool] Connected');
    } catch (e) {
      console.error('[PostgresPool] Connection failed:', e.message);
      throw e;
    }
  }

  /**
   * 获取客户端
   */
  async getClient() {
    return await this.pool.connect();
  }

  /**
   * 执行查询
   */
  async query(text, params) {
    const client = await this.getClient();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * 关闭连接池
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('[PostgresPool] Closed');
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
      const result = await this.query('SELECT count(*) as total, count(*) FILTER (state != \'idle\') as active FROM pg_stat_activity');
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
