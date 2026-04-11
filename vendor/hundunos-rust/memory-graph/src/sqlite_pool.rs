// sqlite_pool.rs - SQLite WAL + 读写分离连接池
// 借鉴 sage-wiki 的 storage/db.go 实现
// 
// 设计原则：
// 1. 单写多读：一个写连接 + 多个读连接
// 2. WAL 模式：提升并发性能
// 3. 连接池：复用读连接
// 4. 自动重试：带 jitter 的写冲突重试

use rusqlite::{Connection, Result, params};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use rand::Rng;

/// 写操作重试配置
const WRITE_MAX_RETRIES: usize = 15;
const WRITE_RETRY_MIN_MS: u64 = 20;
const WRITE_RETRY_MAX_MS: u64 = 150;

/// 读连接池大小
const READ_POOL_SIZE: usize = 4;

/// SQLite 连接池（WAL + 读写分离）
pub struct SqlitePool {
    /// 写连接（独占）
    write_conn: Mutex<Connection>,
    /// 读连接池
    read_pool: Arc<Mutex<Vec<Connection>>>,
    /// 数据库路径
    db_path: String,
}

impl SqlitePool {
    /// 创建新的连接池
    /// 
    /// # 参数
    /// - `db_path`: 数据库文件路径
    /// 
    /// # 返回
    /// 初始化好的连接池
    pub fn new(db_path: &str) -> Result<Self> {
        // 创建写连接
        let write_conn = Self::create_write_connection(db_path)?;
        
        // 创建读连接池
        let mut read_conns = Vec::with_capacity(READ_POOL_SIZE);
        for _ in 0..READ_POOL_SIZE {
            read_conns.push(Self::create_read_connection(db_path)?);
        }

        Ok(Self {
            write_conn: Mutex::new(write_conn),
            read_pool: Arc::new(Mutex::new(read_conns)),
            db_path: db_path.to_string(),
        })
    }

    /// 创建写连接（WAL 模式）
    fn create_write_connection(db_path: &str) -> Result<Connection> {
        let conn = Connection::open(db_path)?;
        
        // WAL 模式 + 同步模式设置
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA temp_store=memory;
             PRAGMA mmap_size=268435456;"  // 256MB mmap
        )?;
        
        Ok(conn)
    }

    /// 创建读连接（只读模式）
    fn create_read_connection(db_path: &str) -> Result<Connection> {
        // 使用 URI 模式开启只读连接
        let conn = Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                | rusqlite::OpenFlags::SQLITE_OPEN_URI
        )?;
        
        Ok(conn)
    }

    /// 获取写连接（自动加锁）
    pub fn write(&self) -> MutexGuard<Connection> {
        self.write_conn.lock().unwrap()
    }

    /// 获取读连接（从连接池）
    pub fn read(&self) -> PooledConnection {
        let pool = self.read_pool.lock().unwrap();
        // 简单轮询：取第一个可用连接
        // 生产环境可以使用更复杂的连接池策略
        PooledConnection {
            pool: Arc::clone(&self.read_pool),
        }
    }

    /// 执行写事务（带自动重试）
    /// 
    /// # 参数
    /// - `f`: 事务闭包
    /// 
    /// # 返回
    /// 事务执行结果
    pub fn write_with_retry<F, T>(&self, mut f: F) -> Result<T>
    where
        F: FnMut(&Connection) -> Result<T>,
    {
        let mut rng = rand::thread_rng();
        let mut retries = 0;

        loop {
            let conn = self.write();
            match f(&*conn) {
                Ok(result) => return Ok(result),
                Err(e) => {
                    retries += 1;
                    if retries >= WRITE_MAX_RETRIES {
                        return Err(e);
                    }
                    // 随机 jitter 退避
                    let delay_ms = rng.gen_range(WRITE_RETRY_MIN_MS..WRITE_RETRY_MAX_MS);
                    drop(conn); // 释放锁
                    std::thread::sleep(Duration::from_millis(delay_ms));
                }
            }
        }
    }

    /// 执行读操作
    pub fn read_query<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        let pool = self.read_pool.lock().unwrap();
        // 使用第一个连接（简化实现）
        let conn = pool.first().ok_or_else(|| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some("No available read connection".to_string()),
            )
        })?;
        f(conn)
    }

    /// 关闭连接池
    pub fn close(self) -> Result<()> {
        // 写连接会在 drop 时自动关闭
        // 读连接池需要手动清理
        let mut pool = self.read_pool.lock().unwrap();
        pool.clear();
        Ok(())
    }
}

/// 池化连接句柄
pub struct PooledConnection {
    pool: Arc<Mutex<Vec<Connection>>>,
}

impl PooledConnection {
    /// 使用连接执行查询
    pub fn query<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        let pool = self.pool.lock().unwrap();
        let conn = pool.first().ok_or_else(|| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some("No available read connection".to_string()),
            )
        })?;
        f(conn)
    }
}

/// 初始化 FTS5 表结构
pub fn init_fts5_tables(conn: &Connection) -> Result<()> {
    // 创建 FTS5 虚拟表
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            content,
            intent,
            layer,
            content=messages,
            content_rowid=id
        );"
    )?;

    // 创建源表
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages(
            id INTEGER PRIMARY KEY,
            memory_id TEXT UNIQUE,
            content TEXT,
            intent TEXT,
            layer TEXT,
            timestamp INTEGER,
            importance INTEGER
        );"
    )?;

    // 创建索引
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_messages_layer ON messages(layer);
         CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
         CREATE INDEX IF NOT EXISTS idx_messages_importance ON messages(importance);"
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_db_path() -> String {
        let temp_dir = std::env::temp_dir();
        let uuid = uuid::Uuid::new_v4().to_string();
        temp_dir.join(format!("test_hundunos_{}.db", uuid))
            .to_string_lossy()
            .to_string()
    }

    #[test]
    fn test_pool_creation() {
        let db_path = temp_db_path();
        let pool = SqlitePool::new(&db_path).unwrap();
        
        // 测试写操作
        pool.write_with_retry(|conn| {
            conn.execute(
                "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)",
                [],
            )
        }).unwrap();

        // 测试读操作
        let count: i64 = pool.read_query(|conn| {
            conn.query_row("SELECT COUNT(*) FROM test", [], |row| row.get(0))
        }).unwrap();
        
        assert_eq!(count, 0);

        // 清理
        drop(pool);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn test_concurrent_access() {
        let db_path = temp_db_path();
        let pool = Arc::new(SqlitePool::new(&db_path).unwrap());
        
        // 初始化表
        pool.write_with_retry(|conn| {
            conn.execute("CREATE TABLE counter (value INTEGER)", [])?;
            conn.execute("INSERT INTO counter VALUES (0)", [])
        }).unwrap();

        // 模拟并发读写
        let pool_clone = Arc::clone(&pool);
        let handle = std::thread::spawn(move || {
            for _ in 0..10 {
                let _ = pool_clone.read_query(|conn| {
                    conn.query_row::<i64, _, _>("SELECT value FROM counter", [], |row| row.get(0))
                });
            }
        });

        // 主线程写
        for _ in 0..10 {
            pool.write_with_retry(|conn| {
                conn.execute("UPDATE counter SET value = value + 1", [])
            }).unwrap();
        }

        handle.join().unwrap();

        // 验证
        let final_value: i64 = pool.read_query(|conn| {
            conn.query_row("SELECT value FROM counter", [], |row| row.get(0))
        }).unwrap();
        
        assert_eq!(final_value, 10);

        // 清理
        drop(pool);
        let _ = fs::remove_file(&db_path);
    }
}
