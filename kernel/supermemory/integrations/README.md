# Supermemory 集成模块

本目录包含 Supermemory 与 HundunOS 各模块的集成实现。

## 集成模块

### ContextEnhancer 集成

**文件**: `context-enhancer-integration.js`

**功能**:
- 将 Supermemory 的用户画像注入到 AI 上下文中
- 将 Supermemory 的相关记忆注入到 AI 上下文中
- 实现上下文长度控制
- 支持降级处理

**使用方式**:

```javascript
const { SupermemoryContextEnhancerIntegration } = require('./integrations/context-enhancer-integration.js');

// 创建集成实例
const integration = new SupermemoryContextEnhancerIntegration(kernel);
await integration.initialize();

// 构建增强上下文
const enhancedContext = await integration.buildEnhancedContext({
  query: 'TypeScript',
  maxMemories: 5
});

// 注入用户画像
const contextWithProfile = integration.injectUserProfile(context, enhancedContext.userProfile);

// 注入相关记忆
const contextWithMemories = integration.injectRelevantMemories(context, enhancedContext.relevantMemories);

// 控制上下文长度
const trimmedContext = integration.controlContextLength(contextWithMemories, 8000);
```

### MemoryGraph 集成

**文件**: `memory-graph-integration.js`（待实现）

**功能**:
- 实现双写控制（本地 + 云端）
- 实现记忆同步
- 实现记忆合并
- 实现 MemoryBridge

### TaskScientist 集成

**文件**: `task-scientist-integration.js`（待实现）

**功能**:
- 集成混合搜索
- 获取相关上下文
- 增强搜索结果

## 配置

每个集成模块都可以独立配置：

```javascript
// ContextEnhancer 集成配置
integration.configure({
  injectUserProfile: true,
  injectRelevantMemories: true,
  maxMemories: 5,
  cacheEnabled: true
});
```

## 降级策略

所有集成模块都实现了降级策略：
- 当 Supermemory 不可用时，自动降级到原有功能
- 记录降级事件
- 不影响 HundunOS 核心功能

## 监控

每个集成模块都提供元数据：

```javascript
const metadata = enhancedContext.metadata;
console.log('启用状态:', metadata.enabled);
console.log('缓存命中:', metadata.cacheHit);
console.log('响应时间:', metadata.responseTime);
console.log('降级状态:', metadata.fallback);
```
