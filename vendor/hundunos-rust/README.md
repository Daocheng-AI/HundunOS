# HundunOS Rust 迁移项目 v2.0

**创建日期**: 2026-04-03  
**升级日期**: 2026-04-07  
**版本**: v2.0 (edict-inspired)

---

## 项目概述

本项目用于逐步将 HundunOS 的核心模块从 JavaScript 迁移到 Rust，以提升性能和稳定性。

基于对 [edict](https://github.com/cft0808/edict) 项目的架构分析，v2.0 版本引入了多项增强功能。

---

## 模块迁移状态

| 模块 | 状态 | 版本 | 主要增强功能 |
|------|------|------|-------------|
| **Tool Bridge** | ✅ 已升级 | v2.0 | 管道命令、并发执行、安全策略、资源限制 |
| **Memory Graph** | ✅ 已升级 | v2.0 | 全文搜索、记忆蒸馏、TTL清理、三级记忆注入 |
| **Model Router** | ✅ 已升级 | v2.0 | LinUCB路由、成本优化、Token配额、热切换 |
| **Policy Engine** | ✅ 已升级 | v2.0 | Prompt注入检测、Agent权限矩阵、状态机集成 |

---

## v2.0 升级详情

### Tool Bridge (`tool-bridge/src/main.rs`)

#### 新增功能
- ✅ **管道命令支持**: `cmd1 | cmd2 | cmd3`
- ✅ **环境变量注入**: 动态设置执行环境
- ✅ **工作目录设置**: 指定命令执行路径
- ✅ **输出截断**: 防止内存溢出，支持 max_output_size
- ✅ **资源限制**: max_memory, max_output_size
- ✅ **安全策略**: 命令白名单/黑名单
- ✅ **并发执行**: Semaphore 控制最大并发数
- ✅ **执行统计**: 成功率、平均耗时、历史记录
- ✅ **优雅终止**: 超时后 kill 进程

#### API 扩展
```rust
pub struct ToolRequest {
    pub command: String,
    pub pipe_commands: Option<Vec<String>>,      // NEW
    pub max_output_size: Option<usize>,          // NEW
    pub max_memory_mb: Option<u64>,              // NEW
    pub env: Option<HashMap<String, String>>,
    pub cwd: Option<String>,
    pub timeout_ms: Option<u64>,
}
```

### Memory Graph (`memory-graph/src/main.rs`)

#### 新增功能
- ✅ **全文搜索**: 基于关键词的模糊匹配
- ✅ **记忆蒸馏**: 从大量交互提取关键信息
- ✅ **记忆快照**: 支持保存/恢复完整状态
- ✅ **相关性评分**: 搜索结果按相关性排序
- ✅ **三级记忆注入**: immediate/relevant/background (与 edict 对齐)
- ✅ **TTL 过期清理**: 自动清理过期记忆
- ✅ **记忆统计**: reads/writes/promotions/searches

#### API 扩展
```rust
pub enum MemoryRequest {
    Record { ... },
    Recall { query: String },
    Search { query: String, limit: Option<usize> },  // NEW
    GetMemoryInjection { context: String, max_tokens: Option<usize> },  // NEW
    Distill,                                          // NEW
    CreateSnapshot,                                   // NEW
    RestoreSnapshot { snapshot: MemorySnapshot },     // NEW
    CleanupExpired,                                   // NEW
}
```

### Model Router (`model-router/src/main.rs`)

#### 新增功能
- ✅ **LinUCB 智能路由**: 基于上下文的多臂老虎机算法
- ✅ **任务类型路由**: Code/Analysis/Chat 等分类
- ✅ **成本优化路由**: 功过簿概念，历史效果调整
- ✅ **Token 消耗统计**: 小时/日限额管理
- ✅ **快/慢 Agent 分桶**: SpeedTier (Fast/Slow/Balanced)
- ✅ **热切换模型支持**: 运行时更新 provider 配置

#### API 扩展
```rust
pub enum RoutingStrategy {
    Balanced,
    CostFirst,
    QualityFirst,
    LocalOnly,
    LinUCB,           // NEW
    TaskBased,        // NEW
    CostOptimized,    // NEW
}

pub struct Provider {
    // ... existing fields
    pub speed_tier: SpeedTier,           // NEW
    pub success_rate: f64,               // NEW
    pub avg_latency_ms: u64,             // NEW
}
```

### Policy Engine (`policy-engine/src/main.rs`)

#### 新增功能
- ✅ **edict 状态机集成**: 状态转换检查
- ✅ **Prompt 注入检测**: 基于正则和启发式规则
- ✅ **任务级权限控制**: 按任务类型设置权限
- ✅ **Agent 权限矩阵**: 细粒度的 per-agent 权限
- ✅ **审计日志**: edict-compatible 格式输出
- ✅ **资源配额管理**: memory/disk/cpu 限制

#### API 扩展
```rust
pub enum PolicyRequest {
    CheckFileRead { ... },
    CheckNetwork { ... },
    CheckTool { ... },
    CheckPrompt { prompt: String, agent_id: Option<String> },           // NEW
    CheckAgentPermission { agent_id: String, permission: String },     // NEW
    CheckTask { task_type: String, agent_id: Option<String> },         // NEW
    CheckStateTransition { to_state: String, agent_id: Option<String> }, // NEW
    GetAuditLogs { limit: Option<usize> },                             // NEW
    FlushAuditLogs,                                                     // NEW
}
```

---

## 快速开始

### 编译所有模块

```bash
cd hundunos-rust
cargo build --release
```

### 运行测试

```bash
cd hundunos-rust
cargo test --workspace
```

### 单独运行模块

```bash
# Tool Bridge
cargo run --release --bin tool-bridge

# Memory Graph
cargo run --release --bin memory-graph

# Model Router
cargo run --release --bin model-router

# Policy Engine
cargo run --release --bin policy-engine
```

---

## 架构说明

```
┌─────────────────────────────────────────────────────────┐
│                    HundunOS Kernel                      │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ Tool Bridge │  │Memory Graph │  │  Model Router   │ │
│  │   v2.0      │  │   v2.0      │  │    v2.0         │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                   │          │
│         └────────────────┴───────────────────┘          │
│                          │                              │
│                   ┌──────┴──────┐                       │
│                   │Policy Engine│                       │
│                   │   v2.0      │                       │
│                   └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

---

## 文件结构

```
hundunos-rust/
├── Cargo.toml                    # Workspace 配置
├── README.md                     # 本文件
├── tool-bridge/
│   ├── Cargo.toml
│   └── src/
│       └── main.rs              # v2.0 实现
├── memory-graph/
│   ├── Cargo.toml
│   └── src/
│       └── main.rs              # v2.0 实现
├── model-router/
│   ├── Cargo.toml
│   └── src/
│       └── main.rs              # v2.0 实现
└── policy-engine/
    ├── Cargo.toml
    └── src/
        └── main.rs              # v2.0 实现
```

---

## 依赖项

所有模块共享以下依赖（定义在 workspace Cargo.toml）：

- `tokio` - 异步运行时
- `serde` / `serde_json` / `serde_yaml` - 序列化
- `anyhow` - 错误处理
- `dashmap` - 并发 HashMap
- `regex` - 正则表达式
- `sha2` - 哈希计算
- `uuid` - UUID 生成
- `rand` - 随机数生成

---

## 向后兼容性

所有 v2.0 模块保持与 v1.0 的 JSON 协议兼容：
- 现有 API 不变
- 新增字段为 `Option<T>` 类型
- 旧客户端无需修改即可使用

---

## 后续计划

1. **Phase 3**: 性能基准测试与优化
2. **Phase 4**: 与 HundunOS JS 内核集成测试
3. **Phase 5**: 生产环境部署

---

## 参考

- [edict](https://github.com/cft0808/edict) - 架构设计参考
- [Rust Async Book](https://rust-lang.github.io/async-book/)
- [Tokio Documentation](https://tokio.rs/)