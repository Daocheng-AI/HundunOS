import { BasePlugin } from '../../core/BasePlugin.js';

export class DatabasePlugin extends BasePlugin {
  #connections = new Map();
  #defaultConnection = 'default';
  #config = null;

  get name() {
    return 'database';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    
    const dbConfig = this.#config.get('database');
    if (!dbConfig) {
      this.logger.warn('No database configuration found');
      return;
    }

    await this.#initializeConnections(dbConfig);

    this.kernel.services.register('db', () => ({
      connection: this.connection.bind(this),
      query: this.query.bind(this),
      transaction: this.transaction.bind(this),
      raw: this.raw.bind(this),
      close: this.close.bind(this),
      healthCheck: this.healthCheck.bind(this)
    }), { singleton: true });

    this.logger.info('DatabasePlugin initialized');
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
      const conn = this.connection(connectionName);
      await conn.query('SELECT 1');
      return { healthy: true, latency: 0 };
    } catch (err) {
      return { healthy: false, error: err.message };
    }
  }

  async onDestroy() {
    await this.close();
    this.logger.info('DatabasePlugin destroyed');
  }
}
