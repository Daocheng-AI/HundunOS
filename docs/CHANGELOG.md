# HundunOS Changelog

## [3.5.0] — 2026-04-08 — Onyx 深度研究优化版

> 核心改进：深度研究管线、引用融合、请求追踪、标准化错误码

---

### 新增模块

#### `kernel/tracing.js` — Tracing Span Infrastructure
- **参考**：`onyx/core/tracing/`
- `HundunTracer` 类：AsyncLocalStorage span 嵌套，自动计时
- `functionSpan(name, fn)`：函数级 span，自动捕获异常与耗时
- `span(name)`：嵌套 span，自动继承父 span
- `getSlowSpans(thresholdMs)`：慢查询定位
- **用途**：工具执行/网络调用全链路可视化

#### `kernel/citation-processor.js` — 引用融合引擎
- **参考**：`onyx/rag/citation_processor.py`
- `CitationProcessor` 类：引用识别 → 片段提取 → 归因评分 → 融合渲染
- 支持 URL / doc_id / chunk_id 多源引用类型
- 引用评分：`exact_match / partial_match / semantic` 三级

#### `kernel/deep-research.js` — 深度研究编排器
- **参考**：`onyx/research/deep_research.py`
- `DeepResearchOrchestrator` 类：研究规划 → 多源查询 → 证据收集 → 迭代优化 → 报告生成
- 流式支持：`researchStream()` 实时输出研究进度
- 报告格式：`findings / citations / methodology / confidence_score`

#### `kernel/error-codes.js` — 标准化错误码体系
- `HundunOSErrorCode` 枚举：覆盖 kernel / tool / model / memory / policy / rest / auth 共 7 大类别
- `HundunError(message, code, context)` 异常类：标准化 `{ code, message, context, timestamp, requestId }`
- 错误码命名：`HUNDUN_[CATEGORY]_[SPECIFIC]`

---

### 改进

#### `kernel/core.js` — v3.5 初始化链升级
- 新增 4 个模块接入 `initialize()` 启动链：
  - `kernel.tracing`
  - `kernel.citationProcessor`
  - `kernel.deepResearch`
  - `kernel.errors` / `kernel.errorCodes`
- REST API 请求级 tracing：每个 `/api/*` 请求包裹 `functionSpan()`
- 版本：`HundunOS v3.0` → `HundunOS v3.5`

#### `kernel/tool-bridge.js` — 工具并行执行
- 新增 `executeParallel(calls)`：批量工具并行（MAX_CONCURRENT=4 分批）
- 参考 Onyx `tool_runner.py` 批处理模式

#### `hundunos-rust/tool-bridge-rust.js` — Rust 端对齐
- 同步新增 `executeParallel()` 方法（镜像 tool-bridge.js）

---

### 测试结果

| 测试项 | 结果 |
|--------|------|
| hundunos 测试套件 | 61/62 ✅ |
| v3.5 模块导入 | 全部通过 ✅ |
| tool-bridge-rust 语法 | 无 lint 错误 ✅ |

---

## [3.0.0] — 2026-04-03

- HundunOS 微内核正式发布
- 完整模块体系：ToolBridge / ModelRouter / MemoryGraph / Scheduler / PolicyEngine / AwareSystem
- REST API 内置 + 令牌桶限流
- 模块热发现与动态注册

---

> 格式说明：本 changelog 按 `## [版本] — 日期 — 代号` 结构记录新增/改进/修复。
