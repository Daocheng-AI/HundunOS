# Supermemory 适配器

本目录包含 Supermemory API 适配器的实现，封装所有 API 调用逻辑。

## 核心组件

- `api-client.ts` - Supermemory API 客户端
- `supermemory-adapter.ts` - Supermemory 适配器接口实现

## 功能

1. HTTP 请求封装
2. 认证处理
3. 超时控制
4. 重试机制
5. 错误处理

## 使用方式

```javascript
const { SupermemoryAdapterImpl } = require('./adapters/supermemory-adapter.js');
const adapter = new SupermemoryAdapterImpl(config);
await adapter.initialize();

// 获取用户画像
const profile = await adapter.getUserProfile('user_123');

// 添加记忆
const memory = await adapter.addMemory('用户偏好使用 TypeScript', 'user_123');

// 搜索记忆
const results = await adapter.searchMemories({
  query: 'TypeScript',
  containerTag: 'user_123',
  searchMode: 'hybrid'
});
```
