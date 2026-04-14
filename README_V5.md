# HundunOS v5.0 - 下一代AI操作系统

## 🚀 概述

HundunOS v5.0 是一个基于微内核架构的下一代AI操作系统，提供高性能、可扩展、易维护的AI应用开发平台。

### 核心特性

- **微内核架构**: 极简内核 + 插件化设计
- **高性能**: 启动时间<1秒，内存占用降低60%
- **AI原生**: 内置Agent、RAG、模型路由等AI能力
- **多租户**: 支持SaaS模式的多租户架构
- **完整生态**: 缓存、数据库、API、计费全覆盖

## 📁 项目结构

```
hundunos/
├── kernel/v5/                 # v5微内核架构
│   ├── core/                  # 核心组件
│   ├── plugins/               # 插件系统
│   ├── compat/                # v4兼容层
│   └── tests/                 # 测试套件
├── examples/                  # 示例应用
│   ├── v5-basic/             # 基础示例
│   ├── v5-ai-agent/          # AI Agent示例
│   └── v5-multitenant/       # 多租户示例
├── config/                    # 配置文件
├── docs/                      # 文档
├── Dockerfile                 # Docker镜像
└── docker-compose.yml         # Docker Compose配置
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
```

### 运行基础示例

```bash
node examples/v5-basic/app.js
```

### 运行AI Agent示例

```bash
export OPENAI_API_KEY=your-api-key
node examples/v5-ai-agent/app.js
```

## 🏗️ 架构设计

### 微内核核心

```
┌─────────────────────────────────────────────────────────────┐
│                    HundunOS v5.0                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Kernel    │  │  EventBus   │  │   ServiceRegistry   │ │
│  │   (微内核)   │  │  (事件总线)  │  │    (服务注册表)      │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                    │            │
│  ┌──────┴────────────────┴────────────────────┴──────────┐ │
│  │                    Plugin Manager                      │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                 │
│  ┌────────────────────────┼───────────────────────────────┐│
│  │                        ▼                                ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  ││
│  │  │  Cache   │ │ Security │ │   API    │ │  Model   │  ││
│  │  │  Plugin  │ │  Plugin  │ │  Plugin  │ │  Plugin  │  ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  ││
│  │  │  Agent   │ │  RAG     │ │  Tenant  │ │ Billing  │  ││
│  │  │  Plugin  │ │  Plugin  │ │  Plugin  │ │  Plugin  │  ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 📦 核心插件

### 基础插件

- **LoggerPlugin**: 结构化日志系统
- **SecurityPlugin**: 安全基础（输入清理、CORS、限流）
- **ConfigPlugin**: 配置管理
- **EventsPlugin**: 事件总线

### 功能插件

- **CachePlugin**: 多级缓存（Memory + Redis）
- **DatabasePlugin**: 数据库连接池（SQLite/PostgreSQL/MySQL）
- **ApiPlugin**: REST API服务器
- **ModelRouterPlugin**: AI模型路由（OpenAI/Anthropic/Local）
- **AgentPlugin**: AI Agent系统
- **RagPlugin**: RAG检索增强生成
- **TenantPlugin**: 多租户系统
- **BillingPlugin**: 计费系统

## 💻 使用示例

### 基础使用

```javascript
import { createKernel, LoggerPlugin, SecurityPlugin } from './kernel/v5/index.js';

const kernel = createKernel({
  logger: { level: 'info' }
});

await kernel.plugins.register(LoggerPlugin);
await kernel.plugins.register(SecurityPlugin);
await kernel.initialize();

// 使用服务
const security = kernel.get('security.sanitize');
const clean = security.sanitize(userInput, 'string');
```

### 完整应用

```javascript
import {
  createKernel,
  LoggerPlugin, SecurityPlugin, ConfigPlugin, EventsPlugin,
  CachePlugin, DatabasePlugin, ApiPlugin, ModelRouterPlugin,
  AgentPlugin, RagPlugin, TenantPlugin, BillingPlugin
} from './kernel/v5/index.js';

const kernel = createKernel({
  api: { port: 3000 },
  database: { type: 'sqlite', path: './data.db' }
});

// 注册所有插件
await kernel.plugins.register(LoggerPlugin);
await kernel.plugins.register(ConfigPlugin);
await kernel.plugins.register(EventsPlugin);
await kernel.plugins.register(SecurityPlugin);
await kernel.plugins.register(CachePlugin);
await kernel.plugins.register(DatabasePlugin);
await kernel.plugins.register(ApiPlugin);
await kernel.plugins.register(ModelRouterPlugin);
await kernel.plugins.register(AgentPlugin);
await kernel.plugins.register(RagPlugin);
await kernel.plugins.register(TenantPlugin);
await kernel.plugins.register(BillingPlugin);

await kernel.initialize();

// 设置API
const api = kernel.get('api');
api.get('/health', async (ctx) => ({ status: 'ok' }));
api.start();
```

## 🧪 测试

```bash
# 运行单元测试
npm test

# 运行性能基准测试
npm run benchmark

# 运行集成测试
npm run test:integration
```

## 🐳 Docker部署

### 构建镜像

```bash
docker build -t hundunos:v5 .
```

### Docker Compose部署

```bash
# 创建环境变量文件
cp .env.example .env
# 编辑 .env 填入配置

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 停止服务
docker-compose down
```

## 📊 性能

| 指标 | v4 | v5 | 提升 |
|------|-----|-----|------|
| 启动时间 | 3-5s | <1s | 75%↓ |
| 内存占用 | 500MB | 200MB | 60%↓ |
| 并发处理 | 245 req/s | 680 req/s | 177%↑ |
| 代码重复 | 30% | <5% | 80%↓ |

查看完整报告: [PERFORMANCE_REPORT.md](./PERFORMANCE_REPORT.md)

## 📚 文档

- [架构设计文档](./ARCHITECTURE_V5.md)
- [迁移指南](./MIGRATION_GUIDE.md)
- [API文档](./docs/api.md)
- [插件开发指南](./docs/plugin-development.md)

## 🔄 从v4迁移

使用兼容层平滑迁移:

```javascript
import { createV4Adapter } from './kernel/v5/index.js';

const app = createV4Adapter(config);

// 继续使用v4 API
app.onPhase('services', async () => {
  // 初始化服务
});

app.useMixin('myService', (ctx) => ({
  async doSomething() {}
}));

await app.initialize();
```

查看完整迁移指南: [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

## 🤝 贡献

欢迎贡献代码！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何参与。

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

## 🙏 致谢

感谢所有贡献者和社区成员的支持！

---

**版本**: v5.0.0  
**文档日期**: 2026-04-14  
**状态**: ✅ 生产就绪
