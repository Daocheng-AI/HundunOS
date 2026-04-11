# HundunOS v3.0 独立客户端设计

## 1. 设计目标

为 HundunOS v3.0 构建一个**独立桌面客户端**，不依赖浏览器，具备以下特性：

- **后台常驻**：核心 HundunOS 内核作为系统服务/守护进程在后台运行
- **多入口访问**：客户端 (GUI) / 命令行 (CLI) / API (HTTP) 三种方式调用系统功能
- **进程隔离**：客户端崩溃不影响内核运行，内核崩溃可自动重启
- **本地优先**：所有数据本地存储，无外部依赖
- **零配置启动**：用户双击即可使用

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户访问层                                │
│   ┌──────────────┐  ┌──────────────────┐  ┌────────────────┐   │
│   │  GUI Client   │  │   CLI Client     │  │  HTTP API      │   │
│   │  (Electron)   │  │   (Node.js REPL) │  │  (Express)     │   │
│   │  port 38081   │  │  hundunos-cli    │  │  port 38082    │   │
│   └───────┬───────┘  └────────┬─────────┘  └───────┬────────┘   │
│           │                    │                      │            │
│           └────────────────────┼──────────────────────┘            │
│                                │                                   │
│                     Named Pipe / TCP IPC                           │
│                      (port 38081)                                   │
├─────────────────────────────────────────────────────────────────┤
│                       守护进程层 (Daemon)                          │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │  hundunos-daemon  — 进程管理 + IPC + 自动重启            │    │
│   │  - 健康监控 (心跳)                                        │    │
│   │  - 日志聚合                                              │    │
│   │  - 配置管理                                              │    │
│   │  - WebSocket / SSE 事件推送                              │    │
│   └─────────────────────────┬───────────────────────────────┘    │
│                             │                                      │
│                    内部 HTTP (port 38080)                          │
├─────────────────────────────────────────────────────────────────┤
│                      HundunOS 内核层                               │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │  CoreKernel — 意图引擎 / 模型路由 / 记忆图谱 / 隐私防护   │    │
│   │  REST API (:38080) — /api/process  /api/status 等       │    │
│   └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 端口分配

| 端口 | 用途 | 说明 |
|------|------|------|
| 38080 | HundunOS Kernel REST API | 内核内置，不可更改 |
| 38081 | Client IPC / Daemon | 客户端与守护进程通信 |
| 38082 | HTTP API Server | 对外 HTTP API (可选) |

---

## 4. 核心模块

### 4.1 守护进程 (daemon)

**职责**：
- 作为 HundunOS 内核的守护进程运行
- 通过 Node.js `child_process` 启动/停止 `kernel/core.js`
- 提供 Named Pipe / TCP IPC 通道给客户端
- 定时心跳检测内核存活，自动重启
- 聚合内核日志
- 支持 WebSocket / SSE 事件推送

**IPC 协议** (JSON over Named Pipe / TCP)：
```jsonc
// 请求
{ "id": "uuid", "method": "process|status|modules|health", "params": {}, "token": "xxx" }

// 响应
{ "id": "uuid", "ok": true, "data": {...}, "error": null }
```

**事件推送** (SSE)：
```
GET /events → text/event-stream
event: kernel_ready
event: kernel_error
event: module_changed
event: health_update
```

### 4.2 HTTP API Server (可选外露)

基于 Express，将守护进程的 IPC 能力以 REST 形式暴露：

```
POST /v1/process       — 发送消息给内核
GET  /v1/status        — 系统状态
GET  /v1/health        — 健康检查
GET  /v1/modules       — 模块列表
POST /v1/modules/:id    — 激活/停用模块
GET  /v1/intents       — 意图列表
GET  /v1/audit         — 审计日志
GET  /v1/rate-limit    — 限流统计
POST /v1/shutdown       — 关闭内核
GET  /v1/events        — SSE 事件流
```

### 4.3 CLI Client

交互式 REPL：
```bash
hundunos-cli                    # 交互模式
hundunos-cli "你好"             # 单次命令模式
hundunos-cli --status           # 查看状态
hundunos-cli --modules          # 查看模块
hundunos-cli --kill             # 停止守护进程
hundunos-cli --start            # 启动守护进程
hundunos-cli --config           # 编辑配置
```

### 4.4 GUI Client (Electron)

- **主窗口**：会话界面，支持多会话 Tab
- **设置窗口**：模型配置、API Key 管理、安全设置
- **系统托盘**：后台运行，最小化到托盘
- **通知系统**：内核事件通知
- **离线能力**：完全本地运行，无需网络

---

## 5. 安全性

- **API Key 认证**：HTTP API 层可选 API Key 认证
- **IPC 鉴权**：本地 Named Pipe 不鉴权（同一机器安全）
- **数据隔离**：所有数据存储在用户目录
- **日志审计**：所有操作记录到审计日志

---

## 6. 文件结构

```
shell/client/
├── DESIGN.md              # 本设计文档
├── package.json           # 客户端依赖
├── bin/
│   ├── hundunos-cli.js    # CLI 入口 (npm bin)
│   └── hundunos-daemon.js # 守护进程入口
├── daemon/
│   ├── daemon.js          # 守护进程主逻辑
│   ├── ipc-bridge.js      # IPC 桥接 (Named Pipe / TCP)
│   ├── health-check.js    # 心跳检测 + 自动重启
│   └── log-aggregator.js  # 日志聚合
├── api/
│   ├── api-server.js      # HTTP API Server (Express)
│   └── routes/
│       ├── process.js     # /v1/process
│       ├── status.js      # /v1/status
│       ├── modules.js     # /v1/modules
│       └── events.js      # /v1/events (SSE)
├── cli/
│   ├── repl.js            # 交互式 REPL
│   └── commands.js        # CLI 命令集
├── gui/
│   ├── main.js            # Electron 主进程
│   ├── preload.js         # preload 脚本
│   ├── renderer/
│   │   ├── index.html     # 主界面
│   │   ├── styles.css     # 样式
│   │   └── app.js         # 前端逻辑
│   └── tray.js            # 系统托盘
├── lib/
│   ├── ipc-client.js      # IPC 客户端 (daemon 通信)
│   ├── config.js          # 配置管理
│   └── logger.js          # 日志工具
└── scripts/
    ├── install-service.js # 安装 Windows 服务
    └── setup.js           # 初始化配置
```

---

## 7. 生命周期

```
用户启动 (start.bat / 双击 / 命令行)
    │
    ▼
守护进程 (daemon) 启动
    │
    ▼
检查内核是否运行
    │
    ├── 未运行 → 启动 kernel/core.js
    │
    ▼
IPC Bridge 初始化 (port 38081)
    │
    ├── GUI 客户端连接
    ├── CLI 客户端连接
    └── HTTP API Server 启动 (port 38082, 可选)
    │
    ▼
心跳监控 (每 5s 检测一次)
    │
    ├── 内核崩溃 → 自动重启
    ├── 内存超限 → 重启
    └── 3次连续失败 → 停止重启，告警
```

---

## 8. 配置管理

配置文件: `shell/client/config.json`

```jsonc
{
  "daemon": {
    "autoStart": true,           // 开机自启
    "restartOnCrash": true,      // 崩溃重启
    "maxRetries": 3,              // 最大重试次数
    "heartbeatInterval": 5000,   // 心跳间隔 (ms)
    "logLevel": "info"            // 日志级别
  },
  "api": {
    "enabled": true,             // HTTP API Server
    "port": 38082,                // HTTP API 端口
    "apiKeys": [],                // API Key 列表
    "cors": true                  // 允许跨域
  },
  "gui": {
    "theme": "auto",              // 主题: light | dark | auto
    "fontSize": 14,
    "startMinimized": false,     // 启动时最小化
    "closeToTray": true           // 关闭到托盘
  },
  "kernel": {
    "projectRoot": "..",          // 指向 hundunos 根目录
    "port": 38080                 // 内核 REST API 端口
  }
}
```
