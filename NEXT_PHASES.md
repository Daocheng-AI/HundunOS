# HundunOS 下一期规划：自定义 Skill 系统 + IDE 集成

> 优先级排序依据：用户体验价值 × 实现成本 × 与现有架构的契合度

---

## 背景

v3.6 已完成 Claude Code 优化（Feature Flag / Tool 调度 / Context 增强 / Agent Team / MCP / Provider 兼容 / Computer Use / Proactive / Compact）。下一期聚焦**让用户自定义 Agent 能力**和**深度 IDE 集成**，参考 Claude Code 的 `skills/` 和 IDE 插件架构。

---

## Phase 1：自定义 Skill 系统（约 2-3 周）

### 目标
让用户通过配置文件（YAML/JSON）定义 Agent 可用的技能，Skill 是结构化的工具集+提示模板。

### 架构设计

```
kernel/
  skills/
    skill-registry.js     # Skill 注册表（发现/加载/执行）
    skill-runner.js       # Skill 执行引擎（沙箱隔离）
    skills/
      github.yaml         # 示例 Skill：GitHub Issues/PR 操作
      database.yaml       # 示例 Skill：SQL 查询/迁移
      api-tester.yaml     # 示例 Skill：HTTP API 测试
      doc-gen.yaml        # 示例 Skill：文档生成
    examples/
      README.md           # Skill 编写指南
```

### Skill 定义格式（YAML）

```yaml
# hundunos/skills/skills/github.yaml
name: github
version: 1.0.0
description: GitHub Issues、PR、Actions 管理

# 触发条件
trigger:
  patterns:
    - "github"
    - "issue"
    - "pull request"
    - "github action"
  semantic: true  # 语义匹配（调用 LLM 判断）

# Skill 专有工具
tools:
  - id: github_list_issues
    type: http
    endpoint: https://api.github.com/repos/{owner}/{repo}/issues
    method: GET
    auth: env.GITHUB_TOKEN

  - id: github_create_issue
    type: http
    endpoint: https://api.github.com/repos/{owner}/{repo}/issues
    method: POST
    body_template: |
      { "title": "{{title}}", "body": "{{body}}", "labels": {{labels}} }

# System prompt 注入
system_prompt: |
  你是一个 GitHub 助手。当用户提到 GitHub 相关任务时：
  - 优先使用 GitHub REST API v3
  - 使用 Issues 管理任务追踪
  - Actions 用于 CI/CD 自动化

# 执行模式
execution:
  isolation: process   # process | sandbox | none
  timeout: 60000
  retry: 3
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `skill-registry.js` | 扫描 skills/ 目录，加载 YAML，触发匹配 |
| `skill-runner.js` | 在隔离进程中执行 Skill，收集结果 |
| `SkillMatcher` | LLM 驱动的触发判断（非纯关键词） |
| `SkillContextInjector` | 将 Skill 注入 system prompt |
| `SkillMarket` | 远程 Skill 商店（从 URL/文件加载） |

### 关键 API

```javascript
// 注册自定义 Skill
kernel.skills.register({
  name: 'my-skill',
  tools: [...],
  systemPrompt: '...',
});

// 查找匹配的 Skill
const matched = await kernel.skills.match('帮我创建一个 GitHub issue');

// 执行 Skill
const result = await kernel.skills.run('github', { owner: '...', repo: '...' });
```

---

## Phase 2：IDE 集成（约 3-4 周）

### 目标
让 HundunOS 深度集成主流 IDE（Cursor / VS Code / JetBrains），提供内联 AI 助手体验。

### 集成架构

```
extension/
  cursor/        # Cursor IDE 插件
  vscode/        # VS Code 插件
  jetbrains/     # JetBrains 插件（IntelliJ/PyCharm/...）
  common/       # LSP 协议 + 共享通信层
    lsp-server.js    # Language Server Protocol 服务端
    websocket-bridge.js  # IDE ↔ Kernel WebSocket 桥接
    protocol.js      # 自定义 LSP 扩展
```

### IDE 插件功能

| 功能 | 说明 | 技术 |
|------|------|------|
| **内联补全** | AI 代码补全（Tab 键接受） | LSP `textDocument/completion` |
| **对话面板** | IDE 内置 AI 聊天窗口 | WebView + WebSocket |
| **选区解释** | 选中代码 → 解释/重构 | LSP `textDocument/hover` 扩展 |
| **增量修复** | 诊断错误 → 一键 AI 修复 | LSP `textDocument/codeAction` |
| **终端集成** | IDE 终端 → HundunOS Agent | 自定义 LSP extension |
| **文件变更** | 文件修改 → 实时 Agent 通知 | File Watcher + LSP |

### 通信协议

```
IDE 插件 ←→ WebSocket ←→ kernel/infrastructure/ide-bridge.js ←→ Kernel Agent
```

```javascript
// kernel/ide-bridge.js
class IdeBridge {
  // LSP 风格协议
  async handleIdeMessage(msg) {
    switch (msg.method) {
      case 'ai/complete':
        return this.agent.complete(msg.params);
      case 'ai/explain':
        return this.agent.explain(msg.params);
      case 'ai/fix':
        return this.agent.fix(msg.params);
      case 'ai/chat':
        return this.agent.chat(msg.params);
    }
  }
}
```

### 关键文件

```
extension/
  common/
    protocol.js          # IDE ↔ Kernel 通信协议
    websocket-server.js  # WebSocket 服务（IDE 连接）
    lsp-adapter.js        # LSP ↔ HundunOS 协议转换
  cursor/
    extension.js          # Cursor 插件入口
    package.json
  vscode/
    extension.js
    package.json
  jetbrains/
    build.gradle.kts
    src/main/kotlin/...
  README.md               # 插件开发指南
```

---

## Phase 3：高级能力探索（可选，约 4-6 周）

### 3.1 多模态理解
- 图片输入支持（截图 → AI 分析 → 操作）
- PDF/Word 文档解析
- 架构图生成

### 3.2 协作模式
- 多人共享同一个 HundunOS 实例
- 基于 CRDT 的实时状态同步
- 会话共享 / 托管模式

### 3.3 本地模型支持
- Ollama 集成（Llama3 / Mistral / CodeLlama）
- LM Studio 兼容
- 本地模型作为 fallback

---

## 实施路线图

```
Week 1-2:   Phase 1 — Skill 注册表 + YAML 解析 + 示例 Skill
Week 3-4:   Phase 1 — Skill Matcher + Runner + Market
Week 5-7:   Phase 2 — IDE Bridge + Cursor 插件 + WebSocket 协议
Week 8-10:  Phase 2 — VS Code / JetBrains 插件
Week 11+:   Phase 3（可选）
```

---

## 依赖关系

```
Phase 1 (Skill) 是 Phase 2 (IDE) 的基础
  Skill Registry → IDE 插件可以调用任意 Skill
  IDE 内置 Skill 市场 → 用户安装/管理 Skill
```

---

## 风险与注意事项

1. **Skill 安全隔离**：用户自定义 Skill 可能在隔离进程执行，防止恶意代码
2. **IDE 插件签名**：VS Code/Cursor 要求扩展签名，Cursor 相对宽松
3. **LSP 兼容性**：IDE LSP 实现差异大，需要多版本测试
4. **WebSocket 安全**：IDE 连接需认证，防止未授权访问
