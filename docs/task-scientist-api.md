# HundunOS v3.8 — TaskScientist API 文档

> BFTS（Best-First Tree Search）智能任务编排 — Rust Engine + JS Fallback

---

## 概述

TaskScientist 是 HundunOS 的**智能任务编排层**，通过 Best-First Tree Search（最佳优先树搜索）算法，将复杂任务分解为可探索的节点树，优先执行最有希望的路径。

### 核心架构

```
kernel.taskScientist (Phase 5)
├── rustAdapter     → adapters/rust-modules/task-scientist.js (优先)
├── jsFallback      → JSFallbackOrchestrator (Rust 不可用时)
├── runTask()       → create + BFTS 全自动
├── analyzeTask()   → confidence score
└── shouldUseBFTS() → kernel 编排决策
```

---

## REST API

### GET /api/task-scientist

状态总览。

**响应**:
```json
{
  "enabled": true,
  "rustAvailable": true,
  "engine": "rust",
  "activeTasks": 2,
  "recentHistory": [
    { "taskId": "abc-123", "stage": "implementing", "engine": "rust", "createdAt": "..." }
  ]
}
```

---

### POST /api/task-scientist/analyze

分析任务是否适合 BFTS。

**Body**:
```json
{ "task": "实现 REST API 认证系统" }
```

**响应**:
```json
{
  "suitable": true,
  "confidence": 0.72,
  "threshold": 0.5,
  "reasons": [
    "包含强信号: '实现' (+0.4)",
    "多阶段任务，适合 BFTS 分解"
  ]
}
```

**信号检测**:

| 类型 | 关键词 | 置信度加成 |
|------|--------|-----------|
| 强信号 | 实现, 构建, 测试, 部署, 架构, implement, build, deploy | +0.4 |
| 中等信号 | 多文件, 批量, 自动化, script, refactor | +0.2 |
| 弱信号 | 是什么, 怎么用, 翻译, 查找, 查询 | −0.3 |

---

### POST /api/task-scientist/tasks

创建 BFTS 任务。

**Body**:
```json
{
  "task": "实现支付流程",
  "context": {
    "stages": ["验证订单", "发起支付", "处理回调"],
    "title": "支付模块",
    "initial_code": null
  }
}
```

**响应**:
```json
{
  "taskId": "ts-abc123",
  "stage": "idle",
  "engine": "rust",
  "rootNode": "root-abc"
}
```

---

### POST /api/task-scientist/tasks/:id/run

运行 BFTS。

**响应**:
```json
{
  "journal": {
    "nodes": [
      { "id": "root-abc", "action": "analyze", "depth": 0, "score": 1.0 },
      { "id": "child-1", "parent": "root-abc", "action": "implement", "depth": 1, "score": 0.85 }
    ],
    "best_node": "child-1"
  },
  "bestNode": "child-1",
  "iterations": 3,
  "engine": "rust"
}
```

---

### GET /api/task-scientist/tasks/:id

获取 Journal + 统计。

**响应**:
```json
{
  "taskId": "ts-abc123",
  "journal": { "nodes": [...], "best_node": "child-1" },
  "stats": {
    "total_nodes": 4,
    "root_nodes": 1,
    "leaf_nodes": 2,
    "max_depth": 2,
    "best_node": "child-1",
    "stage": "implementing",
    "created_at": "..."
  }
}
```

---

### DELETE /api/task-scientist/tasks/:id

删除任务。

**响应**: `{ "deleted": true, "taskId": "ts-abc123" }`

---

## JS API

### TaskScientist 编排层

```javascript
const kernel = await HundunOSKernel.create();
const ts = kernel.taskScientist;

// 初始化
await ts.initialize();

// 分析任务适合度
const analysis = ts.analyzeTask('实现 REST API');
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(analysis.suitable, analysis.confidence);

// 创建任务
const { taskId } = await ts.createTask('实现 REST API', { stages: ['路由', '控制器'] });

// 运行 BFTS
const result = await ts.runBFTS(taskId);
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(result.journal, result.bestNode);

// 全自动
const auto = await ts.runTask('实现认证系统', { stages: ['分析', '实现', '测试'] });
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(auto.journal, auto.stats);

// 编排决策（kernel 调用）
const decision = ts.shouldUseBFTS('重构登录模块', { type: 'code', subtype: 'refactor' });
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(decision.use, decision.engine);

// 事件监听
ts.on('bfts_complete', ({ taskId, iterations }) => {
    // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(`BFTS 完成: ${iterations} 次迭代`);
});
```

---

## CLI 工具

```bash
# 状态总览
node scripts/ts-cli.js status

# 分析任务适合度
node scripts/ts-cli.js analyze "实现 REST API"

# 创建任务
node scripts/ts-cli.js create "重构认证模块" --stages=分析,实现,测试

# 运行 BFTS
node scripts/ts-cli.js run <taskId>

# 获取任务详情
node scripts/ts-cli.js get <taskId>

# 列出任务
node scripts/ts-cli.js list

# 显示统计
node scripts/ts-cli.js stats <taskId>

# 删除任务
node scripts/ts-cli.js delete <taskId>
```

---

## JS Fallback Orchestrator

当 Rust TaskScientist 不可用时，自动降级到纯 JS 实现。

```javascript
import { JSFallbackOrchestrator } from '../kernel/task-scientist.js';

const orch = new JSFallbackOrchestrator();

// 创建任务
const { taskId } = await orch.createTask('实现计数器', { stages: ['分析', '实现'] });

// 运行 BFTS（JS 模拟）
const result = await orch.runBFTS(taskId);
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(result.iterations, result.journal);

// 获取统计
const stats = await orch.getStats(taskId);
// review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed // review: removed console.log(stats.total_nodes, stats.max_depth);

// 列出所有任务
const tasks = orch.listTasks();

// 删除任务
await orch.deleteTask(taskId);
```

---

## 事件

| 事件 | 参数 | 说明 |
|------|------|------|
| `task_created` | `{ taskId, engine }` | 任务创建完成 |
| `node_executed` | `{ taskId, nodeId, action }` | 节点执行 |
| `bfts_complete` | `{ taskId, iterations, bestNode }` | BFTS 搜索完成 |
| `task_deleted` | `{ taskId }` | 任务删除 |

---

## 错误处理

```javascript
// 任务不存在
await orch.getStats('fake-id');
// Error: 任务不存在: fake-id

// Rust 不可用时自动降级
const ts = new TaskScientist(kernel);
// getStatus().engine === 'js'（降级模式）
```
