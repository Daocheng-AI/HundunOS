# HundunOS v4.1 API 文档

## 概述

HundunOS 是一个基于 Node.js 的智能操作系统内核，采用微内核 + Mixin 组合架构。
**当前版本**: v4.1.0（含 Mixin 组合重构 + AdvancedSearcher + TaskGoalParser）

### 核心架构（v4.1）

```
kernel/core.js (Facade → core.v4.js)
  └─ core.v4.js
       └─ MixinFactory.create(CoreMixin, ModuleMixin, ProcessMixin, SessionMixin, RestMixin)
            ├─ CoreMixin       ← 核心状态管理
            ├─ ModuleMixin     ← 20+ 模块初始化编排（Phase 1-8）
            ├─ ProcessMixin    ← 消息处理管线
            ├─ SessionMixin    ← 会话管理
            └─ RestMixin       ← REST API + Hook 系统

kernel/mixins/
  ├─ MixinFactory.js      ← Mixin 组合工厂
  ├─ CoreMixin.js         ← 核心状态/生命周期
  ├─ ModuleMixin.js       ← 模块发现与初始化
  ├─ ProcessMixin.js      ← 消息处理
  ├─ SessionMixin.js      ← 会话管理
  └─ RestMixin.js         ← REST API + Hook

vendor/hundunos-rust/
  └─ hundunos-core        ← TCP:38082 统一守护进程
      ├─ tool-bridge      ← Rust 工具执行
      ├─ memory-graph     ← 记忆图谱
      ├─ model-router    ← 模型路由
      └─ task-scientist  ← BFTS 搜索
```

### 新增模块索引（v3.8）

| 模块 | 文档 |
|------|------|
| TaskScientist BFTS | [task-scientist-api.md](./task-scientist-api.md) |
| Custom Skill 系统 | [../kernel/skills/README.md](../kernel/skills/README.md) |
| Rust 集成 | [rust-api-contract.md](./rust-api-contract.md) |

## 概述

## 快速开始

```javascript
// v4.1: core.js 是 Facade，直接导出 CoreKernelV4
import { CoreKernel } from 'hundunos/kernel/core.js';

const kernel = new CoreKernel();
await kernel.initialize();

// 处理消息
const result = await kernel.process({ content: '帮我搜索文件' });

// 通过 messageBus 订阅事件（v4.1 事件总线）
kernel.messageBus.on('kernel:ready', (info) => {
    // review: removed // review: removed console.log(`Kernel ready in ${info.elapsed}ms`);
});
```

## 核心模块

### Kernel（v4.1 Facade 模式）

核心引擎，通过 Mixin 组合所有模块能力。

```javascript
// core.js 是 Facade，导出的是 Mixin 组合后的 CoreKernelV4
import { CoreKernel } from 'hundunos/kernel/core.js';

const kernel = new CoreKernel({
  platform: 'windows',
  storage: './data'
});

await kernel.initialize();
await kernel.shutdown();
```

### IntentEngine

意图识别引擎。

```javascript
import { IntentEngine } from 'hundunos/kernel/intent-engine.js';

const engine = new IntentEngine();
const intent = engine.parse('帮我搜索文件');
// { type: 'search', action: 'file_search', confidence: 0.95 }
```

### ModelRouter

模型路由与调度。

```javascript
import { ModelRouter, StrategyType } from 'hundunos/kernel/model-router/index.js';

const router = new ModelRouter();
router.addProvider('ollama', ollamaProvider);

// 选择最佳模型
const model = router.select(task, StrategyType.BALANCED);
```

## 扩展模块

### edict (三省六部)

任务管理与调度系统。

```javascript
import { processMessage } from 'hundunos/stable-modules/edict/core/index.js';

const result = await processMessage('user_001', '帮我写一个Python脚本');
// { status: 'done', edictId: 'edict_xxx', result: {...} }
```

### RBAC

角色权限控制。

```javascript
import { RBACManager, Role } from 'hundunos/stable-modules/rbac/index.js';

const rbac = new RBACManager();
rbac.registerUser('user_001', Role.DEVELOPER);

if (rbac.hasPermission('user_001', 'write')) {
  // 允许写入
}
```

### HealthMonitor

健康监控。

```javascript
import { HealthMonitor } from 'hundunos/stable-modules/health-monitor/index.js';

const monitor = new HealthMonitor();
monitor.registerChecker('cron', async () => ({ score: 100 }));

const health = await monitor.checkAll();
// review: removed // review: removed console.log(health.overall); // 综合评分
```

### REST API

HTTP API 服务。

```javascript
import { RestAPI } from 'hundunos/shell/rest-api/index.js';

const api = new RestAPI({ port: 38080 });

api.get('/api/status', async (ctx) => ({
  status: 'ok',
  uptime: process.uptime()
}));

await api.start();
```

## 配置

系统配置位于 `config/system.json`:

```json
{
  "version": "3.0.0",
  "platform": "windows",
  "kernel": {
    "maxTasks": 100,
    "timeout": 30000
  },
  "modelRouter": {
    "defaultStrategy": "balanced",
    "providers": ["ollama", "anthropic", "openai"]
  }
}
```

## 事件系统（v4.1 messageBus）

所有模块通过统一 MessageBus 订阅/发布事件（不再是 `kernel.on`）:

```javascript
// 通过 messageBus 订阅事件
kernel.messageBus.on('task_complete', (event) => {
  // review: removed // review: removed console.log('任务完成:', event.taskId);
});

kernel.messageBus.on('kernel:ready', (info) => {
  // review: removed // review: removed console.log(`Kernel ready: ${info.elapsed}ms, ${info.modules} modules`);
});

// 发布事件
kernel.messageBus.publish('my_event', { data: 'value' });
```

## REST API 与限流

内核内置 REST API 服务器（通过 `config/system.json` 配置）：

```json
{
  "restApi": { "port": 38081 },
  "rateLimit": {
    "windowMs": 60000,
    "maxRequests": 60,
    "burstMax": 10
  }
}
```

可用端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（不限流） |
| POST | `/api/process` | 处理消息（含限流） |
| GET | `/api/status` | 内核状态（含限流） |
| GET | `/api/intents` | 意图列表 |
| POST | `/api/intents/reload` | 热重载外部意图 |
| GET | `/api/rate-limit/stats` | 限流统计 |

**内置限流响应头**：`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`、`Retry-After`（RFC 6585）

## 意图热插拔

意图引擎支持从 `config/intents/*.json` 目录热加载外部意图，无需修改源码：

```json
[
  {
    "name": "database_query",
    "type": "database",
    "action": "query",
    "priority": 10,
    "patterns": ["查询数据库", "SELECT.*FROM"],
    "extract": { "type": "sql_parser" }
  }
]
```

运行时 API：
```javascript
// 注册新意图（无需重启）
kernel.intentEngine.register({ name: 'my_intent', type: 'custom', action: 'run',
  patterns: [/my_pattern/], extract: () => ({}) });

// 卸载意图
kernel.intentEngine.unregister('my_intent');

// 热重载所有外部意图文件
await kernel.intentEngine.reload();
```

## 安全加固（v3.0.1）

- **升级源白名单**：仅信任 `file:///C:/ProgramData/HundunOS/updates/` 等固定路径，移除通配符（`C:/Users/*/`）以防止本地提权攻击
- **内核 REST API 内置令牌桶限流**（60 req/min，默认）
- **Nginx 配置**：集成速率限制 zone（`api`、`auth`、`upload`）和完整安全响应头
- **Prometheus 监控**：新增 HundunOS 应用告警规则（高错误率、Ollama 下线、内存告警）

## 更多文档

- [架构设计](./architecture.md)
- [模块开发指南](./module-development.md)
- [配置参考](./configuration.md)
- [部署指南](./deployment.md)
