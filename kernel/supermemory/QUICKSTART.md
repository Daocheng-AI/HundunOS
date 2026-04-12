# Supermemory 集成快速开始指南

## 🚀 快速开始

### 1. 配置 Supermemory

#### 步骤 1：获取 API 密钥

访问 [Supermemory](https://supermemory.ai) 注册账号并获取 API 密钥。

#### 步骤 2：配置环境变量

在项目根目录创建或编辑 `.env` 文件：

```env
SUPERMEMORY_API_KEY=your_api_key_here
```

#### 步骤 3：配置系统配置

在 `config/system.json` 中添加 Supermemory 配置：

```json
{
  "supermemory": {
    "enabled": true,
    "apiKey": "${SUPERMEMORY_API_KEY}",
    "baseUrl": "https://api.supermemory.ai/v3",
    "apiVersion": "v3",
    "containerTagStrategy": "user",
    "cache": {
      "enabled": true,
      "ttl": 600000,
      "maxSize": 1000,
      "persistent": false
    },
    "retry": {
      "maxAttempts": 3,
      "delay": 1000,
      "backoffMultiplier": 2
    },
    "timeout": {
      "connect": 5000,
      "read": 5000
    }
  }
}
```

### 2. 在 HundunOS 中注册

在 `kernel/mixins/ModuleMixin.js` 的 `_initPhase6_rust` 方法中添加：

```javascript
async _initPhase6_rust(kernel) {
  // ... 原有代码 ...

  // Supermemory 集成
  if (kernel.config.system.supermemory?.enabled) {
    try {
      const { SupermemoryMixin } = await import('../supermemory/supermemory-mixin.js');
      const supermemoryMixin = new SupermemoryMixin();
      await supermemoryMixin.init_supermemory(kernel);
      kernel._modules.supermemory = supermemoryMixin;
      console.log('[Kernel] Supermemory integration initialized');
    } catch (e) {
      console.warn('[Kernel] Supermemory integration failed:', e.message);
    }
  }
}
```

### 3. 使用 Supermemory

#### 基本用法

```javascript
// 检查 Supermemory 是否已初始化
if (kernel._modules.supermemory) {
  const supermemory = kernel._modules.supermemory;

  // 获取用户画像
  const profile = await supermemory.getUserProfile();
  console.log('用户画像:', profile);

  // 添加记忆
  const memory = await supermemory.addMemory('用户偏好使用 TypeScript');
  console.log('已添加记忆:', memory);

  // 搜索记忆
  const results = await supermemory.searchMemories('TypeScript');
  console.log('搜索结果:', results);

  // 混合搜索
  const hybridResults = await supermemory.hybridSearch('认证迁移');
  console.log('混合搜索结果:', hybridResults);
}
```

#### 高级用法

```javascript
// 批量添加记忆
const memories = [
  { content: '用户偏好使用 TypeScript', metadata: { source: 'user' } },
  { content: '用户正在处理认证迁移', metadata: { source: 'user' } }
];
const batchResult = await supermemory.batchAddMemories(memories);
console.log('批量添加结果:', batchResult);

// 刷新用户画像
const refreshedProfile = await supermemory.refreshUserProfile();
console.log('刷新后的用户画像:', refreshedProfile);

// 获取缓存统计
const stats = await supermemory.getCacheStats();
console.log('缓存统计:', stats);

// 清除缓存
await supermemory.clearCache('profile:*');

// 健康检查
const health = await supermemory.checkSupermemoryHealth();
console.log('健康状态:', health);

// 启用离线模式
supermemory.enableOfflineMode();

// 检查是否为离线模式
const isOffline = supermemory.isOfflineMode();
console.log('离线模式:', isOffline);
```

### 4. 在其他模块中使用

#### 在 ContextEnhancer 中使用

```javascript
class ContextEnhancer {
  async buildEnhancedContext(options) {
    let context = this.buildBaseContext(options);

    // 注入用户画像
    if (kernel._modules.supermemory) {
      try {
        const profile = await kernel._modules.supermemory.getUserProfile();
        context = this.injectUserProfile(context, profile);
      } catch (error) {
        console.warn('获取用户画像失败，使用降级策略');
      }
    }

    return context;
  }
}
```

#### 在 MemoryGraph 中使用

```javascript
class MemoryGraph {
  async record(message, intent, result) {
    // 记录到本地记忆
    const localMemory = await this.recordLocal(message, intent, result);

    // 同步到 Supermemory
    if (kernel._modules.supermemory) {
      try {
        await kernel._modules.supermemory.addMemory(message.content);
      } catch (error) {
        console.warn('同步到 Supermemory 失败:', error.message);
      }
    }

    return localMemory;
  }
}
```

## 📝 配置说明

### 容器标签策略

Supermemory 支持三种容器标签策略：

1. **user** - 按用户隔离（推荐）
   ```json
   "containerTagStrategy": "user"
   ```

2. **project** - 按项目隔离
   ```json
   "containerTagStrategy": "project"
   ```

3. **custom** - 自定义标签
   ```json
   "containerTagStrategy": "custom",
   "customContainerTag": "my_custom_tag"
   ```

### 缓存配置

```json
"cache": {
  "enabled": true,           // 是否启用缓存
  "ttl": 600000,            // 缓存过期时间（毫秒）
  "maxSize": 1000,          // 最大缓存条目数
  "persistent": false       // 是否持久化到数据库
}
```

### 重试配置

```json
"retry": {
  "maxAttempts": 3,         // 最大重试次数
  "delay": 1000,            // 初始延迟（毫秒）
  "backoffMultiplier": 2    // 退避倍数
}
```

### 超时配置

```json
"timeout": {
  "connect": 5000,          // 连接超时（毫秒）
  "read": 5000              // 读取超时（毫秒）
}
```

## 🔍 故障排查

### 问题：Supermemory 初始化失败

**解决方案：**

1. 检查 API 密钥是否正确配置
2. 检查网络连接是否正常
3. 查看错误日志：
   ```javascript
   console.error('[SupermemoryMixin] 初始化失败:', error.message);
   ```

### 问题：API 调用失败

**解决方案：**

1. 检查 API 密钥是否有效
2. 检查网络连接
3. 查看健康检查状态：
   ```javascript
   const health = await supermemory.checkSupermemoryHealth();
   console.log('健康状态:', health);
   ```

### 问题：缓存未命中

**解决方案：**

1. 检查缓存是否启用
2. 查看缓存统计：
   ```javascript
   const stats = await supermemory.getCacheStats();
   console.log('缓存统计:', stats);
   ```

### 问题：离线模式未启用

**解决方案：**

手动启用离线模式：
```javascript
supermemory.enableOfflineMode();
```

## 📚 更多资源

- [需求规格](../../../.codeartsdoer/specs/supermemory_integration/spec.md)
- [技术设计](../../../.codeartsdoer/specs/supermemory_integration/design.md)
- [实现任务](../../../.codeartsdoer/specs/supermemory_integration/tasks.md)
- [实现总结](./IMPLEMENTATION_SUMMARY.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
