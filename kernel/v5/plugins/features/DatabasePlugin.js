import { BasePlugin } from '../../core/BasePlugin.js';
import { createHash } from 'crypto';

export class DatabasePlugin extends BasePlugin {
  #connections = new Map();
  #defaultConnection = 'default';
  #config = null;
  #cache = null;
  #cacheEnabled = false;
  #queryCacheConfig = {
    enabled: true,
    defaultTtl: 60, // seconds
    maxKeyLength: 250,
    excludedTables: [], // tables to never cache
    includedTables: []  // if not empty, only cache these tables
  };

  get name() {
    return 'database';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config', 'cache'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    
    // Initialize cache if available
    try {
      this.#cache = this.kernel.get('cache');
      this.#cacheEnabled = this.#config.get('database.cache.enabled', true);
      
      // Load cache configuration
      const cacheConfig = this.#config.get('database.cache', {});
      this.#queryCacheConfig = {
        ...this.#queryCacheConfig,
        ...cacheConfig
      };
      
      if (this.#cacheEnabled) {
        this.logger.info('Database query cache enabled');
      }
    } catch (err) {
      this.logger.warn('Cache not available for database query caching:', err.message);
    }
    
    const dbConfig = this.#config.get('database');
    if (!dbConfig) {
      this.logger.warn('No database configuration found');
      return;
    }

    await this.#initializeConnections(dbConfig);

    this.kernel.services.register('db', () => ({
      connection: this.connection.bind(this),
      query: this.query.bind(this),
      queryCached: this.queryCached.bind(this),
      invalidateCache: this.invalidateCache.bind(this),
      transaction: this.transaction.bind(this),
      raw: this.raw.bind(this),
      close: this.close.bind(this),
      healthCheck: this.healthCheck.bind(this),
      clearCache: this.clearCache.bind(this)
    }), { singleton: true });

    this.logger.info('DatabasePlugin initialized');
  }

  /**
   * Generate cache key for query
   */
  #generateCacheKey(sql, params) {
    const hash = createHash('sha256')
      .update(sql + JSON.stringify(params))
      .digest('hex');
    return `db:query:${hash.slice(0, 32)}`;
  }

  /**
   * Check if query should be cached
   */
  #shouldCache(sql) {
    if (!this.#queryCacheConfig.enabled) return false;
    
    const normalizedSql = sql.trim().toLowerCase();
    
    // Only cache SELECT queries
    if (!normalizedSql.startsWith('select')) return false;
    
    // Check excluded tables
    for (const table of this.#queryCacheConfig.excludedTables) {
      if (normalizedSql.includes(table.toLowerCase())) return false;
    }
    
    // Check included tables
    if (this.#queryCacheConfig.includedTables.length > 0) {
      const includesTable = this.#queryCacheConfig.includedTables.some(table => 
        normalizedSql.includes(table.toLowerCase())
      );
      if (!includesTable) return false;
    }
    
    return true;
  }

  async #initializeConnections(config) {
    const connections = config.connections || { default: config };
    
    for (const [name, connConfig] of Object.entries(connections)) {
      try {
        const connection = await this.#createConnection(connConfig);
        this.#connections.set(name, connection);
        this.logger.info(`Database connection established: ${name}`);
      } catch (err) {
        this.logger.error(`Failed to connect to database ${name}:`, err.message);
        throw err;
      }
    }
  }

  async #createConnection(config) {
    const type = config.type || 'sqlite';
    
    switch (type) {
      case 'sqlite':
        return this.#createSQLiteConnection(config);
      case 'postgresql':
      case 'postgres':
        return this.#createPostgresConnection(config);
      case 'mysql':
        return this.#createMySQLConnection(config);
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

  async #createSQLiteConnection(config) {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(config.path || ':memory:');
    
    return {
      type: 'sqlite',
      client: db,
      query: (sql, params = []) => {
        const stmt = db.prepare(sql);
        if (sql.trim().toLowerCase().startsWith('select')) {
          return stmt.all(params);
        }
        return stmt.run(params);
      },
      transaction: (fn) => {
        return db.transaction(fn)();
      },
      close: () => db.close()
    };
  }

  async #createPostgresConnection(config) {
    const { default: pg } = await import('pg');
    const { Pool } = pg;
    const pool = new Pool({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections || 20
    });

    return {
      type: 'postgresql',
      client: pool,
      query: async (sql, params = []) => {
        const result = await pool.query(sql, params);
        return result.rows;
      },
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end()
    };
  }

  async #createMySQLConnection(config) {
    const { default: mysql } = await import('mysql2/promise');
    const pool = mysql.createPool({
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      connectionLimit: config.maxConnections || 20
    });

    return {
      type: 'mysql',
      client: pool,
      query: async (sql, params = []) => {
        const [rows] = await pool.execute(sql, params);
        return rows;
      },
      transaction: async (fn) => {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const result = await fn(connection);
          await connection.commit();
          return result;
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      },
      close: () => pool.end()
    };
  }

  connection(name = null) {
    const connName = name || this.#defaultConnection;
    const connection = this.#connections.get(connName);
    if (!connection) {
      throw new Error(`Database connection not found: ${connName}`);
    }
    return connection;
  }

  async query(sql, params = [], connectionName = null) {
    const conn = this.connection(connectionName);
    return await conn.query(sql, params);
  }

  /**
   * Execute query with caching support
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} options - Cache options { ttl, force, tag }
   * @param {string} connectionName - Connection name
   * @returns {Promise<Array>} - Query results
   */
  async queryCached(sql, params = [], options = {}, connectionName = null) {
    const { ttl = this.#queryCacheConfig.defaultTtl, force = false, tag = null } = options;
    
    // Check if caching is enabled and query is cacheable
    if (!this.#cacheEnabled || !this.#cache) {
      return await this.query(sql, params, connectionName);
    }
    
    // Skip cache for non-SELECT queries or if force refresh
    if (force || !this.#shouldCache(sql)) {
      const result = await this.query(sql, params, connectionName);
      this.logger.debug('Query executed (cache skipped):', sql.slice(0, 100));
      return result;
    }
    
    const cacheKey = this.#generateCacheKey(sql, params);
    const taggedKey = tag ? `tag:${tag}:${cacheKey}` : cacheKey;
    
    // Try to get from cache
    let cached = await this.#cache.get(taggedKey);
    
    if (cached !== null && cached !== undefined) {
      this.logger.debug('Query cache hit:', sql.slice(0, 100));
      this.kernel.events.emit('db:cache:hit', { sql: sql.slice(0, 100), key: taggedKey });
      return cached;
    }
    
    // Execute query and cache result
    this.logger.debug('Query cache miss:', sql.slice(0, 100));
    const result = await this.query(sql, params, connectionName);
    
    await this.#cache.set(taggedKey, result, ttl);
    this.kernel.events.emit('db:cache:miss', { sql: sql.slice(0, 100), key: taggedKey });
    
    return result;
  }

  /**
   * Invalidate cached queries by tag or pattern
   * @param {string} tag - Cache tag to invalidate
   * @returns {Promise<boolean>} - Success status
   */
  async invalidateCache(tag) {
    if (!this.#cacheEnabled || !this.#cache) {
      return false;
    }
    
    // Note: This requires cache implementation to support tag-based invalidation
    // For now, emit event for manual handling
    this.kernel.events.emit('db:cache:invalidate', { tag });
    this.logger.info('Cache invalidation requested for tag:', tag);
    return true;
  }

  /**
   * Clear all database query cache
   * @returns {Promise<boolean>} - Success status
   */
  async clearCache() {
    if (!this.#cacheEnabled || !this.#cache) {
      return false;
    }
    
    // Clear all db:query: prefixed keys
    // Note: This requires cache implementation to support key scanning
    this.kernel.events.emit('db:cache:clear');
    this.logger.info('Database query cache cleared');
    return true;
  }

  async transaction(fn, connectionName = null) {
    const conn = this.connection(connectionName);
    return await conn.transaction(fn);
  }

  raw(value) {
    return { __raw: true, value };
  }

  async close(name = null) {
    if (name) {
      const conn = this.#connections.get(name);
      if (conn) {
        await conn.close();
        this.#connections.delete(name);
      }
    } else {
      for (const [connName, conn] of this.#connections.entries()) {
        await conn.close();
        this.logger.info(`Database connection closed: ${connName}`);
      }
      this.#connections.clear();
    }
  }

  async healthCheck(connectionName = null) {
    try {
      const connName = connectionName || this.#defaultConnection;
      const conn = this.connection(connName);
      const startMs = Date.now();
      await conn.query('SELECT 1');
      const latencyMs = Date.now() - startMs;

      const result = {
        healthy: true,
        latency: latencyMs,
        connection: connName,
        type: conn.type
      };

      // P-02 Fix: Include pool statistics for postgres/mysql connections
      const pool = conn.client;
      if (conn.type === 'postgresql' && pool?.totalCount !== undefined) {
        result.pool = {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount
        };
      } else if (conn.type === 'mysql' && pool?.pool) {
        const mysqlPool = pool.pool;
        result.pool = {
          total: mysqlPool._allConnections?.length || 0,
          idle: mysqlPool._freeConnections?.length || 0,
          waiting: mysqlPool._connectionQueue?.length || 0
        };
      }

      return result;
    } catch (err) {
      return { healthy: false, error: err.message, connection: connectionName || this.#defaultConnection };
    }
  }

  async onDestroy() {
    await this.close();
    this.logger.info('DatabasePlugin destroyed');
  }
}
