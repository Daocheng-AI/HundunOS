/**
 * 持久化缓存管理器
 *
 * 使用 SQLite 存储缓存数据，提供持久化缓存能力
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath, dirname } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 缓存条目类
 */
class CacheEntry {
  constructor(key, value, ttl) {
    this.key = key;
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttl;
    this.lastAccessedAt = this.createdAt;
    this.accessCount = 0;
  }

  /**
   * 检查是否过期
   */
  isExpired() {
    return Date.now() > this.expiresAt;
  }

  /**
   * 访问缓存
   */
  access() {
    this.lastAccessedAt = Date.now();
    this.accessCount++;
  }

  /**
   * 获取剩余生存时间（毫秒）
   */
  getRemainingTTL() {
    return Math.max(0, this.expiresAt - Date.now());
  }

  /**
   * 更新过期时间
   */
  updateTTL(ttl) {
    this.expiresAt = Date.now() + ttl;
  }
}

/**
 * 持久化缓存管理器
 */
export class PersistentCacheManager {
  constructor(options = {}) {
    this.dbPath = options.dbPath || join(__dirname, '..', '..', '..', 'data', 'supermemory-cache.db');
    this.ttl = options.ttl || 600000; // 默认 10 分钟
    this.maxSize = options.maxSize || 10000; // 最大缓存条目数
    this.cleanupInterval = options.cleanupInterval || 300000; // 清理间隔（5 分钟）
    this.db = null;
    this.cleanupTimer = null;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      cleanups: 0
    };
  }

  /**
   * 初始化数据库
   */
  async initialize() {
    try {
      // 确保数据目录存在
      const dbDir = dirname(this.dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      // 打开数据库
      this.db = new Database(this.dbPath);

      // 创建缓存表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cache (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL,
          access_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_expires_at ON cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_last_accessed_at ON cache(last_accessed_at);
      `);

      // 启动定时清理
      this.startCleanup();

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 启动定时清理
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * 停止定时清理
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    try {
      const now = Date.now();
      const stmt = this.db.prepare('DELETE FROM cache WHERE expires_at < ?');
      const result = stmt.run(now);
      this.stats.cleanups++;
      return { success: true, deletedCount: result.changes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取缓存
   */
  async get(key) {
    try {
      const stmt = this.db.prepare('SELECT * FROM cache WHERE key = ?');
      const row = stmt.get(key);

      if (!row) {
        this.stats.misses++;
        return null;
      }

      // 检查是否过期
      if (Date.now() > row.expires_at) {
        this.delete(key);
        this.stats.misses++;
        return null;
      }

      // 更新访问信息
      const updateStmt = this.db.prepare(`
        UPDATE cache
        SET last_accessed_at = ?,
            access_count = access_count + 1
        WHERE key = ?
      `);
      updateStmt.run(Date.now(), key);

      this.stats.hits++;
      return JSON.parse(row.value);
    } catch (error) {
      console.error('[PersistentCacheManager] 获取缓存失败:', error);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  async set(key, value, ttl = this.ttl) {
    try {
      const now = Date.now();
      const entry = {
        key,
        value: JSON.stringify(value),
        created_at: now,
        expires_at: now + ttl,
        last_accessed_at: now,
        access_count: 0
      };

      // 检查是否超过最大缓存数
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM cache');
      const { count } = countStmt.get();

      if (count >= this.maxSize) {
        // 删除最久未访问的缓存
        const deleteStmt = this.db.prepare(`
          DELETE FROM cache
          WHERE key IN (
            SELECT key FROM cache
            ORDER BY last_accessed_at ASC
            LIMIT ?
          )
        `);
        deleteStmt.run(count - this.maxSize + 1);
      }

      // 插入或更新缓存
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cache
        (key, value, created_at, expires_at, last_accessed_at, access_count)
        VALUES (?, ?, ?, ?, ?, 0)
      `);
      stmt.run(entry.key, entry.value, entry.created_at, entry.expires_at, entry.last_accessed_at);

      this.stats.sets++;
      return { success: true };
    } catch (error) {
      console.error('[PersistentCacheManager] 设置缓存失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除缓存
   */
  async delete(key) {
    try {
      const stmt = this.db.prepare('DELETE FROM cache WHERE key = ?');
      const result = stmt.run(key);
      this.stats.deletes++;
      return { success: true, deleted: result.changes > 0 };
    } catch (error) {
      console.error('[PersistentCacheManager] 删除缓存失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 清空所有缓存
   */
  async clear() {
    try {
      const stmt = this.db.prepare('DELETE FROM cache');
      stmt.run();
      return { success: true };
    } catch (error) {
      console.error('[PersistentCacheManager] 清空缓存失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 按前缀删除缓存
   */
  async deleteByPrefix(prefix) {
    try {
      const stmt = this.db.prepare('DELETE FROM cache WHERE key LIKE ?");
      const pattern = `${prefix}%`;
      const result = stmt.run(pattern);
      return { success: true, deletedCount: result.changes };
    } catch (error) {
      console.error('[PersistentCacheManager] 按前缀删除缓存失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    try {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM cache');
      const { count } = countStmt.get();

      const sizeStmt = this.db.prepare(`
        SELECT SUM(LENGTH(value)) as total_size
        FROM cache
      `);
      const { total_size } = sizeStmt.get();

      return {
        ...this.stats,
        size: count,
        totalSize: total_size || 0,
        hitRate: this.stats.hits + this.stats.misses > 0
          ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
          : '0.00'
      };
    } catch (error) {
      console.error('[PersistentCacheManager] 获取统计信息失败:', error);
      return this.stats;
    }
  }

  /**
   * 获取缓存列表
   */
  async list(options = {}) {
    try {
      const { limit = 100, offset = 0, key } = options;

      let sql = 'SELECT key, created_at, expires_at, last_accessed_at, access_count FROM cache';
      const params = [];

      if (key) {
        sql += ' WHERE key LIKE ?';
        params.push(`%${key}%`);
      }

      sql += ' ORDER BY last_accessed_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);

      return {
        success: true,
        items: rows.map(row => ({
          key: row.key,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          lastAccessedAt: row.last_accessed_at,
          accessCount: row.access_count,
          remainingTTL: Math.max(0, row.expires_at - Date.now())
        }))
      };
    } catch (error) {
      console.error('[PersistentCacheManager] 获取缓存列表失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 关闭数据库连接
   */
  async close() {
    try {
      this.stopCleanup();
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      return { success: true };
    } catch (error) {
      console.error('[PersistentCacheManager] 关闭数据库失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 导出缓存数据
   */
  async export() {
    try {
      const stmt = this.db.prepare('SELECT * FROM cache');
      const rows = stmt.all();

      return {
        success: true,
        items: rows.map(row => ({
          key: row.key,
          value: JSON.parse(row.value),
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          lastAccessedAt: row.last_accessed_at,
          accessCount: row.access_count
        }))
      };
    } catch (error) {
      console.error('[PersistentCacheManager] 导出缓存失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 导入缓存数据
   */
  async import(items) {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cache
        (key, value, created_at, expires_at, last_accessed_at, access_count)
        VALUES (?, ?, ?, ?, ?, 0)
      `);

      const insertMany = this.db.transaction((items) => {
        for (const item of items) {
          stmt.run(
            item.key,
            JSON.stringify(item.value),
            item.createdAt || now,
            item.expiresAt || now + this.ttl,
            item.lastAccessedAt || now
          );
        }
      });

      insertMany(items);

      return { success: true, importedCount: items.length };
    } catch (error) {
      console.error('[PersistentCacheManager] 导入缓存失败:', error);
      return { success: false, error: error.message };
    }
  }
}

export default PersistentCacheManager;
