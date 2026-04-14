// hundunos/kernel/config/storage.config.js
// 存储配置类

/**
 * 存储配置类
 */
export class StorageConfig {
  type = 'json';
  path = './data';
  encryptBackups = false;
  backupRetentionDays = 7;
  maxBackups = 10;
  sqliteDatabasePath = './data/hundunos.db';
  sqlitePoolSize = 3;
  postgresHost = 'localhost';
  postgresPort = 5432;
  postgresDatabase = 'hundunos';
  postgresUser = 'postgres';
  postgresPassword = '';

  constructor() {
    const validTypes = ['json', 'sqlite', 'postgres'];
    if (validTypes.includes(process.env.STORAGE_TYPE)) {
      this.type = process.env.STORAGE_TYPE;
    }
    if (process.env.STORAGE_PATH) this.path = process.env.STORAGE_PATH;
    if (process.env.STORAGE_ENCRYPT_BACKUPS === 'true') this.encryptBackups = true;
    const brd = parseInt(process.env.STORAGE_BACKUP_RETENTION_DAYS, 10);
    if (!isNaN(brd)) this.backupRetentionDays = brd;
    const mb = parseInt(process.env.STORAGE_MAX_BACKUPS, 10);
    if (!isNaN(mb)) this.maxBackups = mb;
    if (process.env.SQLITE_DATABASE_PATH) this.sqliteDatabasePath = process.env.SQLITE_DATABASE_PATH;
    const sps = parseInt(process.env.SQLITE_POOL_SIZE, 10);
    if (!isNaN(sps)) this.sqlitePoolSize = sps;
    if (process.env.POSTGRES_HOST) this.postgresHost = process.env.POSTGRES_HOST;
    const pp = parseInt(process.env.POSTGRES_PORT, 10);
    if (!isNaN(pp)) this.postgresPort = pp;
    if (process.env.POSTGRES_DATABASE) this.postgresDatabase = process.env.POSTGRES_DATABASE;
    if (process.env.POSTGRES_USER) this.postgresUser = process.env.POSTGRES_USER;
    if (process.env.POSTGRES_PASSWORD) this.postgresPassword = process.env.POSTGRES_PASSWORD;
  }
}
