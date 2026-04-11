# HundunOS v3.0 独立客户端

不依赖浏览器，后台常驻，支持 GUI / CLI / API 三种方式访问 HundunOS。

## 快速启动

```bash
cd shell/client
npm install
npm start          # 启动守护进程
```

或双击 `start.bat`。

---

## 架构概览

```
┌─────────────────────────────────────────────────┐
│                  用户访问层                       │
│   GUI Client   │  CLI Client  │  HTTP API       │
│   (Electron)   │ (Node.js)    │  (port 38082)  │
└──────┬─────────┴──────┬──────┴────────┬────────┘
       │                │               │
       │     IPC Bridge (port 38081)     │
       │     Named Pipe / TCP Socket     │
       └─────────────────┼───────────────┘
                         │
              ┌──────────┴──────────┐
              │   守护进程 Daemon   │
              │  - 进程管理         │
              │  - 自动重启         │
              │  - 心跳监控         │
              │  - SSE 事件推送     │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │  HundunOS Kernel    │
              │  REST API :38080   │
              └─────────────────────┘
```

---

## 目录结构

```
shell/client/
├── DESIGN.md              # 架构设计文档
├── README.md               # 本文件
├── package.json            # 依赖配置
├── start.bat               # Windows 启动脚本
├── bin/
│   ├── hundunos-daemon.js  # 守护进程入口
│   └── hundunos-cli.js     # CLI 入口
├── daemon/
│   └── daemon.js           # 守护进程核心 (IPC + 进程管理)
├── cli/
│   └── repl.js             # 交互式 REPL
├── gui/
│   ├── main.js              # Electron 主进程
│   ├── preload.js           # Preload 脚本
│   └── renderer/
│       └── index.html      # GUI 界面
└── lib/
    ├── config.js            # 配置管理
    ├── logger.js            # 日志工具
    └── ipc-client.js        # IPC 客户端 (CLI/GUI 共用)
```

---

## 三种访问方式

### 1. GUI 客户端 (Electron)

```bash
npm run gui
```

- 深色主题聊天界面
- 系统状态监控面板
- 模块管理视图
- 系统托盘常驻
- 关闭到托盘，最小化打扰

### 2. CLI 客户端 (REPL)

```bash
npm run cli
```

交互模式：
```
hundunos> 你好世界
...
/help     — 查看所有命令
/status   — 系统状态
/health   — 健康检查
/modules  — 模块列表
/model    — 模型路由
/audit    — 审计日志
/restart  — 重启内核
/exit     — 退出
```

单次命令：
```bash
hundunos-cli "你好"
hundunos-cli --status
```

### 3. HTTP API (Express)

```bash
npm run api
# 或守护进程内置启动
```

端口 `38082`，API Key 认证（可选）。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/process` | 发送消息 |
| GET | `/v1/status` | 系统状态 |
| GET | `/v1/health` | 健康检查 |
| GET | `/v1/modules` | 模块列表 |
| GET | `/v1/rate-limit` | 限流统计 |
| GET | `/v1/events` | SSE 事件流 |
| POST | `/v1/shutdown` | 关闭系统 |

### 4. 直接 HTTP 调用 (无需客户端)

```bash
# 直接调用 HundunOS 内核 REST API (port 38080)
curl -X POST http://127.0.0.1:38080/api/process \
  -H "Content-Type: application/json" \
  -d '{"content":"你好"}'

# 查看状态
curl http://127.0.0.1:38080/api/status

# 健康检查
curl http://127.0.0.1:38080/health
```

---

## 配置

配置文件位置（自动创建）：
- **Windows**: `%APPDATA%/hundunos-client/config.json`
- **macOS/Linux**: `~/.config/hundunos-client/config.json`

主要配置项：

```json
{
  "daemon": {
    "autoStart": true,
    "restartOnCrash": true,
    "maxRetries": 3,
    "heartbeatInterval": 5000,
    "ipcPort": 38081
  },
  "api": {
    "enabled": true,
    "port": 38082,
    "apiKeys": [],
    "cors": true
  },
  "kernel": {
    "projectRoot": "..",
    "port": 38080
  },
  "gui": {
    "theme": "auto",
    "closeToTray": true
  }
}
```

---

## 守护进程

守护进程自动管理 HundunOS 内核：

- **启动时**：自动检测内核，未运行则启动
- **运行中**：每 5 秒心跳检测内核存活
- **崩溃时**：自动重启（最多 3 次，指数退避）
- **永久失败**：停止重启，通知用户

日志输出到 `logs/` 目录。

---

## 端口分配

| 端口 | 用途 |
|------|------|
| 38080 | HundunOS Kernel REST API (内置) |
| 38081 | Daemon IPC / TCP |
| 38082 | HTTP API Server (对外) |

---

## 开发

```bash
# 仅启动守护进程
npm start

# 仅启动 CLI
npm run cli

# 仅启动 HTTP API
npm run api

# 启动 Electron GUI (需要守护进程运行)
npm run gui

# 重新安装依赖
rm -rf node_modules && npm install
```

---

## 依赖

- Node.js >= 18
- Electron >= 28 (仅 GUI 模式)
- Express >= 4 (HTTP API)
