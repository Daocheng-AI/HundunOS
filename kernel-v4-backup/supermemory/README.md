# Supermemory 集成模块

本模块负责将 Supermemory 的先进记忆管理能力集成到 HundunOS 系统中，提升 HundunOS 的长期记忆、用户画像、知识检索和上下文管理能力。

## 目录结构

- `types/` - TypeScript 类型定义
- `adapters/` - Supermemory API 适配器实现
- `bridges/` - 记忆桥接器（本地与云端）
- `managers/` - 管理器实现（缓存、同步、批量操作等）
- `utils/` - 工具函数

## 核心功能

1. **Supermemory API 集成** - 封装 Supermemory API 调用
2. **用户画像增强** - 管理用户静态特征和动态上下文
3. **混合搜索** - 结合 RAG 和 Memory 的混合搜索
4. **事实提取** - 自动从对话中提取结构化事实
5. **记忆同步** - 本地记忆与云端记忆的双向同步
6. **缓存管理** - 多层缓存机制提升性能
7. **错误处理** - 完善的错误处理和降级机制

## 使用方式

```javascript
// 在 HundunOS 内核中初始化
const { SupermemoryMixin } = require('./supermemory/supermemory-mixin.js');
const supermemoryMixin = new SupermemoryMixin();
await supermemoryMixin.init_supermemory(kernel);

// 使用 Supermemory 功能
const profile = await supermemoryMixin.getUserProfile();
const memories = await supermemoryMixin.searchMemories('TypeScript');
await supermemoryMixin.addMemory('用户偏好使用 TypeScript');
```

## 示例代码

查看 `examples.js` 文件获取更多使用示例：

```bash
node kernel/supermemory/examples.js
```

示例包括：
1. 基本用法
2. 批量操作
3. 缓存管理
4. ContextEnhancer 集成
5. MemoryGraph 集成
6. 错误处理和降级
7. 配置管理
8. 完整工作流程

## 配置

在 `config/system.json` 中添加 Supermemory 配置：

```json
{
  "supermemory": {
    "enabled": true,
    "apiKey": "${SUPERMEMORY_API_KEY}",
    "baseUrl": "https://api.supermemory.ai/v3",
    "cache": {
      "enabled": true,
      "ttl": 600000
    }
  }
}
```

## 相关文档

- [需求规格](../../../.codeartsdoer/specs/supermemory_integration/spec.md)
- [技术设计](../../../.codeartsdoer/specs/supermemory_integration/design.md)
- [实现任务](../../../.codeartsdoer/specs/supermemory_integration/tasks.md)
