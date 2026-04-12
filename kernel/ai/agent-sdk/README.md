# HundunOS Agent SDK

基于 n8n Agents SDK 设计的完整 AI Agent 开发框架，提供类型安全、可扩展、易使用的 AI Agent 构建能力。

## 功能特性

### 1. Agent 构建器
- 流式 API 构建 AI Agent
- 模型配置和凭证管理
- 指令和对话历史
- 工具集成和执行
- 内存配置支持
- 安全护栏集成
- 结构化输出验证

### 2. 工具运行时
- 类型安全的工具定义
- 输入/输出验证 (Zod Schema)
- 超时控制
- 自动重试机制
- 工具注册表
- 分类和搜索

### 3. 结构化输出
- Zod Schema 验证
- 输出转换
- 智能解析
- 提示词生成
- 示例支持

### 4. 安全护栏
- 关键词过滤
- 长度限制
- Schema 验证
- 自定义检查
- 输入/输出分别过滤
- 预定义安全护栏

### 5. 表达式沙箱
- 安全的执行环境
- 危险模式检测
- 超时控制
- 内置安全函数库
- 类型验证
- 执行统计

### 6. Binary Data 管理
- 抽象存储后端
- 文件系统存储
- 内存存储
- 自动去重
- 可选压缩
- 元数据管理
- 标签系统

## 快速开始

### 创建一个简单的 Agent

```javascript
import { AgentBuilder } from './kernel/ai/agent-sdk/agent.js';

const agent = new AgentBuilder('assistant')
  .withModel('openai', 'gpt-4')
  .withCredential('openai')
  .withInstructions('You are a helpful assistant.')
  .build();

const result = await agent.run({
  input: 'Hello, how are you?'
});

console.log(result.output);
```

### 使用工具

```javascript
import { createTool, ToolRegistry } from './kernel/ai/agent-sdk/tool.js';

const searchTool = createTool('search')
  .setDescription('Search the web')
  .setInputSchema(z.object({ query: z.string() }))
  .setOutputSchema(z.object({ results: z.array(z.string()) }))
  .setHandler(async ({ query }) => {
    return { results: [`Result for: ${query}`] };
  })
  .build();

const registry = new ToolRegistry();
registry.register(searchTool);

const result = await searchTool.execute({ query: 'test' });
console.log(result.output);
```

### 使用安全护栏

```javascript
import { GuardrailManager, createKeywordGuardrail } from './kernel/ai/agent-sdk/guardrail.js';

const manager = new GuardrailManager();

manager.addInputGuardrail(
  createKeywordGuardrail({ blockedKeywords: ['password', 'secret'] })
);

const result = await manager.checkInput('Enter your password');
console.log(result.allowed); // false
```

### 使用表达式沙箱

```javascript
import { createExpressionSandbox, createSandboxConfig } from './kernel/ai/agent-sdk/expression-sandbox.js';

const sandbox = createExpressionSandbox(
  createSandboxConfig().setTimeout(5000)
);

const result = await sandbox.execute('1 + 1');
console.log(result.value); // 2
```

### 使用 Binary Data 管理

```javascript
import { createBinaryDataManager, createMemoryStorage } from './kernel/ai/agent-sdk/binary-data.js';

const manager = createBinaryDataManager({
  backend: createMemoryStorage(),
  enableDeduplication: true
});

const data = Buffer.from('Hello, World!');
const result = await manager.store(data, {
  fileName: 'hello.txt',
  mimeType: 'text/plain'
});

console.log(result.id);
```

## 测试

运行所有测试：

```bash
npm test
```

运行特定模块测试：

```bash
npx vitest run kernel/ai/agent-sdk/agent.test.js
npx vitest run kernel/ai/agent-sdk/tool.test.js
npx vitest run kernel/ai/agent-sdk/structured-output.test.js
npx vitest run kernel/ai/agent-sdk/guardrail.test.js
npx vitest run kernel/ai/agent-sdk/expression-sandbox.test.js
npx vitest run kernel/ai/agent-sdk/binary-data.test.js
```

## 测试覆盖

- **Agent SDK**: 32 个测试
- **工具运行时**: 42 个测试
- **结构化输出**: 46 个测试
- **安全护栏**: 49 个测试
- **表达式沙箱**: 59 个测试
- **Binary Data 管理**: 37 个测试

**总计: 265 个测试，全部通过 ✅**

## 架构设计

基于 n8n Agents SDK 的设计理念：

- **类型安全**: 使用 Zod Schema 进行类型验证
- **流式 API**: 提供直观的构建器模式
- **可扩展**: 抽象接口支持多种实现
- **安全优先**: 内置安全护栏和沙箱执行
- **测试驱动**: 完整的测试覆盖

## 文件结构

```
kernel/ai/agent-sdk/
├── agent.js                    # Agent 构建器和执行
├── agent.test.js               # Agent 测试
├── tool.js                     # 工具运行时
├── tool.test.js                # 工具测试
├── structured-output.js        # 结构化输出
├── structured-output.test.js   # 结构化输出测试
├── guardrail.js                # 安全护栏
├── guardrail.test.js           # 安全护栏测试
├── expression-sandbox.js       # 表达式沙箱
├── expression-sandbox.test.js  # 表达式沙箱测试
├── binary-data.js              # Binary Data 管理
└── binary-data.test.js         # Binary Data 测试
```

## 依赖项

- Zod: Schema 验证
- Vitest: 测试框架

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
