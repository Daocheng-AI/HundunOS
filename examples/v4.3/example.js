# HundunOS v4.3 示例项目

这是一个展示 HundunOS v4.3 新功能的示例项目。

## 功能演示

### 1. Todo 工具

```javascript
import { CoreKernelV4 } from 'hundunos';

const kernel = new CoreKernelV4({
  projectRoot: process.cwd(),
  storageDir: '.hundunos/example',
});

await kernel.initialize();

// 使用 todo 工具规划任务
const result = await kernel.toolBridge.execute('todo', JSON.stringify({
  items: [
    { content: 'Read requirement document', status: 'completed' },
    { content: 'Design API interface', status: 'in_progress', activeForm: 'Designing API' },
    { content: 'Implement API endpoints', status: 'pending' },
    { content: 'Write unit tests', status: 'pending' },
    { content: 'Deploy to production', status: 'pending' },
  ],
}));

console.log(result.output);
```

### 2. Task 工具

```javascript
// 创建持久任务
await kernel.toolBridge.execute('task_create', JSON.stringify({
  subject: 'Implement user authentication',
  description: 'Add JWT-based authentication to the API',
}));

// 更新任务状态
await kernel.toolBridge.execute('task_update', JSON.stringify({
  task_id: 1,
  status: 'in_progress',
  owner: 'backend-team',
}));

// 添加任务依赖
await kernel.toolBridge.execute('task_update', JSON.stringify({
  task_id: 2,
  addBlockedBy: [1], // Task 2 depends on Task 1
}));

// 列出所有任务
const listResult = await kernel.toolBridge.execute('task_list', '{}');
console.log(listResult.output);
```

### 3. Autonomous Agents

```javascript
const agentManager = kernel.autonomousAgentManager;
await agentManager.initialize();

// 注册代理
const agentId = agentManager.registerAgent({
  name: 'code-reviewer',
  capabilities: ['code', 'review', 'analysis'],
});

// 提交任务
const taskId = agentManager.submitTask({
  subject: 'Review PR #123',
  description: 'Review the pull request for bug fix',
  priority: 'high',
  requiredCapabilities: ['code', 'review'],
  dueAt: Date.now() + 86400000, // 24小时后
});

// 查看统计
const stats = agentManager.getStats();
console.log(stats);
// {
//   totalAgents: 1,
//   idleAgents: 0,
//   workingAgents: 1,
//   pendingTasks: 0,
//   runningTasks: 1,
//   completedTasks: 0,
//   failedTasks: 0
// }
```

### 4. Worktree 任务绑定

```javascript
const binding = kernel.agentTeams.worktreeTaskBinding;

// 绑定任务到 Worktree
await binding.bindTaskToWorktree('task_1', 'team-abc/worker-executor');

// 查看绑定状态
const status = await binding.getBindingStatus('team-abc/worker-executor');
console.log(status);

// 关闭 Worktree
await binding.worktreeCloseout(
  'team-abc/worker-executor',
  'merge',
  'Task completed successfully',
  true
);
```

### 5. Plan Approval 协议

```javascript
const approvalManager = kernel.agentTeams.planApprovalManager;

// 请求审批
const requestId = await approvalManager.requestApproval('worker-executor', {
  subject: 'Implement feature X',
  steps: [
    'Step 1: Design API',
    'Step 2: Implement endpoints',
    'Step 3: Write tests',
    'Step 4: Deploy',
  ],
});

// Lead 审批
await approvalManager.respond(requestId, 'approve', 'Plan looks good, proceed');

// Worker 查看审批结果
const messages = kernel.agentTeams.messageBus.readInbox('worker-executor');
console.log(messages[0]);
// {
//   type: 'plan_approval_response',
//   from: 'lead',
//   to: 'worker-executor',
//   content: 'Plan looks good, proceed',
//   extra: { requestId, decision: 'approve' }
// }
```

### 6. MessageBus

```javascript
const messageBus = kernel.agentTeams.messageBus;

// 发送消息
messageBus.send('worker-executor', 'lead', 'Task completed', 'message');

// 广播消息
messageBus.broadcast('lead', 'Team meeting at 3 PM', [
  'worker-executor',
  'worker-reviewer',
  'worker-researcher',
]);

// 读取收件箱
const messages = messageBus.readInbox('lead');
console.log(messages);
```

### 7. Compact 三层压缩

```javascript
// 自动触发（当上下文超过阈值时）
const session = {
  id: 'session-123',
  messages: [
    // ... 大量消息
  ],
};

// 第1层: Microcompact（保留最近 3 个工具结果）
// 第2层: LLM Summarization（使用 GPT-4o-mini 生成摘要）
// 第3层: PersistedOutputMarker（>50KB 输出持久化到磁盘）
```

### 8. Recovery 状态机

```javascript
const recovery = kernel.recovery;

// 处理 max_tokens 错误
await recovery.handle({
  type: 'agent_error',
  error: 'max_tokens',
  context: { sessionId: 'session-123' },
});
// 自动注入续写提示

// 处理 context 超限错误
await recovery.handle({
  type: 'agent_error',
  error: 'context_length_exceeded',
  context: { sessionId: 'session-123' },
});
// 自动压缩上下文后重试
```

### 9. Memory Frontmatter

```javascript
// 创建结构化记忆
const memoryContent = `---
name: "User prefers dark mode"
description: "User consistently chooses dark theme in UI settings"
type: "user"
scope: "private"
tags: ["preference", "ui"]
createdAt: "2025-01-15T10:30:00Z"
updatedAt: "2025-01-15T10:30:00Z"
---

User preferred dark mode in the last 3 sessions.
`;

// 记录记忆
await kernel.memoryGraph.record(
  { content: memoryContent },
  { type: 'user', scope: 'private' },
  { success: true }
);

// 按类型和作用域检索
const memories = await kernel.memoryGraph.recall('preferences', {
  type: 'user',
  scope: 'private',
});
```

### 10. PromptParts

```javascript
import { PromptParts, buildSystemPrompt } from 'hundunos';

// 模块化组装 prompt
const parts = new PromptParts()
  .setCoreIdentity('You are a helpful coding assistant.')
  .setMemorySection('User prefers dark mode.')
  .setSkillSection('code, review, analysis')
  .setTaskContext('Fix the bug in auth module')
  .setToolGuidance('Use Bash for file operations, Editor for code changes');

const systemPrompt = parts.build();

// 在压缩后使用
const compressedPrompt = buildSystemPrompt({
  coreIdentity: kernel.config.systemPrompt,
  memorySection: prioritizedMemories,
  skillSection: skillContext?.injectedSkills || [],
  taskContext: session?.context?.reminder || '',
  toolGuidance: toolGuidance,
});
```

### 11. MCP 插件

```javascript
// 使用 MCP 工具
const mcpTools = kernel.mcpManager.listTools();
console.log(mcpTools);
// [
//   { name: 'filesystem/read_file', description: '...' },
//   { name: 'brave-search/search', description: '...' },
//   ...
// ]

// 调用 MCP 工具
const result = await kernel.mcpManager.callTool('filesystem/read_file', {
  path: 'README.md',
});
```

### 12. 错误处理和降级

```javascript
// 记录错误
kernel.errorHandler.logError(new Error('Something went wrong'), {
  module: 'toolBridge',
  toolId: 'bash',
});

// 查看错误统计
const errorStats = kernel.errorHandler.getErrorStats();
console.log(errorStats);

// 执行降级策略
const fallback = await kernel.fallbackManager.execute('worktree-git-unavailable', {
  team: { isolation: 'worktree' },
});
// { success: true, fallback: 'fork' }

// 带重试执行
const result = await kernel.retryManager.execute(async () => {
  return await kernel.modelRouter.route(intent, session);
}, {
  maxRetries: 3,
  retryDelay: 1000,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'rate_limit_exceeded'],
});
```

### 13. 监控和可观测性

```javascript
// 记录指标
kernel.metrics.recordToolExecution('bash', 'success', 0.5);
kernel.metrics.recordLLMRequest('openai', 'gpt-4o-mini', 'success', 2.3, 1500);
kernel.metrics.recordCompaction('llm_summary');
kernel.metrics.recordError('toolBridge', 'timeout');

// 更新 gauge
kernel.metrics.updateActiveSessions(5);
kernel.metrics.updatePendingTasks(10);
kernel.metrics.updateQueueDepth('taskQueue', 25);

// 健康检查
const health = await kernel.healthChecker.checkAll();
console.log(health);
// {
//   status: 'healthy',
//   timestamp: '2025-01-15T10:30:00Z',
//   checks: {
//     kernel: { status: 'healthy', version: '4.3.0', uptime: 1234 },
//     modelRouter: { status: 'healthy', providers: 3 },
//     ...
//   }
// }

// 分布式追踪
const spanId = kernel.tracer.startSpan('process_request');
kernel.tracer.addMetadata(spanId, { userId: 'user-123', intent: 'code' });
// ... 执行操作
kernel.tracer.endSpan(spanId, 'completed', { tokens: 1500 });

// 获取 span 树
const spanTree = kernel.tracer.getSpanTree(spanId);
console.log(spanTree);
```

## 完整示例

```javascript
import { CoreKernelV4 } from 'hundunos';

async function main() {
  const kernel = new CoreKernelV4({
    projectRoot: process.cwd(),
    storageDir: '.hundunos/example',
    system: {
      compact: { enabled: true },
      todo: { enabled: true },
      taskGraph: { enabled: true },
      autonomousAgents: { enabled: true },
      monitoring: { enabled: true, port: 9090 },
    },
  });

  await kernel.initialize();

  // 1. 规划任务
  await kernel.toolBridge.execute('todo', JSON.stringify({
    items: [
      { content: 'Create task', status: 'completed' },
      { content: 'Assign to agent', status: 'in_progress', activeForm: 'Assigning to agent' },
      { content: 'Execute task', status: 'pending' },
      { content: 'Complete task', status: 'pending' },
    ],
  }));

  // 2. 创建持久任务
  await kernel.toolBridge.execute('task_create', JSON.stringify({
    subject: 'Fix authentication bug',
    description: 'JWT token validation fails for expired tokens',
  }));

  // 3. 注册代理
  const agentId = kernel.autonomousAgentManager.registerAgent({
    name: 'bug-fixer',
    capabilities: ['code', 'debug', 'test'],
  });

  // 4. 提交任务
  const taskId = kernel.autonomousAgentManager.submitTask({
    subject: 'Fix authentication bug',
    requiredCapabilities: ['code', 'debug'],
    priority: 'high',
  });

  // 5. 请求审批
  const requestId = await kernel.agentTeams.planApprovalManager.requestApproval(
    'bug-fixer',
    {
      subject: 'Fix authentication bug',
      steps: [
        '1. Reproduce the bug',
        '2. Identify root cause',
        '3. Implement fix',
        '4. Add tests',
        '5. Deploy fix',
      ],
    }
  );

  // 6. 审批
  await kernel.agentTeams.planApprovalManager.respond(requestId, 'approve', 'Plan approved');

  // 7. 更新 todo
  await kernel.toolBridge.execute('todo', JSON.stringify({
    items: [
      { content: 'Create task', status: 'completed' },
      { content: 'Assign to agent', status: 'completed' },
      { content: 'Execute task', status: 'in_progress', activeForm: 'Executing task' },
      { content: 'Complete task', status: 'pending' },
    ],
  }));

  // 8. 查看统计
  const todoStats = kernel.todoManager.getStats();
  const taskStats = await kernel.taskGraph.getStats();
  const agentStats = kernel.autonomousAgentManager.getStats();
  const health = await kernel.healthChecker.checkAll();

  console.log('\n=== Statistics ===');
  console.log('Todo:', todoStats);
  console.log('Tasks:', taskStats);
  console.log('Agents:', agentStats);
  console.log('Health:', health.status);

  await kernel.shutdown();
}

main().catch(console.error);
```

## 运行示例

```bash
# 安装依赖
npm install

# 运行示例
node example.js

# 访问指标端点
curl http://localhost:9090/metrics

# 访问健康检查端点
curl http://localhost:9090/health
```

## 输出示例

```
[ ] Create task
[x] Assign to agent
[>] Execute task (Executing task)
[ ] Complete task

(2/4 completed)

=== Statistics ===
Todo: { total: 4, pending: 1, inProgress: 1, completed: 2 }
Tasks: { total: 1, pending: 0, inProgress: 1, completed: 0 }
Agents: { totalAgents: 1, idleAgents: 0, workingAgents: 1 }
Health: healthy
```

## 相关文档

- [API Reference](../docs/v4.3-api-reference.md)
- [Usage Guide](../docs/v4.3-usage-guide.md)
