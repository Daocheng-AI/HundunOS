# Supermemory 管理器

本目录包含各种管理器的实现，提供缓存、同步、批量操作等功能。

## 核心组件

- `cache-manager.ts` - 缓存管理器
- `error-handler.ts` - 错误处理器
- `bulk-operator.ts` - 批量操作器
- `sync-manager.ts` - 同步管理器

## 功能

### CacheManager
- 内存缓存（Map + LRU）
- 持久化缓存（SQLite）
- TTL 过期
- 缓存失效策略

### ErrorHandler
- 错误分类
- 指数退避重试
- 降级策略
- 离线模式

### BulkOperator
- 批量添加记忆
- 批量检索记忆
- 批量删除记忆
- 进度跟踪

### SyncManager
- 定时同步
- 增量同步
- 冲突检测
- 同步状态管理

## 使用方式

```javascript
const { CacheManagerImpl } = require('./managers/cache-manager.js');
const cache = new CacheManagerImpl(config.cache);

// 设置缓存
await cache.set('profile:user_123', profile, 600000);

// 获取缓存
const profile = await cache.get('profile:user_123');

// 失效缓存
await cache.invalidate('profile:user_123');
```
