# Phase 4 新特性文档

**版本**: v4.1  
**发布日期**: 2026-04-10  
**变更类型**: 功能增强 + 安全加固

---

## 🆕 新特性概览

Phase 4 引入 5 项核心优化：

| 特性 | 文件 | 说明 |
|------|------|------|
| 敏感路径保护 | `kernel/policy-engine.js` | 52 条硬编码敏感路径，不可覆盖 |
| Hook 拦截链 | `kernel/hooks/index.js` | Pre/Post 拦截，支持参数修改 |
| 对话压缩 | `kernel/mixins/ProcessMixin.js` | 自动压缩超长对话 |
| YAML Frontmatter | `kernel/skills/skill-loader.js` | SKILL.md 元数据解析 |
| Permission 模式 | `kernel/permission-*.js` | 4 种权限模式 |

---

## 🔒 1. 敏感路径硬编码保护

### 功能说明
系统内置 52 条敏感路径模式，阻止访问 SSH 密钥、云凭证等敏感文件。

### 受保护路径示例
```
**/.ssh/*
**/.aws/credentials
**/.config/gcloud/*
**/.kube/config
**/.env*
**/.gnupg/*
```

### 使用方式
```javascript
import { SENSITIVE_PATH_PATTERNS } from './kernel/policy-engine.js';

// 检查路径是否敏感
const policy = new PolicyEngine();
const result = policy.checkSensitivePath('/home/user/.ssh/id_rsa');
// result: { allowed: false, blocked: true, level: 'critical' }
```

### 安全特性
- ✅ **不可覆盖**：用户配置无法绕过敏感路径规则
- ✅ **审计日志**：每次访问尝试都被记录
- ✅ **跨平台**：支持 Windows/macOS/Linux 路径格式

---

## 🔗 2. Hook Pre/Post 拦截链

### 功能说明
增强 Hook 系统，支持 Pre-hook 修改参数，Post-hook 访问结果。

### 使用方式

#### 基础执行
```javascript
import { HookEvent, HookExecutor } from './kernel/hooks/index.js';

const hooks = new HookExecutor();

// 注册 Pre-hook（可修改参数）
hooks.register(HookEvent.PRE_TOOL_USE, async (event, payload) => {
  // review: removed // review: removed console.log(`即将执行: ${payload.tool_name}`);
  // 修改参数
  return { 
    blocked: false, 
    modifiedInput: { 
      tool_input: { ...payload.tool_input, audited: true }
    }
  };
});

// 注册 Post-hook（只读）
hooks.register(HookEvent.POST_TOOL_USE, async (event, payload) => {
  // review: removed // review: removed console.log(`执行完成: ${payload.tool_name}`);
  // review: removed // review: removed console.log(`结果: ${JSON.stringify(payload.result)}`);
});
```

#### 简化工具执行
```javascript
const result = await hooks.executeWithHooks(
  'ReadFile',
  { path: '/etc/passwd' },
  async (input) => fs.readFile(input.path, 'utf-8')
);
```

### Hook 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| command | 执行命令 | `echo "audit" >> log.txt` |
| http | HTTP 请求 | 发送审计日志 |
| prompt | LLM 验证 | 安全性检查 |
| agent | Agent 执行 | 复杂验证逻辑 |

---

## 💬 3. 对话压缩机制

### 功能说明
当对话超过 Token 阈值时，自动压缩历史消息，保持上下文连续性。

### 配置
```javascript
const COMPACT_CONFIG = {
  contextWindowThreshold: 12000,  // Token 阈值
  maxHistoryRounds: 10,           // 保留最近 N 轮
  summaryModel: 'glm-4-flash',    // 摘要模型
  compressionStrategy: 'hybrid',  // 策略: llm | truncate | hybrid
};
```

### 压缩策略

| 策略 | 说明 |
|------|------|
| `truncate` | 保留系统提示 + 最近 N 轮 |
| `llm` | LLM 摘要早期对话 |
| `hybrid` | 简化工具调用 + LLM 摘要（默认） |

### 使用方式
```javascript
// 在 ProcessMixin 中自动触发
const messages = buildMessages(prompt);
const tokenCount = await estimateTokens(messages);

if (tokenCount > COMPACT_CONFIG.contextWindowThreshold) {
  const compressed = await compactMessages(messages);
  // 系统提示 + 摘要 + 最近对话
}
```

### 用户感知
压缩发生时，用户会收到流式通知：
```
[对话压缩] 上下文过长，正在压缩早期消息...
[对话压缩] 完成，保留最近 10 轮对话
```

---

## 📝 4. YAML Frontmatter 解析

### 功能说明
支持 SKILL.md 文件中的 YAML Frontmatter 元数据解析。

### SKILL.md 格式
```markdown
---
name: git-helper
description: Git 操作助手
version: 1.0.0
tags: [git, github, vcs]
triggers:
  patterns: ['git', 'commit', 'branch']
---

# Git Helper

这是一个帮助用户执行 Git 命令的技能...
```

### 使用方式
```javascript
import { parseSkillMarkdown, loadSkillFromMarkdown } from './kernel/skills/skill-loader.js';

// 解析 Markdown
const content = fs.readFileSync('skills/git-helper.md', 'utf-8');
const skill = parseSkillMarkdown('git-helper', content);

// 结果
{
  name: 'git-helper',
  description: 'Git 操作助手',
  version: '1.0.0',
  tags: ['git', 'github', 'vcs'],
  trigger: { patterns: ['git', 'commit', 'branch'] },
  body: '# Git Helper\n\n这是一个帮助...'
}
```

### Fallback 机制
1. 优先使用 YAML Frontmatter
2. 无 Frontmatter 时从 `# 标题` 提取名称
3. 从首段提取描述

---

## 🛡️ 5. Permission 模式扩展

### 功能说明
引入 4 种权限模式，精细控制工具执行权限。

### 权限模式

| 模式 | 读操作 | 写操作(本地) | 写操作(外部) |
|------|--------|--------------|--------------|
| **HAUL** | ✅ | ✅ | ✅ |
| **LOCAL** | ✅ | ✅ | ⚠️ 确认 |
| **ASK** | ✅ | ⚠️ 确认 | ⚠️ 确认 |
| **RESTRICTED** | ✅ | ❌ | ❌ |

### 使用方式
```javascript
import { PermissionMode, PermissionDecision, PermissionPipeline } from './kernel/permission-pipeline.js';

const pipeline = new PermissionPipeline(PermissionMode.LOCAL);

// 评估工具调用
const decision = pipeline.evaluate(
  { name: 'WriteFile', path: '/home/project/config.json', isReadOnly: false },
  { projectRoot: '/home/project' }
);

// 结果
{
  allowed: true,
  requiresConfirmation: false,
  reason: 'Within project root',
  level: 'info'
}
```

### PermissionDecision 类
```javascript
class PermissionDecision {
  allowed: boolean              // 是否允许
  requiresConfirmation: boolean // 是否需要确认
  reason: string                // 决策原因
  level: 'info' | 'warning' | 'error'  // 日志级别
}
```

### 模式选择建议
- **HAUL**: 沙盒/测试环境，完全信任
- **LOCAL**: 日常开发，本地项目自由，外部需确认
- **ASK**: 生产环境，所有变更需确认
- **RESTRICTED**: 只读审计模式

---

## 📦 依赖更新

```json
{
  "dependencies": {
    "minimatch": "^9.0.3"  // 新增，用于敏感路径匹配
  }
}
```

---

## 🔄 向后兼容

所有变更保持向后兼容：
- 旧 PermissionMode 自动映射到新命名
- 敏感路径检查在原有流程中插入，不影响现有逻辑
- YAML Frontmatter 无则使用 Fallback 机制

---

## 🧪 测试验证

运行测试验证新特性：
```bash
npm test
```

预期结果：
- ✅ 65/65 测试通过
- ✅ 52 个模块全部导入成功
- ✅ 敏感路径访问被拒绝
- ✅ Hook 拦截链正常工作

---

## 📚 相关文档

- [OpenHarness 评估报告](./openharness-assessment.md)
- [优化方案](./openharness-hundunos-optimization-plan.md)
- [实施总结](./implementation-summary.md)

---

*文档版本: v4.1*  
*最后更新: 2026-04-10*
