# HundunOS TODO 跟踪清单

本文档跟踪项目中的所有 TODO、FIXME 和 XXX 注释，便于优先级排序和任务分配。

**生成日期**: 2026-04-15  
**状态**: 活跃

---

## 📋 总览

| 优先级 | 数量 | 描述 |
|--------|------|------|
| 🔴 高 | 0 | 阻碍发布的关键问题 |
| 🟡 中 | 1 | 功能增强和优化 |
| 🟢 低 | 2 | 文档和代码质量改进 |
| **总计** | **3** | - |

---

## 🔴 高优先级 (P0)

*暂无高优先级 TODO*

---

## 🟡 中优先级 (P1)

### P1-1: 实现推送通知逻辑

**位置**: `kernel/mobile-api.js:127`  
**类型**: 功能缺失  
**描述**: 移动端 API 的推送通知功能尚未实现

**当前代码**:
```javascript
// TODO: 实现推送通知逻辑（当前仅记录日志）
console.log('[MobileAPI] Push notification requested');
```

**建议方案**:
1. 集成第三方推送服务（Firebase Cloud Messaging / 极光推送）
2. 实现 WebSocket 长连接推送
3. 使用操作系统原生通知 API

**影响范围**: 移动端功能  
**预计工作量**: 2-3 天  
**标签**: `enhancement`, `mobile`, `p1`

---

## 🟢 低优先级 (P2)

### P2-1: 文档说明 - 环境变量检查模式

**位置**: `kernel/config/README-v2.md:387` 和 `kernel/config/README.md:301`  
**类型**: 文档说明  
**描述**: 文档中提到使用 `process.env.XXX` 直接检查环境变量值

**当前内容**:
```markdown
3. 使用 `process.env.XXX` 直接检查环境变量值
```

**建议**: 
- 此为文档说明，非实际 TODO
- 考虑是否需要更新为更现代化的配置验证方式（如 Zod、Joi）

**影响范围**: 文档  
**预计工作量**: 0.5 天  
**标签**: `documentation`, `config`, `p2`

---

## 📝 已完成的 TODO

### ✅ SEC-02: 路径遍历防护

**位置**: `kernel/utils.js`  
**状态**: 已完成 (2026-04-14)  
**描述**: 实现路径遍历防护，使用 `path.resolve()` + 白名单验证

### ✅ SEC-05: 命令注入防护

**位置**: `kernel/skills/skill-runner.js`  
**状态**: 已完成 (2026-04-14)  
**描述**: 禁用 `shell: true`，使用参数化调用

### ✅ 代码注入防护

**位置**: `kernel/ai/agent-sdk/expression-sandbox.js`  
**状态**: 已完成 (2026-04-14)  
**描述**: 使用 Node.js `vm` 模块替代已废弃的 `vm2`

### ✅ AccessControlManager Implicit Deny

**位置**: `kernel/security.js`  
**状态**: 已完成 (2026-04-14)  
**描述**: 实现 implicit deny，无策略时返回 `allowed: false`

---

## 📊 统计信息

### 按类型分布
- 功能缺失：1
- 文档说明：2
- 安全修复：4 (已完成)

### 按模块分布
- Kernel Core: 2
- Config: 2
- Mobile API: 1
- Security: 3 (已完成)

### 解决率
- **已完成**: 4 (57%)
- **待处理**: 3 (43%)

---

## 🎯 下一步行动

1. **立即处理**: 无高优先级 TODO
2. **本周计划**: P1-1 推送通知功能调研
3. **本月计划**: 文档更新和配置优化

---

## 📌 维护指南

### 添加新的 TODO
当在代码审查中发现 TODO 注释时：
1. 记录 TODO 位置（文件：行号）
2. 评估优先级（P0/P1/P2）
3. 描述问题和建议方案
4. 添加到本文档

### 标记为已完成
当 TODO 被解决时：
1. 移动到"已完成的 TODO"章节
2. 添加完成日期
3. 简要描述解决方案
4. 更新统计信息

### 定期清理
- 每月审查一次 TODO 清单
- 关闭过时或不再相关的 TODO
- 重新评估优先级

---

## 🔗 相关链接

- [GitHub Issues](https://github.com/hundunos/hundunos/issues)
- [项目看板](https://github.com/hundunos/hundunos/projects)
- [代码审查指南](docs/code-review.md)
- [贡献指南](CONTRIBUTING.md)

---

*本文档由 HundunOS 自动化审计工具生成和维护*
