# Supermemory 集成部署指南

本指南将帮助你完成 Supermemory 与 HundunOS 的集成部署。

## 📋 前置要求

1. ✅ Supermemory API 密钥（从 https://supermemory.ai 获取）
2. ✅ HundunOS 项目已克隆
3. ✅ Node.js 20+ 已安装

## 🚀 快速部署步骤

### 步骤 1：获取 Supermemory API 密钥

1. 访问 https://supermemory.ai
2. 注册账号并登录
3. 在设置中生成 API 密钥
4. 复制 API 密钥（格式：`sk_xxxxxxxxxxxxx`）

### 步骤 2：配置环境变量

在 HundunOS 项目根目录创建 `.env` 文件：

```bash
cd c:\Users\Lin\.qclaw\workspace\hundunos
```

创建 `.env` 文件并添加：

```env
SUPERMEMORY_API_KEY=sk_your_actual_api_key_here
```

**注意**：
- 将 `sk_your_actual_api_key_here` 替换为你真实的 API 密钥
- 不要将 `.env` 文件提交到版本控制系统（已在 `.gitignore` 中）
- 也可以使用 `.env.example` 作为模板

### 步骤 3：启用 Supermemory 配置

编辑 `config/system.json` 文件，找到 `supermemory` 配置部分：

```json
{
  "supermemory": {
    "enabled": true,  // 将 false 改为 true
    "apiKey": "${SUPERMEMORY_API_KEY}",
    "baseUrl": "https://api.supermemory.ai/v3",
    ...
  }
}
```

**重要**：将 `"enabled": false` 改为 `"enabled": true`

### 步骤 4：验证配置

检查以下文件是否正确配置：

1. `.env` 文件存在且包含 `SUPERMEMORY_API_KEY`
2. `config/system.json` 中 `supermemory.enabled` 为 `true`
3. `kernel/mixins/ModuleMixin.js` 中已添加 Supermemory 初始化代码

### 步骤 5：启动 HundunOS

```bash
npm start
```

或者使用其他启动命令：
```bash
node index.js
```

### 步骤 6：验证集成

启动后，你应该在日志中看到：
```
[Kernel] Supermemory integration initialized
```

如果看到警告而不是错误，说明集成已启用但可能需要 API 密钥：
```
[Kernel] Supermemory integration failed: ...
```

### 步骤 7：测试功能

运行示例代码测试功能：
```bash
node kernel/supermemory/examples.js
```

## 🔧 配置选项说明

### 基础配置

```json
{
  "supermemory": {
    "enabled": true,                    // 是否启用 Supermemory 集成
    "apiKey": "${SUPERMEMORY_API_KEY}", // API 密钥（从环境变量读取）
    "baseUrl": "https://api.supermemory.ai/v3",  // API 基础 URL
    "apiVersion": "v3"                   // API 版本
  }
}
```

### 容器标签策略

```json
{
  "containerTagStrategy": "user",          // 策略：user / project / custom
  "customContainerTag": ""                 // 自定义标签（仅当策略为 custom 时使用）
}
```

- `user`：按用户隔离（推荐）
- `project`：按项目隔离
- `custom`：使用自定义标签

### 缓存配置

```json
{
  "cache": {
    "enabled": true,          // 是否启用缓存
    "ttl": 600000,            // 缓存过期时间（毫秒）= 10 分钟
    "maxSize": 1000,          // 最大缓存条目数
    "persistent": false       // 是否持久化到数据库
  }
}
```

### 重试配置

```json
{
  "retry": {
    "maxAttempts": 3,        // 最大重试次数
    "delay": 1000,            // 初始延迟（毫秒）
    "backoffMultiplier": 2    // 退避倍数（指数退避）
  }
}
```

### 超时配置

```json
{
  "timeout": {
    "connect": 5000,          // 连接超时（毫秒）
    "read": 5000              // 读取超时（毫秒）
  }
}
```

### 批量操作配置

```json
{
  "batch": {
    "enabled": true,                 // 是否启用批量操作
    "maxBatchSize": 100,             // 每批最大数量
    "maxConcurrentBatches": 5        // 最大并发批数
  }
}
```

### 同步配置

```json
{
  "sync": {
    "enabled": false,                // 是否启用自动同步
    "interval": 3600000,              // 同步间隔（毫秒）= 1 小时
    "autoResolveConflicts": false    // 是否自动解决冲突
  }
}
```

### 自动保存配置

```json
{
  "autoSave": {
    "enabled": true,          // 是否启用自动保存
    "mode": "smart"            // 模式：always / smart
  }
}
```

- `always`：总是保存所有对话
- `smart`：仅保存包含事实的消息（推荐）

### 离线模式配置

```json
{
  "offline": {
    "enabled": true,                 // 是否启用离线模式
    "autoReconnect": true,            // 是否自动重连
    "reconnectInterval": 30000         // 重连间隔（毫秒）= 30 秒
  }
}
```

### 监控配置

```json
{
  "monitoring": {
    "enabled": true,                  // 是否启用监控
    "logLevel": "info",                // 日志级别：debug / info / warn / error
    "alertThreshold": {
      "errorRate": 0.1,               // 错误率阈值（10%）
      "responseTime": 5000             // 响应时间阈值（5 秒）
    }
  }
}
```

## 🐛 故障排查

### 问题 1：Supermemory 未初始化

**症状**：启动 HundunOS 后没有看到 Supermemory 初始化日志

**解决方案**：
1. 检查 `config/system.json` 中 `supermemory.enabled` 是否为 `true`
2. 检查 `.env` 文件是否存在且包含 `SUPERMEMORY_API_KEY`
3. 检查 `kernel/mixins/ModuleMixin.js` 中是否已添加 Supermemory 初始化代码

### 问题 2：API 密钥无效

**症状**：日志显示 `Supermemory integration failed: API key invalid`

**解决方案**：
1. 检查 `.env` 文件中的 API 密钥是否正确
2. 确保 API 密钥格式正确（以 `sk_` 开头）
3. 尝试重新生成 API 密钥

### 问题 3：网络连接失败

**症状**：日志显示 `Supermemory integration failed: Network error`

**解决方案**：
1. 检查网络连接
2. 检查防火墙设置
3. 检查 `baseUrl` 配置是否正确
4. 启用离线模式：`"offline.enabled": true`

### 问题 4：配置文件格式错误

**症状**：HundunOS 启动失败，报配置解析错误

**解决方案**：
1. 使用 JSON 验证工具检查 `config/system.json` 格式
2. 确保所有引号、逗号、大括号都正确
3. 检查是否有语法错误

## 📊 监控和日志

### 查看日志

Supermemory 集成的日志包含以下信息：

- `[Kernel] Supermemory integration initialized` - 初始化成功
- `[Kernel] Supermemory integration failed` - 初始化失败
- `[SupermemoryAdapter] ...` - API 调用相关日志
- `[SupermemoryMixin] ...` - Mixin 相关日志
- `[ErrorHandler] ...` - 错误处理相关日志
- `[CacheManager] ...` - 缓存相关日志

### 查看缓存统计

```javascript
const stats = await kernel._modules.supermemory.getCacheStats();
console.log('缓存统计:', stats);
```

### 健康检查

```javascript
const health = await kernel._modules.supermemory.checkSupermemoryHealth();
console.log('健康状态:', health);
```

## 🔐 安全建议

1. **不要提交 .env 文件**：确保 `.env` 在 `.gitignore` 中
2. **使用环境变量**：敏感信息通过环境变量传递
3. **定期轮换密钥**：定期更换 Supermemory API 密钥
4. **限制权限**：确保 API 密钥只具有必要的权限
5. **监控使用量**：定期检查 API 使用量和费用

## 📝 配置检查清单

部署前，请检查以下项目：

- [ ] 已获取 Supermemory API 密钥
- [ ] 已创建 `.env` 文件并配置 API 密钥
- [ ] 已在 `config/system.json` 中启用 Supermemory（`enabled: true`）
- [ ] 已在 `kernel/mixins/ModuleMixin.js` 中注册 SupermemoryMixin
- [ ] 已验证 JSON 配置文件格式正确
- [ ] 已测试网络连接
- [ ] 已阅读快速开始指南

## 🎯 下一步

配置完成后，你可以：

1. **运行示例代码**：`node kernel/supermemory/examples.js`
2. **查看文档**：阅读 `README.md` 和 `QUICKSTART.md`
3. **开始使用**：在 HundunOS 中使用 Supermemory 功能
4. **监控状态**：定期检查健康状态和缓存统计

## 📞 获取帮助

如果遇到问题：

1. 查看故障排查部分
2. 查看日志输出
3. 查看示例代码
4. 查看 API 文档

祝你使用愉快！
