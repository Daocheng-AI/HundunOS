# 持久化缓存管理器

## 概述

持久化缓存管理器（PersistentCacheManager）使用 SQLite 数据库存储缓存数据，提供跨进程、跨重启的持久化缓存能力。

## 特性

- ✅ **SQLite 存储**：使用轻量级 SQLite 数据库，无需额外依赖
- ✅ **自动过期**：基于 TTL 的自动过期机制
- ✅ **LRU 清理**：当缓存达到最大容量时，自动清理最久未访问的条目
- ✅ **索引优化**：自动创建索引，提升查询性能
- ✅ **定时清理**：定期清理过期缓存，释放空间
- ✅ **统计信息**：提供详细的缓存统计信息
- ✅ **导入导出**：支持缓存数据的导入和导出

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    PersistentCacheManager                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    SQLite Database                      │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │  cache 表                                                │ │
│  │  ├── key (TEXT, PRIMARY KEY)                            │ │
│  │  ├── value (TEXT, NOT NULL)                             │ │
│  │  ├── created_at (INTEGER, NOT NULL)                     │ │
│  │  ├── expires_at (INTEGER, NOT NULL)                     │ │
│  │  ├── last_accessed_at (INTEGER, NOT NULL)               │ │
│  │  └── access_count (INTEGER, NOT NULL)                   │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │  索引                                                    │ │
│  │  ├── idx_expires_at (expires_at)                        │ │
│  │  └── idx_last_accessed_at (last_accessed_at)            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    定时清理任务                          │ │
│  │  - 每 5 分钟清理一次过期缓存                             │ │
│  │  - 自动删除超过最大容量的缓存                            │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## API 参考

### 构造函数

```javascript
constructor(options = {})
```

**参数：**
- `options.dbPath` (string): 数据库文件路径，默认为 `data/supermemory-cache.db`
- `options.ttl` (number): 默认 TTL（毫秒），默认为 600000（10 分钟）
- `options.maxSize` (number): 最大缓存条目数，默认为 10000
- `options.cleanupInterval` (number): 清理间隔（毫秒），默认为 300000（5 分钟）

**示例：**
```javascript
const cache = new PersistentCacheManager({
  dbPath: './cache.db',
  ttl: 600000,
  maxSize: 10000,
  cleanupInterval: 300000
});
```

### 初始化

```javascript
async initialize()
```

初始化数据库连接，创建必要的表和索引。

**返回：**
```javascript
{ success: boolean, error?: string }
```

**示例：**
```javascript
const result = await cache.initialize();
if (result.success) {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('缓存初始化成功');
}
```

### 获取缓存

```javascript
async get(key)
```

从缓存中获取值。

**参数：**
- `key` (string): 缓存键

**返回：**
```javascript
any | null
```

**示例：**
```javascript
const value = await cache.get('user:123');
if (value) {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('缓存命中:', value);
}
```

### 设置缓存

```javascript
async set(key, value, ttl)
```

设置缓存值。

**参数：**
- `key` (string): 缓存键
- `value` (any): 缓存值（会被 JSON 序列化）
- `ttl` (number): TTL（毫秒），可选，默认使用构造函数的 TTL

**返回：**
```javascript
{ success: boolean, error?: string }
```

**示例：**
```javascript
await cache.set('user:123', { name: 'Alice', age: 30 }, 600000);
```

### 删除缓存

```javascript
async delete(key)
```

删除指定的缓存条目。

**参数：**
- `key` (string): 缓存键

**返回：**
```javascript
{ success: boolean, deleted: boolean, error?: string }
```

**示例：**
```javascript
await cache.delete('user:123');
```

### 清空缓存

```javascript
async clear()
```

清空所有缓存。

**返回：**
```javascript
{ success: boolean, error?: string }
```

**示例：**
```javascript
await cache.clear();
```

### 按前缀删除

```javascript
async deleteByPrefix(prefix)
```

删除指定前缀的所有缓存。

**参数：**
- `prefix` (string): 缓存键前缀

**返回：**
```javascript
{ success: boolean, deletedCount: number, error?: string }
```

**示例：**
```javascript
await cache.deleteByPrefix('user:');
```

### 获取统计信息

```javascript
getStats()
```

获取缓存统计信息。

**返回：**
```javascript
{
  hits: number,
  misses: number,
  sets: number,
  deletes: number,
  cleanups: number,
  size: number,
  totalSize: number,
  hitRate: string
}
```

**示例：**
```javascript
const stats = cache.getStats();
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('缓存命中率:', stats.hitRate);
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('缓存大小:', stats.size);
```

### 列出缓存

```javascript
async list(options = {})
```

列出缓存条目。

**参数：**
- `options.limit` (number): 返回数量限制，默认 100
- `options.offset` (number): 偏移量，默认 0
- `options.key` (string): 键过滤（模糊匹配）

**返回：**
```javascript
{
  success: boolean,
  items: Array<{
    key: string,
    createdAt: number,
    expiresAt: number,
    lastAccessedAt: number,
    accessCount: number,
    remainingTTL: number
  }>,
  error?: string
}
```

**示例：**
```javascript
const result = await cache.list({ limit: 10, key: 'user' });
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('缓存列表:', result.items);
```

### 导出缓存

```javascript
async export()
```

导出所有缓存数据。

**返回：**
```javascript
{
  success: boolean,
  items: Array<{
    key: string,
    value: any,
    createdAt: number,
    expiresAt: number,
    lastAccessedAt: number,
    accessCount: number
  }>,
  error?: string
}
```

**示例：**
```javascript
const result = await cache.export();
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('导出', result.items.length, '条缓存');
```

### 导入缓存

```javascript
async import(items)
```

导入缓存数据。

**参数：**
- `items` (Array): 缓存条目数组

**返回：**
```javascript
{ success: boolean, importedCount: number, error?: string }
```

**示例：**
```javascript
const items = [
  { key: 'user:123', value: { name: 'Alice' } },
  { key: 'user:456', value: { name: 'Bob' } }
];
await cache.import(items);
```

### 关闭连接

```javascript
async close()
```

关闭数据库连接并停止定时清理任务。

**返回：**
```javascript
{ success: boolean, error?: string }
```

**示例：**
```javascript
await cache.close();
```

## 使用示例

### 基本使用

```javascript
import { PersistentCacheManager } from './persistent-cache-manager.js';

// 创建缓存实例
const cache = new PersistentCacheManager({
  ttl: 600000,  // 10 分钟
  maxSize: 10000
});

// 初始化
await cache.initialize();

// 设置缓存
await cache.set('user:123', { name: 'Alice', age: 30 });

// 获取缓存
const user = await cache.get('user:123');
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(user); // { name: 'Alice', age: 30 }

// 删除缓存
await cache.delete('user:123');

// 关闭连接
await cache.close();
```

### 在 CacheManager 中使用

```javascript
import { CacheManager } from './cache-manager.js';

const cache = new CacheManager({
  enabled: true,
  ttl: 600000,
  maxSize: 1000,
  persistent: true  // 启用持久化缓存
});

// 缓存会自动存储到 SQLite 数据库
await cache.set('key', 'value');
const value = await cache.get('key');

// 获取统计信息
const stats = cache.getStats();
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('内存缓存大小:', stats.size);
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('持久化缓存大小:', stats.persistentStats.size);
```

### 批量操作

```javascript
// 批量设置
const items = [
  { key: 'user:1', value: { name: 'Alice' } },
  { key: 'user:2', value: { name: 'Bob' } },
  { key: 'user:3', value: { name: 'Charlie' } }
];

for (const item of items) {
  await cache.set(item.key, item.value);
}

// 批量删除
await cache.deleteByPrefix('user:');

// 列出所有缓存
const result = await cache.list({ limit: 100 });
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('缓存列表:', result.items);
```

### 导出和导入

```javascript
// 导出缓存
const exportResult = await cache.export();
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('导出', exportResult.items.length, '条缓存');

// 保存到文件
import { writeFileSync } from 'fs';
writeFileSync('cache-backup.json', JSON.stringify(exportResult.items, null, 2));

// 从文件导入
import { readFileSync } from 'fs';
const backup = JSON.parse(readFileSync('cache-backup.json', 'utf8'));
await cache.import(backup);
```

## 配置建议

### 开发环境

```javascript
const cache = new PersistentCacheManager({
  ttl: 600000,           // 10 分钟
  maxSize: 1000,         // 较小的缓存
  cleanupInterval: 60000 // 1 分钟清理一次
});
```

### 生产环境

```javascript
const cache = new PersistentCacheManager({
  ttl: 3600000,          // 1 小时
  maxSize: 10000,        // 较大的缓存
  cleanupInterval: 300000 // 5 分钟清理一次
});
```

### 高性能场景

```javascript
const cache = new PersistentCacheManager({
  ttl: 1800000,          // 30 分钟
  maxSize: 50000,        // 非常大的缓存
  cleanupInterval: 600000 // 10 分钟清理一次
});
```

## 性能优化

1. **索引优化**：已自动创建 `expires_at` 和 `last_accessed_at` 索引
2. **批量操作**：使用事务批量导入数据
3. **定期清理**：自动清理过期缓存，避免数据库膨胀
4. **LRU 策略**：自动清理最久未访问的缓存

## 注意事项

1. **数据序列化**：缓存值会被 JSON 序列化，确保值可以被序列化
2. **并发访问**：SQLite 支持并发读取，但写入是串行的
3. **数据库文件**：确保数据库文件目录存在且有写入权限
4. **内存使用**：大量缓存数据会增加内存使用，合理设置 `maxSize`
5. **定期备份**：重要数据建议定期使用 `export()` 备份

## 故障排查

### 问题 1：数据库初始化失败

**症状：** `initialize()` 返回 `{ success: false, error: '...' }`

**解决方案：**
- 检查数据库文件路径是否正确
- 确保目录存在且有写入权限
- 检查 SQLite 是否正确安装

### 问题 2：缓存未持久化

**症状：** 重启后缓存丢失

**解决方案：**
- 确保调用了 `await cache.initialize()`
- 检查 `persistent` 配置是否为 `true`
- 检查数据库文件是否正确创建

### 问题 3：性能问题

**症状：** 缓存操作缓慢

**解决方案：**
- 增加 `maxSize`，减少清理频率
- 增加 `cleanupInterval`，减少清理开销
- 使用更快的存储设备（SSD）

## 总结

持久化缓存管理器为 Supermemory 集成提供了可靠的持久化存储能力，支持跨进程、跨重启的缓存共享，是生产环境部署的重要组件。
