# HundunOS Rust Modules — Unified API Contract v1.0

> 定义 HundunOS JS 编排层与 Rust Core 之间所有通信的 API 契约。
> 状态：**Phase 1 交付物** | 更新：2026-04-09

---

## 1. 背景：当前协议碎片化问题

当前五个 JS wrapper 向 Rust 二进制发送的请求格式存在结构性差异：

| 模块 | JS Wrapper 请求格式 | Rust main.rs 期望格式 | 状态 |
|------|-------------------|---------------------|------|
| `tool-bridge` | `{ action: 'Execute', request: {...} }` | `ToolBridgeRequest::Execute { request }` | ✅ 匹配 |
| `memory-graph` | `{ Record: { content, intent, result } }` | `MemoryRequest::Record { ... }` (tagged enum) | ✅ 匹配 |
| `model-router` | `{ Route: { content, task_type, max_tokens } }` | `ModelRouterRequest::Route { ... }` | ✅ 匹配 |
| `policy-engine` | `{ CheckFileRead: { path } }` | `PolicyRequest::CheckFileRead { ... }` | ✅ 匹配 |
| `task-scientist` | （尚无 wrapper） | `ScientistRequest::...` | ⚠️ 缺失 |

**结论**：当前各模块内部格式是**自洽的**，但存在两个问题：
1. **tool-bridge** 使用 `action`+`request` 嵌套格式，其余四个使用 flat tagged enum——不统一但可接受
2. **task-scientist** 没有 JS wrapper，无法与 JS Agent 流程集成

**Phase 1 策略**：不修改 Rust 源码（保持向后兼容），而是在 JS 适配层统一协议出口。后续演进统一到 JSON-RPC 2.0。

---

## 2. 当前生产协议（Currennt Production Format）

### 2.1 通信方式
- **传输层**：stdin/stdout（每次调用 spawn 一个 Rust 进程）
- **编码**：UTF-8 JSON，每行一个请求+一个响应
- **错误处理**：Rust panic → stderr 输出 → JS 捕获

### 2.2 Tool Bridge

**Binary 路径**：
```
hundunos-rust/target/release/hundunos-tool.exe
```

**请求格式**（JS wrapper `tool-bridge-rust.js`）：
```json
{ "action": "Execute", "request": { "command": "...", "timeout_ms": 30000 } }
```

**支持的 action**：

| action | params | 说明 |
|--------|--------|------|
| `Execute` | `{ request: ToolRequest }` | 执行命令 |
| `ExecuteStructured` | `{ request: StructuredCallRequest }` | 结构化调用（v4.0） |
| `GetStats` | `{}` | 获取执行统计 |
| `SetPolicy` | `{ policy: SecurityPolicy }` | 设置安全策略 |
| `Terminate` | `{ command_id: string }` | 终止命令 |
| `Schema` | `{ query: SchemaQuery }` | Schema 自省 |
| `Shortcuts` | `{ category?: string }` | 列出 Shortcuts |
| `Resolve` | `{ command: string }` | 解析命令（不执行） |
| `GetProviderMeta` | `{ key?: string }` | 获取 Provider 元数据 |

**ToolRequest 字段**：
```typescript
{
  command: string;           // 要执行的命令
  args?: string[];
  cwd?: string;               // 工作目录
  timeout_ms?: number;        // 超时（默认 30000）
  env?: Record<string, string>;
  pipe_commands?: string[];   // 管道命令
  max_output_size?: number;   // 最大输出字节（默认 10MB）
  max_memory_mb?: number;
  capture_stderr?: boolean;
  shortcut?: string;          // 快捷方式引用
  format?: string;
  dry_run?: boolean;          // v3.0：预览模式
}
```

**响应格式**：
```json
{ "success": true, "data": { ...ToolResponse }, "error": null }
```

### 2.3 Memory Graph

**Binary 路径**：
```
hundunos-rust/target/release/hundunos-memory.exe
```

**请求格式**（JS wrapper `memory-graph-rust.js`）：
```json
{ "Record": { "content": "...", "intent": "...", "result": true } }
```

**支持的 action**：

| action | params | 说明 |
|--------|--------|------|
| `Record` | `{ content, intent, result }` | 记录记忆节点 |
| `Recall` | `{ query: string }` | 回忆相关记忆 |
| `Search` | `{ query: string, limit?: number }` | 全文本搜索 |
| `SetContext` | `{ level, key, value, priority? }` | 设置层级上下文 |
| `GetContext` | `{ level, key }` | 获取上下文 |
| `GetContextChain` | `{}` | 获取完整上下文链 |
| `GetMemoryInjection` | `{ context, max_tokens? }` | 三级注入 |
| `Distill` | `{}` | 记忆蒸馏 |
| `CreateSnapshot` | `{}` | 创建快照 |
| `RestoreSnapshot` | `{ snapshot }` | 恢复快照 |
| `CleanupExpired` | `{}` | 清理过期记忆 |
| `GetStats` | `{}` | 获取统计 |
| `FtsSearch` | `{ query, limit?, layer_filter? }` | FTS5 搜索（v2.1） |
| `CompressSemantic` | `{}` | 语义压缩 |
| `SemanticSearch` | `{ query, top_k? }` | 语义搜索 |
| `GetSemanticCompressorStats` | `{}` | 压缩统计 |

**响应格式**：
```json
{ "success": true, "data": { ... }, "error": null }
```

### 2.4 Model Router

**Binary 路径**：
```
hundunos-rust/target/release/hundunos-router.exe
```

**请求格式**：
```json
{ "Route": { "content": "...", "task_type": "...", "max_tokens": 4096 } }
```

**支持的 action**：

| action | params | 说明 |
|--------|--------|------|
| `Route` | `{ content, task_type?, max_tokens?, prefer_local?, require_fast?, cost_budget? }` | 路由决策 |
| `RecordSuccess` | `{ provider_id }` | 记录成功 |
| `RecordFailure` | `{ provider_id, error }` | 记录失败 |
| `GetStats` | `{}` | 获取路由统计 |
| `GetProviders` | `{}` | 获取所有 Provider |
| `AddProvider` | `{ provider }` | 添加 Provider |
| `UpdateProvider` | `{ id, updates }` | 更新 Provider |

### 2.5 Policy Engine

**Binary 路径**：
```
hundunos-rust/target/release/hundunos-policy.exe
```

**请求格式**：
```json
{ "CheckFileRead": { "path": "/path/to/file" } }
{ "CheckFileWrite": { "path": "/path/to/file", "size?" } }
{ "CheckNetwork": { "url": "https://..." } }
{ "CheckTool": { "tool": "shell", "command": "rm -rf" } }
```

**支持的 action**：

| action | params | 说明 |
|--------|--------|------|
| `CheckFileRead` | `{ path }` | 检查文件读取权限 |
| `CheckFileWrite` | `{ path, size? }` | 检查文件写入权限 |
| `CheckFileDelete` | `{ path }` | 检查文件删除权限 |
| `CheckNetwork` | `{ url }` | 检查网络请求权限 |
| `CheckTool` | `{ tool, command }` | 检查工具执行权限 |
| `GetPolicy` | `{}` | 获取当前策略 |
| `SetPolicy` | `{ config }` | 设置策略配置 |

### 2.6 Task Scientist（尚无 JS wrapper）

**Binary 路径**：
```
hundunos-rust/target/release/hundunos-scientist.exe
```

**请求格式**（根据源码分析）：
```json
{ "CreateTask": { "task": "...", "context": {...} } }
{ "RunBFTS": { "task_id": "..." } }
{ "GetTaskResult": { "task_id": "..." } }
{ "GetStats": {} }
```

**支持的 action**：

| action | params | 说明 |
|--------|--------|------|
| `CreateTask` | `{ task, context }` | 创建实验任务 |
| `RunBFTS` | `{ task_id }` | 运行最佳优先树搜索 |
| `GetTaskResult` | `{ task_id }` | 获取任务结果 |
| `GetStats` | `{}` | 获取统计 |

---

## 3. 统一协议目标：JSON-RPC 2.0（v3.7+ 采用）

### 3.1 为什么选择 JSON-RPC 2.0

- **标准化**：业界最广泛使用的 RPC 协议
- **简单**：基于 JSON，无 HTTP 依赖
- **批量支持**：`batch` 模式支持一次发送多个请求
- **错误码规范**：内置错误码定义

### 3.2 统一请求格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "module": "tool",
  "method": "execute",
  "params": {
    "command": "git status",
    "timeout_ms": 5000
  }
}
```

### 3.3 统一响应格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... },
  "error": null
}
```

或错误响应：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": null,
  "error": {
    "code": -32001,
    "message": "Tool execution timeout",
    "data": { "timeout_ms": 5000 }
  }
}
```

### 3.4 统一错误码

| 码 | 常量 | 说明 |
|----|------|------|
| `-32700` | `PARSE_ERROR` | JSON 解析失败 |
| `-32600` | `INVALID_REQUEST` | 请求格式无效 |
| `-32601` | `METHOD_NOT_FOUND` | 方法不存在 |
| `-32602` | `INVALID_PARAMS` | 参数无效 |
| `-32603` | `INTERNAL_ERROR` | 内部错误 |
| `-32001` | `TIMEOUT` | 执行超时 |
| `-32002` | `RUST_PANIC` | Rust 进程 panic |
| `-32003` | `MODULE_UNAVAILABLE` | Rust 模块不可用 |

### 3.5 统一方法映射（v3.7+）

#### Tool Bridge (`module: "tool"`)
```
tool.execute         → tool_bridge::execute
tool.execute_structured → tool_bridge::execute_structured
tool.get_stats       → tool_bridge::get_stats
tool.set_policy      → tool_bridge::set_policy
tool.terminate        → tool_bridge::terminate
tool.schema          → tool_bridge::schema
tool.shortcuts       → tool_bridge::shortcuts
tool.resolve         → tool_bridge::resolve
tool.provider_meta   → tool_bridge::get_provider_meta
```

#### Memory Graph (`module: "memory"`)
```
memory.record           → memory_graph::record
memory.search           → memory_graph::search
memory.recall           → memory_graph::recall
memory.set_context      → memory_graph::set_context
memory.get_context      → memory_graph::get_context
memory.get_context_chain → memory_graph::get_context_chain
memory.inject           → memory_graph::get_memory_injection
memory.distill          → memory_graph::distill
memory.snapshot_create  → memory_graph::create_snapshot
memory.snapshot_restore → memory_graph::restore_snapshot
memory.cleanup          → memory_graph::cleanup_expired
memory.stats            → memory_graph::get_stats
memory.fts_search       → memory_graph::fts_search
memory.semantic_search  → memory_graph::semantic_search
```

#### Model Router (`module: "router"`)
```
router.route          → model_router::route
router.record_success → model_router::record_success
router.record_failure → model_router::record_failure
router.stats          → model_router::get_stats
router.providers      → model_router::get_providers
router.add_provider   → model_router::add_provider
router.update_provider → model_router::update_provider
```

#### Policy Engine (`module: "policy"`)
```
policy.check_file_read  → policy_engine::check_file_read
policy.check_file_write → policy_engine::check_file_write
policy.check_file_delete → policy_engine::check_file_delete
policy.check_network    → policy_engine::check_network
policy.check_tool       → policy_engine::check_tool
policy.get              → policy_engine::get_policy
policy.set              → policy_engine::set_policy
```

#### Task Scientist (`module: "scientist"`)
```
scientist.create   → task_scientist::create_task
scientist.run_bfts  → task_scientist::run_bfts
scientist.get_result → task_scientist::get_task_result
scientist.stats      → task_scientist::get_stats
```

---

## 4. 传输层演进路线

```
Phase 1 (当前)          Phase 2 (v3.7)        Phase 3 (v4.0)
[stdin/stdout]    →  [Unix Socket]     →  [HTTP/REST + NAPI-RS]
每次 spawn              长连接进程           嵌入 JS 运行时
延迟: ~50ms              延迟: ~1ms           延迟: ~0.1ms
```

### Phase 2: Unix Domain Socket（v3.7 目标）
- Rust Core 改为长连接 Unix Socket 服务器
- JS 适配层通过 socket 连接（而非每次 spawn）
- 协议保持 JSON-RPC 2.0 格式不变
- 路径：`/tmp/hundunos.sock`（Linux/macOS）或 `\\.\pipe\hundunos`（Windows）

### Phase 3: NAPI-RS（v4.0 目标）
- Rust 模块编译为 Node.js 原生 addon
- 直接在 JS 进程内调用，消除 IPC 开销
- `require('hundunos-core')` 即可使用

---

## 5. 健康检查协议

每个 Rust 模块必须实现 `health` 方法：

```json
// 请求
{ "health": {} }

// 响应
{
  "success": true,
  "data": {
    "module": "tool",
    "status": "healthy",
    "version": "4.0.0",
    "uptime_ms": 3600000,
    "rust_available": true,
    "last_error": null
  }
}
```

---

## 6. 路径规范

### 6.1 编译产物路径（当前）
```
hundunos-rust/target/release/
├── hundunos-tool.exe      # Tool Bridge
├── hundunos-memory.exe    # Memory Graph
├── hundunos-router.exe    # Model Router
├── hundunos-policy.exe    # Policy Engine
└── hundunos-scientist.exe # Task Scientist
```

### 6.2 合并后目标路径（v3.7+）
```
hundunos/vendor/hundunos-rust/target/release/
├── hundunos-core.exe      # 统一二进制（所有模块）
└── hundunos-core Debug.exe
```

### 6.3 通信 socket 路径
```
# Unix/macOS
/tmp/hundunos.sock

# Windows
\\.\pipe\hundunos
```

---

## 7. 版本兼容性

| 版本 | 协议 | 传输 | 说明 |
|------|------|------|------|
| v3.6 | 内部 JSON（各模块独立）| stdin/stdout | 当前生产 |
| v3.7 | JSON-RPC 2.0 | stdin/stdout 或 socket | 协议统一，兼容旧格式 |
| v4.0 | JSON-RPC 2.0 | NAPI-RS | 理想形态 |

---

## 8. 实现指南

### 8.1 JS 适配层入口（`adapters/rust-modules/index.js`）

```javascript
import { getTransport } from './transport.js';
import { ToolBridgeAdapter } from './tool-bridge.js';
import { MemoryGraphAdapter } from './memory-graph.js';
import { ModelRouterAdapter } from './model-router.js';
import { PolicyEngineAdapter } from './policy-engine.js';
import { TaskScientistAdapter } from './task-scientist.js';
import { checkHealth } from './health.js';

export class RustModules {
  constructor(config = {}) {
    this.transport = getTransport(config);
    this.tool = new ToolBridgeAdapter(this.transport);
    this.memory = new MemoryGraphAdapter(this.transport);
    this.router = new ModelRouterAdapter(this.transport);
    this.policy = new PolicyEngineAdapter(this.transport);
    this.scientist = new TaskScientistAdapter(this.transport);
  }

  async initialize() {
    await this.transport.connect();
    return await checkHealth(this.transport);
  }

  async close() {
    await this.transport.close();
  }
}
```

### 8.2 适配器模式（以 Tool Bridge 为例）

```javascript
// adapters/rust-modules/tool-bridge.js
export class ToolBridgeAdapter {
  constructor(transport) {
    this.transport = transport;
  }

  async execute(command, options = {}) {
    // 当前格式（向后兼容）
    const legacyReq = { action: 'Execute', request: { command, ...options } };

    // 尝试 JSON-RPC 2.0 格式（v3.7）
    const rpcReq = {
      jsonrpc: '2.0',
      id: nextId(),
      module: 'tool',
      method: 'execute',
      params: { command, ...options }
    };

    // transport 自动选择格式
    const resp = await this.transport.send(rpcReq);
    return resp.result ?? resp;
  }
}
```

---

## 9. 测试契约

每个 Rust 模块必须通过以下测试才能进入生产：

1. **单元测试**：`cargo test` 通过（Rust 源码内）
2. **协议契约测试**：JS 适配层 → Rust 二进制往返测试
3. **错误处理测试**：超时、panic、无效 JSON 的处理
4. **降级测试**：Rust 不可用时自动降级到 JS 实现

---

*本文档是 Phase 1 的核心交付物，是后续所有集成工作的基础。*
*维护者：HundunOS Core Team | 下次审查：v3.7 发布前*
