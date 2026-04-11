# HundunOS v3.9 — Custom Skill System

> Phase 6 新增：用户可自定义 Skill，让 HundunOS 掌握任意领域的专业能力
> v3.9 新增：PromptHub 移植模块 — Skill 验证器 + 跨平台分发

---

## 概述

Skill 是**结构化的能力扩展包**，包含：
- **触发条件**（关键词 + 语义匹配）
- **专用工具集**（HTTP / Shell / Function）
- **System Prompt 注入**（为 Agent 注入专业知识）

```
Skill 加载流程：
用户查询 → SkillRegistry.match() → SkillContextInjector.inject()
                                              ↓
                                     System Prompt 增强
                                              ↓
                                         LLM Agent
                                              ↓
                                     SkillRunner.run()
                                              ↓
                                       工具执行
```

---

## v3.9 新增模块（PromptHub 移植）

### skill-validator.js — Skill 验证器

提供标准化的 Skill 名称验证和 SKILL.md 解析：

```javascript
import { validateSkillName, parseSkillMd, validateSkillDef } from './kernel/skills/index.js';

// 验证 Skill 名称（kebab-case，1-64字符）
validateSkillName('my-skill');  // true
validateSkillName('MySkill');   // false - 必须小写
validateSkillName('skill--test'); // false - 不能连续连字符

// 解析 SKILL.md frontmatter
const parsed = parseSkillMd(`
---
name: github-helper
version: 1.0.0
description: GitHub operations
tags: [github, git]
---
Instructions here...
`);

// 验证 Skill 定义对象
const result = validateSkillDef({
  name: 'my-skill',
  version: '1.0.0',
  tools: [{ id: 'create', type: 'http' }]
});
```

### platform-bridge.js — 跨平台 Skill 分发

一键将 Skill 安装到多个 AI 平台：

```javascript
import {
  SKILL_PLATFORMS,
  detectInstalledPlatforms,
  installSkillMd,
  installToPlatform,
  installToMultiplePlatforms,
} from './kernel/skills/index.js';

// 检测已安装的平台
detectInstalledPlatforms(); // ['openclaw', 'claude', ...]

// 安装到单个平台
await installSkillMd('my-skill', skillMdContent, 'claude');

// 安装到多个平台（自动创建符号链接）
await installToMultiplePlatforms('my-skill', skillMdContent, ['claude', 'cursor', 'openclaw']);

// 安装 MCP 配置到 Claude Desktop
await installToPlatform('claude-desktop', 'my-mcp-skill', {
  command: 'node',
  args: ['server.js']
});
```

### 支持的平台

| 平台 | ID | 类型 | 说明 |
|------|-----|------|------|
| Claude Code | `claude` | skill-md | ~/.claude/skills/ |
| Claude Desktop | `claude-desktop` | mcp | MCP config |
| Cursor | `cursor` | mcp | ~/.cursor/mcp.json |
| Windsurf | `windsurf` | mcp | ~/.windsurf/mcp.json |
| OpenClaw | `openclaw` | skill-md | ~/.openclaw/skills/ |
| HundunOS | `hundunos` | skill-md | ~/.hundunos/skills/ |

---

## 目录结构

```
kernel/skills/
├── skill-registry.js          ← Skill 发现 / 注册 / 匹配
├── skill-runner.js             ← 隔离执行引擎（HTTP/Shell/Function）
├── skill-context-injector.js  ← System Prompt 注入
├── skill-validator.js          ← v3.9 名称验证 / SKILL.md 解析
├── platform-bridge.js          ← v3.9 跨平台分发
├── skill-market.js             ← 远程 Skill 安装
├── skills/                    ← Skill 定义（YAML）
│   ├── github.yaml            ← GitHub Issues/PR/Actions 管理
│   ├── database.yaml          ← SQL/Migration/Schema 分析
│   └── api-tester.yaml        ← REST API 测试套件
└── README.md                  ← 本文档
```

---

## 快速开始

### 1. 创建 Skill（YAML）

```yaml
# kernel/skills/skills/my-skill.yaml
name: my-skill
version: 1.0.0
description: 我的自定义 Skill

trigger:
  patterns:
    - 触发词1
    - 触发词2
  semantic: true   # 开启语义匹配

tools:
  - id: my_tool
    type: http
    endpoint: https://api.example.com/{{param}}
    method: GET
    auth: env.MY_API_KEY

system_prompt: |
  你是一个 XX 领域专家...

execution:
  isolation: process
  timeout: 30000
  retry: 2
```

### 2. 在代码中调用

```javascript
const kernel = await HundunOSKernel.create();

// 获取最佳匹配的 Skill
const matches = await kernel.skills.match('帮我操作 GitHub issue');
// review: removed // review: removed console.log(matches);

// 注入到 System Prompt
const { systemPrompt, injectedSkills } = await kernel.skills.inject('帮我操作 GitHub issue');
// 将 systemPrompt 传给 LLM

// 执行 Skill
const result = await kernel.skills.run('github', {
    owner: 'my-org',
    repo: 'my-repo',
    title: '修复登录 bug',
    body: '描述...',
});
// review: removed // review: removed console.log(result);
```

### 3. REST API

```
GET  /api/skills              → 所有已加载的 Skill
GET  /api/skills/:name        → 单个 Skill 详情
POST /api/skills/match        → Body: { query } → 匹配结果
POST /api/skills/run          → Body: { name, params } → 执行结果
POST /api/skills/register     → 注册新 Skill（YAML 或 JSON）
DELETE /api/skills/:name      → 注销 Skill
```

---

## 工具类型

### HTTP 工具
```yaml
- id: my_api
  type: http
  endpoint: https://api.example.com/{{path}}
  method: POST
  auth: env.API_KEY
  body_template: '{"data": "{{value}}"}'
```

### Shell 工具
```yaml
- id: run_script
  type: shell
  command: node scripts/{{script}}.js --arg {{value}}
  isolation: process   # process = 独立进程，none = 当前进程
```

### Function 工具
```yaml
- id: process_data
  type: function
  fn: |
    async (params) => {
      return { processed: params.data.toUpperCase() };
    }
```

---

## 触发条件

| 字段 | 类型 | 说明 |
|------|------|------|
| `patterns` | string[] | 关键词匹配 |
| `semantic` | boolean | 是否启用 LLM 语义匹配（默认 true）|

语义匹配分数计算：
- 精确触发词匹配：+0.8
- 包含触发词：+0.5
- 描述相关性词：+0.15/词
- 工具 ID 匹配：+0.2
- LLM 语义分数 × 0.7

---

## 安全注意事项

1. **隔离执行**：`isolation: process` 保护主进程
2. **环境变量**：`auth: env.VAR_NAME` 避免硬编码密钥
3. **审计日志**：所有 Skill 执行记录在审计日志
4. **超时控制**：默认 60s，防止挂起
5. **重试机制**：可配置 `retry: N`，指数退避

---

## 编写指南

- [ ] 一个 Skill 解决**一类**问题，不要贪多
- [ ] System Prompt 简洁明了，提供关键约束
- [ ] HTTP 端点必须模板化，支持参数注入
- [ ] 添加 `examples`，帮助 Agent 理解调用方式
- [ ] 测试验证：加载后运行 `match()` 确认触发词生效

---

## SkillMarket（Phase 7 新增）

> 远程 Skill 安装与管理：从 URL、Gist、GitHub 安装 Skill

### 概述

SkillMarket 是 SkillRegistry 的扩展，提供远程 Skill 安装能力：
- **官方内置**：4 个预置 Skill（github / database / api-tester / filesystem）
- **URL 安装**：直接指定 YAML 内容 URL
- **Gist 安装**：从 GitHub Gist 加载
- **GitHub 安装**：从仓库路径解析 SKILL.md

### 使用方式

```javascript
// 列出官方 Skill
const market = kernel.skills.market;
market.list();

// 安装远程 Skill
const result = await market.install('https://example.com/my-skill.yaml');

// 从 Gist 安装
const gistResult = await market.install('https://gist.github.com/user/xxx');

// 从 GitHub 安装
const ghResult = await market.install('github:owner/repo/path');

// 卸载
market.uninstall('my-skill');
```

### REST API

```
GET  /api/skills/market              → 列出官方 Skill
POST /api/skills/market/install      → Body: { url, options } → 安装结果
DELETE /api/skills/market/:name      → 卸载指定 Skill
```

### 注意事项

1. **安全**：安装前请检查 Skill 来源，避免执行未知代码
2. **版本**：支持 semver 格式版本约束（`>=1.0.0`）
3. **缓存**：已安装 Skill 有本地缓存，重复安装从缓存加载
4. **隔离**：远程 Skill 执行与本地 Skill 相同隔离机制
