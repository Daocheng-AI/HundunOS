# HundunOS 优化升级方案 v3.1

> 基于 Claude Code 最佳实践深度分析

## 📋 项目现状分析

### 架构优势

| 方面 | 现状 | 评分 |
|------|------|------|
| 微内核架构 | ✅ 已实现，模块化清晰 | 9/10 |
| 意图引擎 | ✅ IntentEngine + 自定义扩展 | 8/10 |
| 权限系统 | ⚠️ 基础实现，需增强 | 6/10 |
| 记忆系统 | ✅ MemoryGraph + Rust 加速 | 8/10 |
| 安全机制 | ⚠️ 需要多层流水线 | 6/10 |
| Hooks 系统 | ❌ 未实现 | 0/10 |
| Skills 系统 | ⚠️ 基础实现，需渐进式加载 | 5/10 |
| Subagents | ⚠️ 有框架，需完善隔离 | 5/10 |

### 需要优化的关键点

1. **权限流水线** - 当前是单层检查，需要多层流水线
2. **路径校验优先级** - 需要硬约束，优先级高于 allow 规则
3. **Hooks 事件系统** - 需要完整实现 PreToolUse/PostToolUse 等
4. **Skills 渐进式加载** - 需要三级加载架构
5. **Subagents 隔离** - 需要上下文隔离和 Worktree 隔离

---

## 🎯 优化升级路线图

### Phase 1: 权限系统增强 (Week 1)

```
当前架构:
IntentEngine → PermissionGating (单层) → 执行

优化后架构:
IntentEngine → 权限流水线:
  ├── 第一层: 权限模式检查
  ├── 第二层: 规则匹配 (deny → ask → allow)
  ├── 第三层: 工具安全检查
  ├── 第四层: 路径校验 (硬约束)
  └── 最终决定: allow / ask / deny
```

### Phase 2: Hooks 系统 (Week 2)

```
事件类型:
├── SessionStart / SessionEnd
├── UserPromptSubmit
├── PreToolUse (可阻塞)
├── PostToolUse
├── PermissionRequest (可阻塞)
└── Stop (可阻塞)
```

### Phase 3: Skills 渐进式加载 (Week 3)

```
Level 1: 元数据 (~100 tokens/skill, 始终加载)
Level 2: 指令 (<5k tokens, 触发时加载)
Level 3: 资源 (按需加载, 通过 bash 执行)
```

### Phase 4: Subagents 隔离 (Week 4)

```
隔离级别:
├── context: fork (上下文隔离)
├── worktree: git worktree 隔离
└── background: 后台执行
```

---

## 🔧 详细实施计划

### 1. 权限流水线重构

**文件**: `kernel/permission-pipeline.js`

```javascript
// 多层权限检查流水线
async function checkPermission(toolUse, mode, engine) {
  // 第一层：权限模式检查
  const modeDecision = checkByMode(toolName, mode);
  if (modeDecision.decision !== 'continue') return modeDecision;

  // 第二层：规则匹配 (deny 优先)
  const ruleDecision = checkByRules(toolName, input, engine.rules);
  if (ruleDecision.decision !== 'continue') return ruleDecision;

  // 第三层：工具安全检查
  const tool = engine.tools.get(toolName);
  if (tool?.safetyCheck) {
    const safety = await tool.safetyCheck(input);
    if (safety.blocked) return { decision: 'deny', reason: safety.reason };
  }

  // 第四层：路径校验（硬约束，最高优先级）
  if (input.file_path || input.path) {
    const pathResult = validatePath(input.file_path || input.path, engine.workspaceRoot);
    if (pathResult.blocked) return { decision: 'deny', reason: pathResult.reason };
  }

  return { decision: 'ask' };
}
```

### 2. Hooks 系统实现

**文件**: `kernel/hooks/index.js`

```javascript
class HookExecutor {
  async trigger(eventName, input) {
    const eventHooks = this.hooks[eventName];
    if (!eventHooks) return null;

    for (const hookGroup of eventHooks) {
      if (!this._matches(input.tool_name, hookGroup.matcher)) continue;

      for (const hook of hookGroup.hooks) {
        const result = await this._executeHook(hook, input);
        if (result?.block) return result;
      }
    }
    return null;
  }
}
```

### 3. 路径校验硬约束

**文件**: `kernel/path-validation.js`

```javascript
const PROTECTED_PATHS = ['.git', '.env', 'credentials', 'secrets'];
const SENSITIVE_SYSTEM = ['/etc/passwd', 'C:\\Windows\\System32'];

function validatePath(filePath, workspaceRoot) {
  const resolved = path.resolve(filePath);

  // 1. 工作目录边界检查
  if (!resolved.startsWith(workspaceRoot)) {
    return { blocked: true, reason: '路径超出工作目录范围' };
  }

  // 2. 路径逃逸检查
  if (filePath.includes('..')) {
    return { blocked: true, reason: '检测到路径逃逸尝试' };
  }

  // 3. 受保护路径检查
  const relative = path.relative(workspaceRoot, resolved);
  for (const protected of PROTECTED_PATHS) {
    if (relative.startsWith(protected)) {
      return { blocked: true, reason: `受保护目录: ${protected}` };
    }
  }

  return { blocked: false };
}
```

---

## 📊 优化效果预期

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 权限检查层数 | 1 | 4 | +300% |
| 安全漏洞风险 | 中 | 低 | -70% |
| Hooks 事件支持 | 0 | 25+ | +∞ |
| Skills 加载效率 | 全量 | 渐进式 | -80% tokens |
| Subagent 隔离 | 无 | 3级 | +100% |

---

## 🚀 立即开始实施

接下来将创建以下核心文件：

1. `kernel/permission-pipeline.js` - 权限流水线
2. `kernel/path-validation.js` - 路径校验
3. `kernel/hooks/index.js` - Hooks 系统
4. `kernel/permission-mode.js` - 权限模式枚举
5. 更新 `stable-modules/permission-gating/index.js` - 集成新流水线
