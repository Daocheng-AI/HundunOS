/**
 * HundunOS v4.3 - ELK Stack 集成
 * 实现日志聚合和查询
 */

import { Client } from '@elastic/elasticsearch';

/**
 * ELK Stack 管理器
 */
export class ELKStackManager {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.options = {
      node: options.node || 'http://localhost:9200',
      username: options.username || 'elastic',
      password: options.password || '',
      indexPrefix: options.indexPrefix || 'hundunos',
    };
    this.client = null;
  }

  /**
   * 初始化
   */
  async initialize() {
    this.client = new Client({
      node: this.options.node,
      auth: {
        username: this.options.username,
        password: this.options.password,
      },
    });

    try {
      await this.client.ping();
      console.log('[ELKStack] Connected');
    } catch (e) {
      console.error('[ELKStack] Connection failed:', e.message);
      throw e;
    }
  }

  /**
   * 创建索引
   */
  async createIndex(index) {
    const fullIndex = `${this.options.indexPrefix}-${index}`;
    try {
      await this.client.indices.create({
        index: fullIndex,
        body: {
          mappings: {
            properties: {
              timestamp: { type: 'date' },
              level: { type: 'keyword' },
              message: { type: 'text' },
              module: { type: 'keyword' },
              sessionId: { type: 'keyword' },
              userId: { type: 'keyword' },
              metadata: { type: 'object' },
            },
          },
        },
      });
      console.log(`[ELKStack] Index created: ${fullIndex}`);
    } catch (e) {
      if (e.meta.statusCode !== 400) {
        console.error(`[ELKStack] Create index failed: ${e.message}`);
      }
    }
  }

  /**
   * 记录日志
   */
  async log(index, level, message, metadata = {}) {
    const fullIndex = `${this.options.indexPrefix}-${index}`;
    try {
      await this.client.index({
        index: fullIndex,
        body: {
          timestamp: new Date().toISOString(),
          level,
          message,
          ...metadata,
        },
      });
    } catch (e) {
      console.error(`[ELKStack] Log failed: ${e.message}`);
    }
  }

  /**
   * 查询日志
   */
  async query(index, query = {}) {
    const fullIndex = `${this.options.indexPrefix}-${index}`;
    try {
      const result = await this.client.search({
        index: fullIndex,
        body: {
          query: {
            bool: {
              must: query.filters || [],
              must_not: query.excludes || [],
            },
          },
          sort: [{ timestamp: { order: 'desc' } }],
          size: query.size || 100,
        },
      });
      return result.hits.hits.map(hit => hit._source);
    } catch (e) {
      console.error(`[ELKStack] Query failed: ${e.message}`);
      return [];
    }
  }

  /**
   * 聚合统计
   */
  async aggregate(index, aggregations = {}) {
    const fullIndex = `${this.options.indexPrefix}-${index}`;
    try {
      const result = await this.client.search({
        index: fullIndex,
        body: {
          size: 0,
          aggregations,
        },
      });
      return result.aggregations;
    } catch (e) {
      console.error(`[ELKStack] Aggregate failed: ${e.message}`);
      return {};
    }
  }

  /**
   * 删除索引
   */
  async deleteIndex(index) {
    const fullIndex = `${this.options.indexPrefix}-${index}`;
    try {
      await this.client.indices.delete({ index: fullIndex });
      console.log(`[ELKStack] Index deleted: ${fullIndex}`);
    } catch (e) {
      console.error(`[ELKStack] Delete index failed: ${e.message}`);
    }
  }

  /**
   * 关闭
   */
  async close() {
    if (this.client) {
      await this.client.close();
      console.log('[ELKStack] Closed');
    }
  }
}

export default ELKStackManager;
