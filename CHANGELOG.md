# HundunOS Changelog

## [v4.1.0] — 2026-04-10

> Mixin 组合架构重构 + CoworkMonitor 修复 + 文档更新

---

### 架构升级

#### MixinFactory 组合模式 (P1[5]) — 核心架构

- `kernel/core.js` 改为 Facade（15行）：`export { CoreKernelV4 as CoreKernel } from './core.v4.js'`
- `kernel/core.v4.js`：MixinFactory.create() 组合 5 个 Mixin
  - CoreMixin（核心状态）
  - ModuleMixin（20+ 模块初始化）
  - ProcessMixin（消息处理）
  - SessionMixin（会话管理）
  - RestMixin（REST API + Hook 系统）
- `kernel/mixins/MixinFactory.js`：移除 `init` 跳过逻辑，所有 Mixin 方法正确注册

**Bug 修复**:
- MixinFactory 不再跳过 `init` 方法复制（`if (name === 'constructor') continue`）
- ModuleMixin/RestMixin 添加 `init()` 存根方法（MixinFactory 验证要求）
- ModuleMixin 添加 `pathToFileURL()` `_r()` helper（Windows ESM 兼容）
- RestMixin 修复 5 处 `import()` 语法错误（多余括号）
- CoworkMonitor：`this.kernel.on()` → `this.kernel.messageBus.on()`

**测试**: full_test 65/65 ✅ | module_registry_test 13/13 ✅ | boundary_test 全部通过 ✅

### 文档更新

- `docs/README.md`：架构图更新为 v4.1 Mixin 模式，快速开始/API 示例更新
- `docs/IMPROVEMENTS.md`：追加 v4.1 改进记录

---

## [v3.9.0] — 2026-04-09

> 来源：PromptHub 源码深度学习 — Phase 1-3 全部完成 + 6 项扩展任务

---

### 新增模块（PromptHub 移植 + 扩展）

#### skill-validator.js — Skill 验证器 ✅

移植自 PromptHub `skill-validator.ts`，提供标准化 Skill 验证能力：

**名称验证规则：**
- 格式：kebab-case（小写字母 + 数字 + 单连字符）
- 长度：1-64 字符
- 禁止：开头/结尾连字符、连续连字符、特殊字符

**功能：**
- `validateSkillName(name)` — 验证名称格式
- `getSkillNameError(name)` — 获取详细错误信息
- `parseSkillMd(content)` — 解析 SKILL.md frontmatter
- `validateSkillMd(content, dirName)` — 验证 SKILL.md 完整性
- `validateSkillDef(def)` — 验证 HundunOS YAML Skill 定义
- `validateSkillPackage(folderPath)` — 验证 Skill 文件夹结构

---

#### platform-bridge.js — 跨平台 Skill 分发 ✅

移植自 PromptHub `skill-installer-platform.ts`，支持一键分发到多个 AI 平台：

**支持平台：**
| 平台 | ID | 类型 | 路径 |
|------|-----|------|------|
| Claude Code | `claude` | skill-md | ~/.claude/skills/ |
| Claude Desktop | `claude-desktop` | mcp | MCP config |
| Cursor | `cursor` | mcp | ~/.cursor/mcp.json |
| Windsurf | `windsurf` | mcp | ~/.windsurf/mcp.json |
| OpenClaw | `openclaw` | skill-md | ~/.openclaw/skills/ |
| HundunOS | `hundunos` | skill-md | ~/.hundunos/skills/ |

---

#### skill-remote.js — 远程安装 + SSRF 防护 ✅

移植自 PromptHub `skill-installer-remote.ts`：

**SSRF 防护：**
- 私有 IP 地址黑名单：10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、127.0.0.0/8
- 禁止主机名模式：localhost、*.local、*.internal、internal.*
- 协议限制：仅允许 HTTP/HTTPS
- 响应大小限制：默认 10MB
- 请求超时：默认 15 秒

---

#### skill-repo.js — 本地仓库管理 ✅

**功能：**
- `create(name, spec)` — 创建新 Skill
- `read(name)` — 读取 Skill 定义
- `update(name, updates)` — 更新 Skill
- `delete(name)` — 删除 Skill
- `list()` — 列出所有 Skill
- `importFromDir(sourceDir)` — 批量导入
- `exportToDir(skillNames, targetDir)` — 批量导出
- `findByTag(tag)` — 按标签搜索
- `searchByDescription(query)` — 按描述搜索

---

#### skill-version.js — 版本管理 ✅

**Semver 工具：**
- `parseVersion(version)` — 解析版本字符串
- `compareVersions(v1, v2)` — 比较版本
- `satisfies(version, constraint)` — 检查版本约束
- `incrementVersion(version, type)` — 增加版本号

**版本管理：**
- `createSnapshot(skillName, skillPath)` — 创建版本快照
- `restore(skillName, version, targetPath)` — 恢复到指定版本
- `listVersions(skillName)` — 列出所有版本
- `checkForUpdate(skillName, remoteUrl)` — 检测远程更新

---

#### skill-sync.js — WebDAV 云同步 ✅

**WebDAV 客户端：**
- `testConnection()` — 测试连接
- `list(remotePath)` — 列出目录内容
- `mkdir(remotePath)` — 创建目录
- `upload(remotePath, content)` — 上传文件
- `download(remotePath)` — 下载文件
- `delete(remotePath)` — 删除文件

**同步管理：**
- `upload(skillName)` — 上传 Skill 到云端
- `download(skillName)` — 从云端下载 Skill
- `sync()` — 双向同步
- `resolveConflict(skillName, resolution)` — 解决冲突
- 离线队列支持

---

### 扩展任务

#### Task 1: Rust 迁移 skill-validator ✅

`crates/skill-validator/` — 高性能 Rust 实现：

```rust
validate_skill_name(name)     // 验证 Skill 名称
parse_skill_md(content)       // 解析 SKILL.md
validate_skill_md(content)    // 验证 SKILL.md
validate_skill_def(def)       // 验证 Skill 定义
```

**特性：**
- napi-rs Node.js 绑定
- criterion 性能基准测试
- 零拷贝字符串处理

---

#### Task 2: Rust 迁移 skill-remote (SSRF 防护) ✅

`crates/skill-remote/` — 安全远程安装：

```rust
validate_url(url)             // SSRF 安全验证
SafeHttpClient::fetch(url)    // 安全 HTTP 获取
install_from_url(url)         // 从 URL 安装
```

**特性：**
- 私有 IP 范围检测（IPv4/IPv6）
- DNS 解析验证
- tokio 异步运行时

---

#### Task 3: Skill Testing Framework ✅

`kernel/skills/skill-tester.js`：

```javascript
// 创建 Mock 工具
const tools = createMockTools(['tool1', 'tool2']);

// 测试 Skill
const result = await testSkill('my-skill', {
  input: 'test input',
  tools,
});

// 断言
assertions.toolCalled(result, 'tool1');
assertions.noErrors(result);
```

**功能：**
- MockTool 工具模拟
- TestContext 执行上下文
- assertions 断言库
- TestSuite 测试套件

---

#### Task 4: Skill Registry Web UI ✅

`skill-registry-ui/` — React + Vite 构建：

**功能：**
- Skill 列表展示与搜索
- Monaco 编辑器在线编辑
- 平台选择器一键发布
- 版本历史时间线
- CLI 命令参考

---

#### Task 5: Package Registry ✅

`kernel/skills/skill-registry-server.js` — 类似 npm 的包管理：

```bash
# API 端点
GET  /search?q=github          # 搜索
GET  /package/:name            # 包信息
GET  /install/:name@version    # 安装
POST /publish                  # 发布
DELETE /package/:name@version  # 取消发布
```

**功能：**
- 本地 Registry 服务
- 版本管理
- 下载统计
- 废弃标记

---

#### Task 6: AI 自动生成 Skill ✅

`kernel/skills/skill-generator.js`：

```javascript
// 从描述生成
const result = await generateSkill('Notion database operations', {
  tools: ['create_database', 'query'],
});

// 从自然语言生成
const result = await generateFromNL('帮我创建一个 Notion 数据库操作的 Skill');

// 优化现有 Skill
const result = await generator.optimize(skillDef);
```

**功能：**
- 自然语言意图分析
- LLM 驱动生成
- Skill 优化建议
- 代码转 Skill

---

### 架构改进

#### Facade 模式重构（SkillManager）
- 统一入口整合所有组件
- **57 个导出项，19 个类**

#### 测试覆盖
- 25 个核心测试用例全部通过

---

### 文件变更

```
kernel/skills/
├── skill-validator.js       ← 新增（13KB）
├── platform-bridge.js       ← 新增（19KB）
├── skill-remote.js          ← 新增（15KB）
├── skill-repo.js            ← 新增（17KB）
├── skill-version.js         ← 新增（16KB）
├── skill-sync.js            ← 新增（20KB）
├── skill-tester.js          ← 新增（13KB）
├── skill-registry-server.js ← 新增（15KB）
├── skill-generator.js       ← 新增（13KB）
├── skill-manager.js         ← 更新（Facade 重构）
└── index.js                 ← 更新（57 个导出）

crates/
├── skill-validator/         ← 新增（Rust 实现）
│   ├── Cargo.toml
│   ├── src/lib.rs
│   ├── src/napi.rs
│   └── benches/validator_benchmark.rs
└── skill-remote/            ← 新增（Rust SSRF 防护）
    ├── Cargo.toml
    └── src/lib.rs

skill-registry-ui/           ← 新增（Web UI）
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx
    └── index.css

bin/
└── hundunos-skill-cli.js    ← 新增（13KB）
```

---

## [v3.8.1-patch2] — 2026-04-09

> 来源：Phase 7 复盘审查 — FIX-R0 关键集成缺口修复

---

### FIX-R0: TaskScientist × MemoryGraph BFTS 执行层深度集成 ✅

#### 问题描述
Phase 7 CHANGELOG 声称 `task-scientist.js runTask()` 中调用了 `memoryTool.getContextForTask()`，但源码中 `JSFallbackOrchestrator`（实际 BFTS 执行层）从未调用任何 `memoryTool` 方法。memoryTool 仅在 `core.js` 注入，从未在 BFTS 流程中使用。

#### 修复内容

**`kernel/task-scientist.js`**
- `JSFallbackOrchestrator.createTask()`: 改为 `async`，创建种子节点时调用 `memoryTool.getContextForTask()` 注入历史上下文
- `JSFallbackOrchestrator._createTaskSync()`: 新增内部同步方法，维持测试向后兼容
- `JSFallbackOrchestrator.runBFTS()`: 节点执行前调用 `memoryTool.enhanceNodePrompt()` 注入记忆增强提示
- `JSFallbackOrchestrator.setMemoryTool()`: 新增方法，将 memoryTool 注入 JS fallback 编排器
- `TaskScientist.setMemoryTool()`: 新增方法，传播到 `jsFallback`

**测试更新**
- `__tests__/task-scientist.test.js`: 新增 5 个 FIX-R0 集成测试

---
