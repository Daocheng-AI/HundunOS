# Supermemory 桥接器

本目录包含记忆桥接器的实现，连接 HundunOS 本地记忆和 Supermemory 云端记忆。

## 核心组件

- `memory-bridge.ts` - 记忆桥接器

## 功能

1. 双写控制 - 同时写入本地和云端
2. 记忆同步 - 本地与云端记忆的双向同步
3. 冲突检测 - 识别本地和云端的记忆冲突
4. 冲突解决 - 自动或手动解决冲突
5. 数据迁移 - 本地记忆批量迁移到云端

## 使用方式

```javascript
const { MemoryBridge } = require('./bridges/memory-bridge.js');
const bridge = new MemoryBridge(memoryGraph, adapter);

// 启用双写
bridge.enableDualWrite(true);

// 同步到云端
await bridge.syncToCloud(localMemory);

// 从云端同步
await bridge.syncFromCloud('user_123');

// 解决冲突
const resolution = bridge.resolveConflict(local, cloud);
```
