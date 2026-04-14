# 同步管理器

## 概述

同步管理器（SyncManager）负责管理本地记忆和云端记忆的同步，支持定时同步、增量同步、智能冲突检测和解决。

## 特性

- ✅ **定时同步**：可配置定时同步间隔
- ✅ **增量同步**：仅同步变更的记忆
- ✅ **冲突检测**：智能检测多种类型的冲突
- ✅ **冲突解决**：支持多种冲突解决策略
- ✅ **事件驱动**：通过事件通知同步状态变化
- ✅ **统计信息**：详细的同步统计和历史记录
- ✅ **手动干预**：支持手动解决冲突

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      SyncManager                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    同步流程                               │ │
│  │                                                          │ │
│  │  1. 获取本地记忆                                          │ │
│  │  2. 获取云端记忆                                          │ │
│  │  3. 检测冲突                                              │ │
│  │  4. 解决冲突                                              │ │
│  │  5. 同步到云端                                            │ │
│  │  6. 同步到本地                                            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   冲突检测                               │ │
│  │  - 相同 ID 不同内容                                       │ │
│  │  - 相同内容不同 ID                                         │ │
│  │  - 时间戳冲突                                             │ │
│  │  - 删除冲突                                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   冲突解决策略                            │ │
│  │  - LOCAL_WINS: 本地优先                                  │ │
│  │  - CLOUD_WINS: 云端优先                                  │ │
│  │  - NEWEST_WINS: 最新的优先                               │ │
│  │  - LONGEST_WINS: 最长的优先                              │ │
│  │  - MANUAL: 手动解决                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   定时同步                                │ │
│  │  - 可配置同步间隔                                         │ │
│  │  - 自动执行                                               │ │
│  │  - 可暂停和恢复                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## API 参考

### 构造函数

```javascript
constructor(adapter, memoryGraph, options = {})
```

**参数：**
- `adapter` (SupermemoryAdapter): Supermemory 适配器实例
- `memoryGraph` (MemoryGraph): HundunOS 记忆图谱实例
- `options.enabled` (boolean): 是否启用同步，默认 false
- `options.interval` (number): 同步间隔（毫秒），默认 3600000（1 小时）
- `options.autoResolveConflicts` (boolean): 是否自动解决冲突，默认 false
- `options.defaultResolution` (string): 默认冲突解决策略，默认 'NEWEST_WINS'
- `options.maxRetries` (number): 最大重试次数，默认 3
- `options.retryDelay` (number): 重试延迟（毫秒），默认 5000

**示例：**
```javascript
const syncManager = new SyncManager(adapter, memoryGraph, {
  enabled: true,
  interval: 3600000,
  autoResolveConflicts: true,
  defaultResolution: 'NEWEST_WINS'
});
```

### 启动同步管理器

```javascript
async start()
```

启动同步管理器，包括定时同步和首次全量同步。

**返回：**
```javascript
{ success: boolean }
```

**示例：**
```javascript
await syncManager.start();
```

### 停止同步管理器

```javascript
async stop()
```

停止同步管理器，包括定时同步。

**返回：**
```javascript
{ success: boolean }
```

**示例：**
```javascript
await syncManager.stop();
```

### 执行同步

```javascript
async sync(options = {})
```

手动执行同步。

**参数：**
- `options.type` (string): 同步类型，'full' 或 'incremental'
- `options.autoResolve` (boolean): 是否自动解决冲突
- `options.containerTag` (string): 容器标签

**返回：**
```javascript
{
  success: boolean,
  task: SyncTask,
  error?: string
}
```

**示例：**
```javascript
const result = await syncManager.sync({
  type: 'full',
  autoResolve: true,
  containerTag: 'user_123'
});
```

### 解决冲突

```javascript
async resolveConflict(conflict, strategy)
```

解决单个冲突。

**参数：**
- `conflict` (ConflictRecord): 冲突记录
- `strategy` (string): 解决策略

**返回：**
```javascript
{
  success: boolean,
  resolvedMemory?: Memory
}
```

**示例：**
```javascript
const conflict = conflicts[0];
await syncManager.resolveConflict(conflict, 'NEWEST_WINS');
```

### 手动解决冲突

```javascript
async manualResolveConflict(conflictId, resolution, memory)
```

手动解决指定冲突。

**参数：**
- `conflictId` (string): 冲突 ID
- `resolution` (string): 解决策略
- `memory` (Memory): 解决后的记忆

**返回：**
```javascript
{
  success: boolean,
  conflict?: ConflictRecord,
  error?: string
}
```

**示例：**
```javascript
const result = await syncManager.manualResolveConflict(
  'conflict_xxx',
  'LOCAL_WINS',
  { id: 'mem-1', content: 'Local content' }
);
```

### 获取同步状态

```javascript
getStatus()
```

获取当前同步状态。

**返回：**
```javascript
{
  enabled: boolean,
  status: string,
  lastSyncTime: number,
  nextSyncTime: number,
  currentTask: SyncTask,
  stats: {
    totalSyncs: number,
    successfulSyncs: number,
    failedSyncs: number,
    conflictsDetected: number,
    conflictsResolved: number
  }
}
```

**示例：**
```javascript
const status = syncManager.getStatus();
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('同步状态:', status.status);
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('上次同步:', status.lastSyncTime);
```

### 获取冲突历史

```javascript
getConflictHistory(options = {})
```

获取冲突历史记录。

**参数：**
- `options.limit` (number): 返回数量限制，默认 100
- `options.resolved` (boolean): 是否只返回已解决的冲突

**返回：**
```javascript
ConflictRecord[]
```

**示例：**
```javascript
// 获取所有未解决的冲突
const unresolvedConflicts = syncManager.getConflictHistory({
  resolved: false
});

// 获取最近 10 个冲突
const recentConflicts = syncManager.getConflictHistory({
  limit: 10
});
```

### 获取统计信息

```javascript
getStats()
```

获取同步统计信息。

**返回：**
```javascript
{
  totalSyncs: number,
  successfulSyncs: number,
  failedSyncs: number,
  conflictsDetected: number,
  conflictsResolved: number
}
```

**示例：**
```javascript
const stats = syncManager.getStats();
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('总同步次数:', stats.totalSyncs);
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('成功次数:', stats.successfulSyncs);
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('冲突数量:', stats.conflictsDetected);
```

## 事件

### sync:start

当同步开始时触发。

```javascript
syncManager.on('sync:start', (task) => {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('同步开始:', task.id);
});
```

### sync:complete

当同步完成时触发。

```javascript
syncManager.on('sync:complete', (task) => {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('同步完成:', task.stats);
});
```

### sync:error

当同步失败时触发。

```javascript
syncManager.on('sync:error', (task) => {
  console.error('同步失败:', task.errors);
});
```

### conflict:detected

当检测到冲突时触发。

```javascript
syncManager.on('conflict:detected', (conflict) => {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('检测到冲突:', conflict.type);
});
```

### conflict:resolved

当冲突解决时触发。

```javascript
syncManager.on('conflict:resolved', (conflict) => {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('冲突已解决:', conflict.resolution);
});
```

## 使用示例

### 基本使用

```javascript
import { SyncManager } from './sync-manager.js';

// 创建同步管理器
const syncManager = new SyncManager(adapter, memoryGraph, {
  enabled: true,
  interval: 3600000,  // 1 小时
  autoResolveConflicts: true,
  defaultResolution: 'NEWEST_WINS'
});

// 启动同步管理器
await syncManager.start();

// 监听事件
syncManager.on('sync:complete', (task) => {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('同步完成:', task.stats);
});

syncManager.on('conflict:detected', (conflict) => {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('检测到冲突:', conflict.type);
});
```

### 手动同步

```javascript
// 手动执行全量同步
const result = await syncManager.sync({
  type: 'full',
  autoResolve: false
});

if (result.success) {
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('同步成功:', result.task.stats);
} else {
  console.error('同步失败:', result.error);
}
```

### 手动解决冲突

```javascript
// 获取未解决的冲突
const conflicts = syncManager.getConflictHistory({
  resolved: false
});

// 手动解决每个冲突
for (const conflict of conflicts) {
  const result = await syncManager.manualResolveConflict(
    conflict.id,
    'LOCAL_WINS',
    conflict.localMemory
  );

  if (result.success) {
    // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('冲突已解决:', conflict.id);
  }
}
```

### 监控同步状态

```javascript
// 定期检查同步状态
setInterval(() => {
  const status = syncManager.getStatus();
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('同步状态:', status.status);
  // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log('统计信息:', status.stats);
}, 60000); // 每分钟检查一次
```

## 配置建议

### 开发环境

```javascript
{
  enabled: true,
  interval: 300000,      // 5 分钟
  autoResolveConflicts: true,
  defaultResolution: 'NEWEST_WINS'
}
```

### 生产环境

```javascript
{
  enabled: true,
  interval: 3600000,     // 1 小时
  autoResolveConflicts: false,
  defaultResolution: 'MANUAL'
}
```

### 高频更新场景

```javascript
{
  enabled: true,
  interval: 60000,       // 1 分钟
  autoResolveConflicts: true,
  defaultResolution: 'NEWEST_WINS'
}
```

## 注意事项

1. **冲突解决**：自动解决冲突可能会丢失数据，建议在开发环境测试后再在生产环境使用
2. **同步间隔**：同步间隔过短可能会增加 API 调用次数和成本
3. **网络依赖**：同步功能依赖网络连接，离线时无法同步
4. **数据一致性**：同步过程中可能存在短暂的不一致状态
5. **性能影响**：大量数据的同步可能会影响系统性能

## 故障排查

### 问题 1：同步一直失败

**症状：** `sync()` 返回 `{ success: false }`

**解决方案：**
- 检查网络连接
- 检查 Supermemory API 密钥是否有效
- 检查适配器和记忆图谱是否正常工作
- 查看错误日志

### 问题 2：冲突无法自动解决

**症状：** 冲突一直未解决

**解决方案：**
- 检查 `autoResolveConflicts` 配置
- 检查冲突类型是否支持自动解决
- 手动解决冲突

### 问题 3：同步数据不一致

**症状：** 本地和云端数据不一致

**解决方案：**
- 检查冲突解决策略是否正确
- 手动执行全量同步
- 检查冲突历史记录

## 总结

同步管理器为 Supermemory 集成提供了可靠的同步能力，确保本地和云端记忆的数据一致性，支持灵活的冲突解决策略和定时同步，是生产环境部署的重要组件。
