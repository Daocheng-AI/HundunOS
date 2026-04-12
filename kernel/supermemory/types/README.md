# Supermemory 类型定义

本目录包含 Supermemory 集成所需的所有 TypeScript 类型接口定义。

## 核心类型

- `UserProfile` - 用户画像（静态特征 + 动态上下文）
- `Memory` - 记忆对象
- `SearchQuery` - 搜索查询
- `SearchResult` - 搜索结果
- `SupermemoryConfig` - Supermemory 配置

## 使用方式

```javascript
const { UserProfile, Memory, SupermemoryConfig } = require('./types/index.js');
```
