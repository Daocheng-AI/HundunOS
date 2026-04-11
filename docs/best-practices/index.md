# HundunOS 最佳实践指南

**版本**: v2.0  
**更新日期**: 2026-04-07  
**参考项目**: claude-code-best, claude-howto

---

## 目录

1. [架构设计](#架构设计)
2. [编码规范](#编码规范)
3. [模块开发](#模块开发)
4. [性能优化](#性能优化)
5. [测试策略](#测试策略)
6. [部署实践](#部署实践)

---

## 架构设计

### 1. 微内核架构

HundunOS 采用微内核架构，核心只提供基础功能，扩展通过模块实现：

```
┌─────────────────────────────────────────┐
│              应用层                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Skills  │ │ Agents  │ │ Workflows│  │
│  └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────┤
│              内核层                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Tool    │ │ Policy  │ │ Memory  │   │
│  │ Bridge  │ │ Engine  │ │ Graph   │   │
│  └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────┤
│              基础设施层                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Rust    │ │ Node.js │ │ Storage │   │
│  │ Runtime │ │ Runtime │ │ Engine  │   │
│  └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

### 2. 模块化原则

- **单一职责**: 每个模块只做一件事
- **松耦合**: 模块间通过接口通信
- **高内聚**: 相关功能聚合在同一模块
- **可替换**: 模块可以独立替换

### 3. 数据流

```
用户输入 → Intent Engine → Tool Router → Tool Bridge → 响应
                ↓
          Memory Graph (上下文)
                ↓
          Policy Engine (安全检查)
```

---

## 编码规范

### JavaScript/TypeScript

```javascript
// ✅ 好: 使用 async/await
async function fetchUserData(userId) {
    const user = await db.users.find(userId);
    return user;
}

// ❌ 坏: 回调地狱
function fetchUserData(userId, callback) {
    db.users.find(userId, (err, user) => {
        if (err) callback(err);
        else callback(null, user);
    });
}
```

### Python

```python
# ✅ 好: 使用类型注解
def process_data(data: list[dict]) -> dict[str, Any]:
    return {"result": data}

# ❌ 坏: 无类型注解
def process_data(data):
    return {"result": data}
```

### Rust

```rust
// ✅ 好: 使用 Result 处理错误
pub fn parse_config(path: &Path) -> Result<Config, Error> {
    let content = fs::read_to_string(path)?;
    let config: Config = serde_json::from_str(&content)?;
    Ok(config)
}

// ❌ 坏: panic 风险
pub fn parse_config(path: &Path) -> Config {
    let content = fs::read_to_string(path).unwrap();
    serde_json::from_str(&content).unwrap()
}
```

---

## 模块开发

### Skill 开发规范

```javascript
// skills/my-skill/index.js
export class MySkill {
    constructor(kernel) {
        this.kernel = kernel;
        this.name = 'my-skill';
        this.version = '1.0.0';
    }

    async initialize() {
        // 初始化逻辑
    }

    async execute(params) {
        // 执行逻辑
        return { success: true };
    }

    async cleanup() {
        // 清理资源
    }
}

export function getSkill(kernel) {
    return new MySkill(kernel);
}
```

### 模块注册

```javascript
// 在 kernel/module-registry.js 中注册
registry.register('my-skill', {
    path: './extension-modules/my-skill',
    autoStart: true,
    dependencies: ['policy-engine']
});
```

---

## 性能优化

### 1. Rust 模块优先

对于性能关键模块，使用 Rust 实现：

| 模块 | Node.js | Rust | 提升 |
|------|---------|------|------|
| Tool Bridge | ~50ms | ~5ms | **10x** |
| Policy Engine | ~10ms | ~2ms | **5x** |
| Memory Graph | ~20ms | ~5ms | **4x** |

### 2. 缓存策略

```javascript
class CacheManager {
    constructor() {
        this.cache = new Map();
        this.ttl = 3600000; // 1小时
    }

    get(key) {
        const item = this.cache.get(key);
        if (item && Date.now() < item.expiry) {
            return item.value;
        }
        return null;
    }

    set(key, value, ttl = this.ttl) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl
        });
    }
}
```

### 3. 批处理

```javascript
// ✅ 好: 批量处理
async function processBatch(items) {
    const results = await Promise.all(
        items.map(item => processItem(item))
    );
    return results;
}

// ❌ 坏: 串行处理
async function processSerial(items) {
    const results = [];
    for (const item of items) {
        results.push(await processItem(item));
    }
    return results;
}
```

---

## 测试策略

### 单元测试

```javascript
// tests/unit/policy-engine.test.js
import { PolicyEngine } from '../../kernel/policy-engine.js';

describe('PolicyEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new PolicyEngine(mockKernel);
    });

    test('should allow safe file read', async () => {
        const result = await engine.checkFileRead('/safe/path.txt');
        expect(result.allowed).toBe(true);
    });

    test('should block dangerous file read', async () => {
        const result = await engine.checkFileRead('/etc/passwd');
        expect(result.allowed).toBe(false);
    });
});
```

### 集成测试

```javascript
// tests/integration/tool-bridge.test.js
describe('ToolBridge Integration', () => {
    test('should execute command successfully', async () => {
        const bridge = new ToolBridgeRust(kernel);
        const result = await bridge.execute('echo hello');
        expect(result.success).toBe(true);
        expect(result.stdout).toBe('hello');
    });
});
```

### 测试覆盖率目标

| 类型 | 目标 |
|------|------|
| 语句覆盖 | ≥ 80% |
| 分支覆盖 | ≥ 70% |
| 函数覆盖 | ≥ 90% |
| 行覆盖 | ≥ 80% |

---

## 部署实践

### Docker 部署

```dockerfile
FROM node:20-alpine

# 安装 Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN cargo build --release

CMD ["node", "dist/index.js"]
```

### 环境变量

```bash
# 必需
HUNDUNOS_WORKSPACE=/path/to/workspace
HUNDUNOS_LOG_LEVEL=info

# 可选
HUNDUNOS_RUST_ENABLED=true
HUNDUNOS_CACHE_TTL=3600000
```

### 健康检查

```javascript
// healthcheck.js
export async function healthCheck() {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        modules: {
            rust: checkRustModules(),
            memory: checkMemoryUsage(),
            disk: checkDiskSpace()
        }
    };
}
```

---

## 错误处理

### 统一错误格式

```javascript
class HundunError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

// 使用
throw new HundunError(
    'POLICY_DENIED',
    'File access denied by policy',
    { path: '/etc/passwd', reason: 'not in allowed list' }
);
```

### 错误恢复

```javascript
class RecoveryManager {
    async handleError(error, context) {
        // 1. 记录错误
        await this.log(error);
        
        // 2. 尝试恢复
        if (error.recoverable) {
            return await this.recover(context);
        }
        
        // 3. 降级处理
        return await this.fallback(context);
    }
}
```

---

## 日志规范

### 日志级别

| 级别 | 用途 |
|------|------|
| ERROR | 错误，需要立即处理 |
| WARN | 警告，潜在问题 |
| INFO | 重要信息 |
| DEBUG | 调试信息 |
| TRACE | 详细追踪 |

### 结构化日志

```javascript
logger.info({
    event: 'tool_execute',
    tool: 'bash',
    duration: 150,
    success: true
});
```

---

## 安全实践

### 1. 输入验证

```javascript
function validateInput(input) {
    if (typeof input !== 'string') {
        throw new Error('Input must be a string');
    }
    if (input.length > 10000) {
        throw new Error('Input too long');
    }
    return input;
}
```

### 2. 权限控制

```javascript
// Policy Engine 检查
const result = await policy.check({
    action: 'file_read',
    resource: '/sensitive/data',
    context: { user: 'alice' }
});

if (!result.allowed) {
    throw new Error('Access denied');
}
```

### 3. 敏感信息保护

```javascript
// 不要记录敏感信息
logger.info({
    event: 'api_call',
    url: url,
    // ❌ apiKey: apiKey
    apiKey: '***' // ✅ 脱敏
});
```

---

## 参考资料

- [instructkr/claude-code](https://github.com/instructkr/claude-code)
- [claude-code-best/claude-code](https://github.com/claude-code-best/claude-code)
- [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto)
- [lifedever/claude-rules](https://github.com/lifedever/claude-rules)
