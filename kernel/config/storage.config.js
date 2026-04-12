// hundunos/kernel/config/storage.config.js
// 存储配置类

import { Config, Env, Nested } from './decorators.js';

/**
 * 存储类型枚举
 */
const storageTypeSchema = z.enum(['json', 'sqlite', 'postgres']);

/**
 * 存储配置类
 */
@Config
export class StorageConfig {
  /** 存储类型 */
  @Env('STORAGE_TYPE', storageTypeSchema)
  type = 'json';

  /** 存储路径 */
  @Env('STORAGE_PATH')
  path = './data';

  /** 是否加密备份 */
  @Env('STORAGE_ENCRYPT_BACKUPS')
  encryptBackups = false;

  /** 备份保留天数 */
  @Env('STORAGE_BACKUP_RETENTION_DAYS')
  backupRetentionDays = 7;

  /** 最大备份文件数 */
  @Env('STORAGE_MAX_BACKUPS')
  maxBackups = 10;

  /** SQLite 数据库文件路径 */
  @Env('SQLITE_DATABASE_PATH')
  sqliteDatabasePath = './data/hundunos.db';

  /** SQLite 连接池大小 */
  @Env('SQLITE_POOL_SIZE')
  sqlitePoolSize = 3;

  /** PostgreSQL 主机 */
  @Env('POSTGRES_HOST')
  postgresHost = 'localhost';

  /** PostgreSQL 端口 */
  @Env('POSTGRES_PORT')
  postgresPort = 5432;

  /** PostgreSQL 数据库名 */
  @Env('POSTGRES_DATABASE')
  postgresDatabase = 'hundunos';

  /** PostgreSQL 用户名 */
  @Env('POSTGRES_USER')
  postgresUser = 'postgres';

  /** PostgreSQL 密码 */
  @Env('POSTGRES_PASSWORD')
  postgresPassword = '';
}
